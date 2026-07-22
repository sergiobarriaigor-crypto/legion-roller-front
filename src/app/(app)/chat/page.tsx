"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "@/context/SessionContext";
import { apiGet, ApiError } from "@/lib/api";
import { obtenerSocket } from "@/lib/socket";
import {
  salaIndividual,
  type Conversaciones,
  type EventoPresencia,
  type MiembroSimple,
} from "@/lib/chat";
import { Avatar } from "@/components/Avatar";

const MS_POLL_RESPALDO = 30000;

function horaMensaje(createdAt: string): string {
  return new Date(createdAt).toLocaleTimeString("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ChatListaPage() {
  const { sesion } = useSession();
  const token = sesion?.token ?? null;

  const [conversaciones, setConversaciones] = useState<Conversaciones | null>(null);
  const [enLinea, setEnLinea] = useState<Record<number, boolean>>({});
  const [miembros, setMiembros] = useState<MiembroSimple[]>([]);
  const [mostrarNuevo, setMostrarNuevo] = useState(false);
  const [error, setError] = useState("");

  async function cargar() {
    if (!token) return;
    try {
      const datos = await apiGet<Conversaciones>("/chat/conversaciones", token);
      setConversaciones(datos);
      setEnLinea((prev) => {
        const siguiente = { ...prev };
        for (const c of datos.individuales) {
          if (!(c.otroMiembroId in siguiente)) siguiente[c.otroMiembroId] = c.otroEnLinea;
        }
        return siguiente;
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cargar el chat.");
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargar();
    // el socket empuja actualizaciones en vivo (ver más abajo); este intervalo
    // es solo un respaldo por si el socket se cae, mucho menos agresivo que
    // el polling de 15s que tenía antes.
    const intervalo = setInterval(cargar, MS_POLL_RESPALDO);
    return () => clearInterval(intervalo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!token) return;
    const socket = obtenerSocket(token);

    function onCambio() {
      cargar();
    }

    function onPresencia(ev: EventoPresencia) {
      setEnLinea((prev) => ({ ...prev, [ev.miembroId]: ev.enLinea }));
    }

    socket.on("chat:mensaje", onCambio);
    socket.on("chat:leido", onCambio);
    socket.on("chat:mensaje-eliminado", onCambio);
    socket.on("chat:presencia", onPresencia);
    return () => {
      socket.off("chat:mensaje", onCambio);
      socket.off("chat:leido", onCambio);
      socket.off("chat:mensaje-eliminado", onCambio);
      socket.off("chat:presencia", onPresencia);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function abrirNuevo() {
    if (!token) return;
    try {
      const lista = await apiGet<MiembroSimple[]>("/chat/miembros", token);
      setMiembros(lista.filter((m) => m.id !== sesion?.id));
      setMostrarNuevo(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cargar la lista de miembros.");
    }
  }

  if (!conversaciones) {
    return <p className="text-sm text-text-secondary">Cargando...</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-lg font-semibold text-text-accent">Chat</h1>

      {error && <p className="text-xs text-fill-warning">{error}</p>}

      <Link href="/chat/grupal" className="card flex items-center gap-3 p-4">
        <Avatar fotoUrl="/avatar-chat-grupal.png" nombre="Legión" tamano={44} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-text-primary">Chat grupal</p>
          {conversaciones.grupal.ultimoMensaje && (
            <p className="truncate text-xs text-text-secondary">
              {conversaciones.grupal.ultimoMensaje.autorNombre}:{" "}
              {conversaciones.grupal.ultimoMensaje.texto}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {conversaciones.grupal.ultimoMensaje && (
            <span className="text-[10px] text-text-muted">
              {horaMensaje(conversaciones.grupal.ultimoMensaje.createdAt)}
            </span>
          )}
          {conversaciones.grupal.noLeidos > 0 && (
            <span className="rounded-full bg-fill-primary px-2 py-0.5 text-xs text-on-primary">
              {conversaciones.grupal.noLeidos}
            </span>
          )}
        </div>
      </Link>

      {conversaciones.individuales.map((c) => (
        <Link key={c.sala} href={`/chat/${c.sala}`} className="card flex items-center gap-3 p-4">
          <Avatar fotoUrl={c.otroFotoUrl} nombre={c.otroNombre} tamano={44}>
            {(enLinea[c.otroMiembroId] ?? c.otroEnLinea) && (
              <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-page-bg bg-fill-success" />
            )}
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-text-primary">{c.otroNombre}</p>
            {c.ultimoMensaje && (
              <p className="truncate text-xs text-text-secondary">{c.ultimoMensaje.texto}</p>
            )}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            {c.ultimoMensaje && (
              <span className="text-[10px] text-text-muted">
                {horaMensaje(c.ultimoMensaje.createdAt)}
              </span>
            )}
            {c.noLeidos > 0 && (
              <span className="rounded-full bg-fill-primary px-2 py-0.5 text-xs text-on-primary">
                {c.noLeidos}
              </span>
            )}
          </div>
        </Link>
      ))}

      {!mostrarNuevo ? (
        <button type="button" onClick={abrirNuevo} className="btn-hero rounded-app px-4 py-2 text-sm">
          Nuevo chat
        </button>
      ) : (
        <div className="card flex flex-col gap-2 p-4">
          <p className="text-sm font-semibold text-text-primary">Elige con quién chatear</p>
          {miembros.map((m) => (
            <Link
              key={m.id}
              href={`/chat/${salaIndividual(sesion!.id!, m.id)}`}
              className="text-sm text-text-secondary underline"
            >
              {m.nombre}
            </Link>
          ))}
          <button
            type="button"
            onClick={() => setMostrarNuevo(false)}
            className="text-xs text-text-secondary underline"
          >
            Cancelar
          </button>
        </div>
      )}
    </div>
  );
}
