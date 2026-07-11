"use client";

import { useEffect, useState } from "react";
import { IconX, IconTrash } from "@tabler/icons-react";
import {
  listarReaccionesHistoria,
  listarComentariosHistoria,
  eliminarComentarioHistoria,
  type ReaccionHistoriaDetalle,
  type ComentarioHistoriaDetalle,
} from "@/lib/historias";
import { obtenerSocket } from "@/lib/socket";
import { tiempoTranscurrido } from "@/lib/tiempo";
import { useSession } from "@/context/SessionContext";
import { Avatar } from "@/components/Avatar";

type Vista = "reacciones" | "comentarios";

// Panel único para reacciones y comentarios de una historia — visible para
// cualquiera (no es un inbox privado del autor), con hilos de un nivel
// (Responder) y borrado disponible para el autor del comentario o el dueño
// de la historia. Escucha el mismo socket que ya usa VisorHistorias para las
// burbujas flotantes, así que un comentario nuevo aparece acá al toque.
export function PanelSocialHistoria({
  historiaId,
  historiaAutorId,
  vistaInicial,
  token,
  onCerrar,
}: {
  historiaId: number;
  historiaAutorId: number;
  vistaInicial: Vista;
  token: string | null;
  onCerrar: () => void;
}) {
  const { sesion } = useSession();
  const [vista, setVista] = useState<Vista>(vistaInicial);
  const [reacciones, setReacciones] = useState<ReaccionHistoriaDetalle[] | null>(null);
  const [comentarios, setComentarios] = useState<ComentarioHistoriaDetalle[] | null>(null);
  const [texto, setTexto] = useState("");
  const [respondiendoA, setRespondiendoA] = useState<{ id: number; nombre: string } | null>(null);

  useEffect(() => {
    listarReaccionesHistoria(historiaId, token)
      .then(setReacciones)
      .catch(() => setReacciones([]));
    listarComentariosHistoria(historiaId, token)
      .then(setComentarios)
      .catch(() => setComentarios([]));
  }, [historiaId, token]);

  // Mientras el panel está abierto, un comentario nuevo (propio o de otro
  // viendo la misma historia) se agrega solo, sin tener que cerrar y volver
  // a abrir — mismo socket compartido que usa la cola de burbujas flotantes.
  useEffect(() => {
    if (!token) return;
    const socket = obtenerSocket(token);
    function alRecibirComentario(data: ComentarioHistoriaDetalle) {
      setComentarios((prev) => (prev ? [...prev, data] : prev));
    }
    socket.on("historia:mensaje", alRecibirComentario);
    return () => {
      socket.off("historia:mensaje", alRecibirComentario);
    };
  }, [token]);

  function enviar() {
    const contenido = texto.trim();
    if (!contenido || !token) return;
    obtenerSocket(token).emit("historia:mensaje", {
      historiaId,
      texto: contenido,
      respuestaAId: respondiendoA?.id,
    });
    setTexto("");
    setRespondiendoA(null);
  }

  async function eliminar(comentarioId: number) {
    if (!token) return;
    try {
      await eliminarComentarioHistoria(historiaId, comentarioId, token);
      setComentarios(
        (prev) => prev?.filter((c) => c.id !== comentarioId && c.respuestaAId !== comentarioId) ?? prev,
      );
    } catch {
      // Sin feedback elaborado: si falla, el comentario simplemente sigue ahí.
    }
  }

  function puedeEliminar(c: ComentarioHistoriaDetalle) {
    return sesion?.id === c.miembroId || sesion?.id === historiaAutorId || sesion?.rol === "admin";
  }

  const comentariosRaiz = comentarios?.filter((c) => !c.respuestaAId) ?? [];
  function respuestasDe(id: number) {
    return comentarios?.filter((c) => c.respuestaAId === id) ?? [];
  }

  function Fila({ c, esRespuesta }: { c: ComentarioHistoriaDetalle; esRespuesta?: boolean }) {
    return (
      <div className={`flex items-start gap-3 px-3 py-2 ${esRespuesta ? "ml-9 mt-1" : ""}`}>
        <Avatar fotoUrl={c.fotoUrl} nombre={c.nombre} tamano={esRespuesta ? 26 : 32} />
        <div className="flex flex-1 flex-col">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-semibold text-white">{c.nombre}</span>
            <span className="text-[11px] text-white/50">{tiempoTranscurrido(c.createdAt)}</span>
          </div>
          <span className="text-sm text-white/80">{c.texto}</span>
          <div className="mt-1 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setRespondiendoA({ id: c.id, nombre: c.nombre })}
              className="text-xs font-semibold text-white/50"
            >
              Responder
            </button>
            {puedeEliminar(c) && (
              <button
                type="button"
                onClick={() => eliminar(c.id)}
                aria-label="Eliminar comentario"
                className="flex items-center gap-1 text-xs font-semibold text-white/50"
              >
                <IconTrash size={13} />
                Eliminar
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-black/90" data-no-swipe>
      <div className="flex items-center justify-between border-b border-white/10 p-3">
        <div className="flex gap-4">
          <button
            type="button"
            onClick={() => setVista("reacciones")}
            className={`flex items-center gap-1.5 text-sm font-semibold ${
              vista === "reacciones" ? "text-white" : "text-white/40"
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/corazon2.png" alt="" className="h-4 w-4" />
            {reacciones?.length ?? 0}
          </button>
          <button
            type="button"
            onClick={() => setVista("comentarios")}
            className={`text-sm font-semibold ${vista === "comentarios" ? "text-white" : "text-white/40"}`}
          >
            {comentarios?.length ?? 0} comentarios
          </button>
        </div>
        <button type="button" onClick={onCerrar} aria-label="Cerrar" className="text-white">
          <IconX size={20} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {vista === "reacciones" ? (
          reacciones === null ? (
            <p className="px-3 py-2 text-sm text-white/50">Cargando...</p>
          ) : reacciones.length === 0 ? (
            <p className="px-3 py-2 text-sm text-white/50">Todavía nadie reaccionó.</p>
          ) : (
            reacciones.map((r) => (
              <div key={r.miembroId} className="flex items-center gap-3 px-3 py-2">
                <Avatar fotoUrl={r.fotoUrl} nombre={r.nombre} tamano={32} />
                <div className="flex flex-col">
                  <span className="text-sm text-white">{r.nombre}</span>
                  <span className="text-[11px] text-white/50">{tiempoTranscurrido(r.createdAt)}</span>
                </div>
              </div>
            ))
          )
        ) : comentarios === null ? (
          <p className="px-3 py-2 text-sm text-white/50">Cargando...</p>
        ) : comentariosRaiz.length === 0 ? (
          <p className="px-3 py-2 text-sm text-white/50">Todavía nadie comentó.</p>
        ) : (
          comentariosRaiz.map((c) => (
            <div key={c.id}>
              <Fila c={c} />
              {respuestasDe(c.id).map((r) => (
                <Fila key={r.id} c={r} esRespuesta />
              ))}
            </div>
          ))
        )}
      </div>

      {vista === "comentarios" && (
        <div className="border-t border-white/10 p-3" data-no-swipe>
          {respondiendoA && (
            <div className="mb-2 flex items-center gap-2 text-xs text-white/60">
              Respondiendo a <span className="font-semibold text-white">{respondiendoA.nombre}</span>
              <button type="button" onClick={() => setRespondiendoA(null)} aria-label="Cancelar respuesta">
                <IconX size={14} />
              </button>
            </div>
          )}
          <div className="flex items-center gap-2">
            <input
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") enviar();
              }}
              placeholder={respondiendoA ? "Escribe una respuesta..." : "Escribe un comentario..."}
              maxLength={300}
              className="h-11 flex-1 rounded-full border border-white/30 bg-black/40 px-4 text-sm text-white outline-none transition placeholder:text-white/50 focus:border-fill-primary focus:shadow-[0_0_12px_rgba(231,193,104,0.6)]"
            />
            <button
              type="button"
              onClick={enviar}
              disabled={!texto.trim()}
              aria-label="Enviar comentario"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-black/60 text-sm font-semibold text-fill-primary transition disabled:opacity-40"
            >
              ➤
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
