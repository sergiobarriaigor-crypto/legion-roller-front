"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import { obtenerSocket } from "@/lib/socket";
import {
  listarMensajes,
  enviarMensaje as apiEnviarMensaje,
  eliminarMensaje as apiEliminarMensaje,
  reaccionarMensaje as apiReaccionarMensaje,
  reenviarMensaje as apiReenviarMensaje,
  lecturaDeSala,
  type MensajeChat,
  type EnviarMensajeBody,
  type EventoEscribiendo,
  type EventoLectura,
  type EventoReaccion,
  type EventoMensajeEliminado,
  type CursorLectura,
} from "@/lib/chat";

const PATRON_SALA_INDIVIDUAL = /^dm-(\d+)-(\d+)$/;
const MS_EXPIRA_ESCRIBIENDO = 4000;

function otroIdDeSala(sala: string, propioId: number | null): number | null {
  const match = PATRON_SALA_INDIVIDUAL.exec(sala);
  if (!match || propioId === null) return null;
  const a = Number(match[1]);
  const b = Number(match[2]);
  return a === propioId ? b : a;
}

export type EstadoEnvio = "enviado" | "entregado" | "leido";

interface CursorOtro {
  leidoHasta: Date;
  entregadoHasta: Date | null;
}

// Motor compartido de una conversación (mensajes en vivo, escribiendo, ticks,
// reacciones, respuesta/reenvío/eliminación) — usado tanto por la página
// completa de chat como por ChatFlotante (en modo compacto, ver ese archivo).
export function useConversacion({
  sala,
  token,
  propioId,
}: {
  sala: string;
  token: string | null;
  propioId: number | null;
}) {
  const [mensajes, setMensajes] = useState<MensajeChat[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [escribiendo, setEscribiendo] = useState<{ miembroId: number; nombre: string } | null>(
    null,
  );
  const [respondiendoA, setRespondiendoA] = useState<MensajeChat | null>(null);
  const [cursorOtro, setCursorOtro] = useState<CursorOtro | null>(null);

  const idsConocidosRef = useRef<Set<number>>(new Set());
  const escribiendoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const otroId = useMemo(() => otroIdDeSala(sala, propioId), [sala, propioId]);
  const esDm = otroId !== null;

  const cargar = useCallback(async () => {
    if (!token) return;
    setCargando(true);
    setError("");
    try {
      const [lista, cursores] = await Promise.all([
        listarMensajes(sala, token),
        esDm ? lecturaDeSala(sala, token) : Promise.resolve<CursorLectura[]>([]),
      ]);
      idsConocidosRef.current = new Set(lista.map((m) => m.id));
      setMensajes(lista);
      const cursor = esDm ? cursores.find((c) => c.miembroId === otroId) : undefined;
      setCursorOtro(
        cursor
          ? {
              leidoHasta: new Date(cursor.leidoHasta),
              entregadoHasta: cursor.entregadoHasta ? new Date(cursor.entregadoHasta) : null,
            }
          : null,
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cargar la conversación.");
    } finally {
      setCargando(false);
    }
  }, [sala, token, esDm, otroId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRespondiendoA(null);
    setEscribiendo(null);
    cargar();
  }, [cargar]);

  useEffect(() => {
    if (!token) return;
    const socket = obtenerSocket(token);
    socket.emit("chat:unirse", sala);

    function onMensaje(m: MensajeChat) {
      if (m.sala !== sala) return;
      if (idsConocidosRef.current.has(m.id)) return;
      idsConocidosRef.current.add(m.id);
      setMensajes((prev) => [...prev, m]);
      if (m.autorId !== propioId) setEscribiendo(null);
    }

    function onEscribiendo(ev: EventoEscribiendo) {
      if (ev.sala !== sala || ev.miembroId === propioId) return;
      if (escribiendoTimeoutRef.current) clearTimeout(escribiendoTimeoutRef.current);
      if (ev.escribiendo) {
        setEscribiendo({ miembroId: ev.miembroId, nombre: ev.nombre });
        escribiendoTimeoutRef.current = setTimeout(
          () => setEscribiendo(null),
          MS_EXPIRA_ESCRIBIENDO,
        );
      } else {
        setEscribiendo(null);
      }
    }

    function onLeido(ev: EventoLectura) {
      if (ev.sala !== sala || ev.miembroId !== otroId) return;
      setCursorOtro((prev) => ({
        leidoHasta: new Date(ev.hasta),
        entregadoHasta: prev?.entregadoHasta ?? null,
      }));
    }

    function onEntregado(ev: EventoLectura) {
      if (ev.sala !== sala || ev.miembroId !== otroId) return;
      setCursorOtro((prev) => ({
        leidoHasta: prev?.leidoHasta ?? new Date(0),
        entregadoHasta: new Date(ev.hasta),
      }));
    }

    function onReaccion(ev: EventoReaccion) {
      if (ev.sala !== sala) return;
      setMensajes((prev) =>
        prev.map((m) => {
          if (m.id !== ev.mensajeId) return m;
          const sinPropia = m.reacciones.filter((r) => r.miembroId !== ev.miembroId);
          return {
            ...m,
            reacciones: ev.emoji
              ? [...sinPropia, { miembroId: ev.miembroId, emoji: ev.emoji }]
              : sinPropia,
          };
        }),
      );
    }

    function onEliminado(ev: EventoMensajeEliminado) {
      if (ev.sala !== sala) return;
      setMensajes((prev) => prev.filter((m) => m.id !== ev.mensajeId));
      setRespondiendoA((prev) => (prev?.id === ev.mensajeId ? null : prev));
    }

    socket.on("chat:mensaje", onMensaje);
    socket.on("chat:escribiendo", onEscribiendo);
    socket.on("chat:leido", onLeido);
    socket.on("chat:entregado", onEntregado);
    socket.on("chat:reaccion", onReaccion);
    socket.on("chat:mensaje-eliminado", onEliminado);

    return () => {
      socket.emit("chat:salir", sala);
      socket.off("chat:mensaje", onMensaje);
      socket.off("chat:escribiendo", onEscribiendo);
      socket.off("chat:leido", onLeido);
      socket.off("chat:entregado", onEntregado);
      socket.off("chat:reaccion", onReaccion);
      socket.off("chat:mensaje-eliminado", onEliminado);
      if (escribiendoTimeoutRef.current) clearTimeout(escribiendoTimeoutRef.current);
    };
  }, [sala, token, propioId, otroId]);

  async function enviar(body: EnviarMensajeBody) {
    if (!token) return;
    setEnviando(true);
    setError("");
    try {
      await apiEnviarMensaje(
        sala,
        { ...body, respuestaAId: body.respuestaAId ?? respondiendoA?.id },
        token,
      );
      setRespondiendoA(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo enviar el mensaje.");
    } finally {
      setEnviando(false);
    }
  }

  function notificarEscribiendo(activo: boolean) {
    if (!token) return;
    obtenerSocket(token).emit("chat:escribiendo", { sala, escribiendo: activo });
  }

  async function eliminar(mensajeId: number, modo: "todos" | "mi") {
    if (!token) return;
    try {
      await apiEliminarMensaje(mensajeId, modo, token);
      // "para todos" se refleja vía chat:mensaje-eliminado (llega también a
      // quien lo pidió); "para mí" es una vista puramente local.
      if (modo === "mi") {
        setMensajes((prev) => prev.filter((m) => m.id !== mensajeId));
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo eliminar el mensaje.");
    }
  }

  async function reaccionar(mensajeId: number, emoji: string) {
    if (!token) return;
    try {
      await apiReaccionarMensaje(mensajeId, emoji, token);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo reaccionar.");
    }
  }

  async function reenviar(mensajeId: number, destinatarioIds: number[]) {
    if (!token) return;
    await apiReenviarMensaje(mensajeId, destinatarioIds, token);
  }

  function estadoEnvio(mensaje: MensajeChat): EstadoEnvio | null {
    if (!esDm || mensaje.autorId !== propioId) return null;
    if (!cursorOtro) return "enviado";
    const creado = new Date(mensaje.createdAt).getTime();
    if (creado <= cursorOtro.leidoHasta.getTime()) return "leido";
    if (cursorOtro.entregadoHasta && creado <= cursorOtro.entregadoHasta.getTime()) {
      return "entregado";
    }
    return "enviado";
  }

  return {
    mensajes,
    cargando,
    error,
    enviando,
    escribiendo,
    respondiendoA,
    setRespondiendoA,
    enviar,
    eliminar,
    reaccionar,
    reenviar,
    notificarEscribiendo,
    estadoEnvio,
    recargar: cargar,
  };
}
