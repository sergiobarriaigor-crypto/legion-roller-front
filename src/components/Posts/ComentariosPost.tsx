"use client";

import { useEffect, useState } from "react";
import { IconX, IconTrash, IconHeart } from "@tabler/icons-react";
import {
  listarReaccionesPost,
  listarComentariosPost,
  crearComentarioPost,
  eliminarComentarioPost,
  reaccionarComentarioPost,
  type ReaccionPostDetalle,
  type ComentarioPostDetalle,
} from "@/lib/posts";
import { tiempoTranscurrido } from "@/lib/tiempo";
import { useSession } from "@/context/SessionContext";
import { Avatar } from "@/components/Avatar";

type Vista = "reacciones" | "comentarios";

// Sección de comentarios de un post — visible para cualquiera (no es un
// inbox privado del autor), con hilos de un nivel (Responder) y corazón por
// comentario. Se muestra en línea, debajo del post (mismo lugar donde antes
// vivía la lista plana), no como un panel/hoja flotante — así se mantiene el
// mismo look del resto del feed.
export function ComentariosPost({
  postId,
  postAutorId,
  vistaInicial,
  comentarioDestacadoId,
  token,
  onCerrar,
}: {
  postId: number;
  postAutorId: number;
  vistaInicial: Vista;
  // Deep-link desde la notificación de "te respondieron un comentario": una
  // vez que el hilo carga, se hace scroll hasta acá y se resalta un momento.
  comentarioDestacadoId?: number | null;
  token: string | null;
  onCerrar: () => void;
}) {
  const { sesion } = useSession();
  const [vista, setVista] = useState<Vista>(vistaInicial);
  const [reacciones, setReacciones] = useState<ReaccionPostDetalle[] | null>(null);
  const [comentarios, setComentarios] = useState<ComentarioPostDetalle[] | null>(null);
  const [texto, setTexto] = useState("");
  const [respondiendoA, setRespondiendoA] = useState<{ id: number; nombre: string } | null>(null);

  useEffect(() => {
    listarReaccionesPost(postId, token)
      .then(setReacciones)
      .catch(() => setReacciones([]));
    listarComentariosPost(postId, token)
      .then(setComentarios)
      .catch(() => setComentarios([]));
  }, [postId, token]);

  // Apenas carga el hilo, se hace scroll hasta la respuesta que originó la
  // notificación (el resaltado en sí lo hace la clase condicional en <Fila>).
  useEffect(() => {
    if (!comentarioDestacadoId || !comentarios) return;
    document.getElementById(`comentario-post-${comentarioDestacadoId}`)?.scrollIntoView({ block: "center" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comentarios !== null, comentarioDestacadoId]);

  async function enviar() {
    const contenido = texto.trim();
    if (!contenido || !token) return;
    try {
      const nuevo = await crearComentarioPost(postId, contenido, respondiendoA?.id, token);
      setComentarios((prev) => (prev ? [...prev, nuevo] : prev));
      setTexto("");
      setRespondiendoA(null);
    } catch {
      // Sin feedback elaborado: si falla, el usuario puede reintentar.
    }
  }

  async function eliminar(comentarioId: number) {
    if (!token) return;
    try {
      await eliminarComentarioPost(postId, comentarioId, token);
      setComentarios(
        (prev) => prev?.filter((c) => c.id !== comentarioId && c.respuestaAId !== comentarioId) ?? prev,
      );
    } catch {
      // Sin feedback elaborado: si falla, el comentario simplemente sigue ahí.
    }
  }

  async function reaccionarComentario(comentarioId: number) {
    if (!token) return;
    try {
      const { reaccionesCount, miReaccion } = await reaccionarComentarioPost(comentarioId, token);
      setComentarios(
        (prev) => prev?.map((c) => (c.id === comentarioId ? { ...c, reaccionesCount, miReaccion } : c)) ?? prev,
      );
    } catch {
      // Sin feedback elaborado: el corazón simplemente no cambia.
    }
  }

  function puedeEliminar(c: ComentarioPostDetalle) {
    return sesion?.id === c.miembroId || sesion?.id === postAutorId || sesion?.rol === "admin";
  }

  const comentariosRaiz = comentarios?.filter((c) => !c.respuestaAId) ?? [];
  function respuestasDe(id: number) {
    return comentarios?.filter((c) => c.respuestaAId === id) ?? [];
  }

  function Fila({ c, esRespuesta }: { c: ComentarioPostDetalle; esRespuesta?: boolean }) {
    const destacado = c.id === comentarioDestacadoId;
    return (
      <div
        id={`comentario-post-${c.id}`}
        className={`flex items-start gap-2 rounded-app px-2 py-1.5 transition-colors ${esRespuesta ? "ml-8 mt-1" : ""} ${
          destacado ? "bg-fill-primary/15 ring-1 ring-fill-primary/50" : ""
        }`}
      >
        <Avatar fotoUrl={c.fotoUrl} nombre={c.nombre} tamano={esRespuesta ? 24 : 28} />
        <div className="flex flex-1 flex-col">
          <p className="text-xs text-text-secondary">
            <span className="font-semibold text-text-primary">{c.nombre}:</span> {c.texto}
          </p>
          <div className="mt-0.5 flex items-center gap-3 text-[11px] text-text-muted">
            <span>{tiempoTranscurrido(c.createdAt)}</span>
            <button
              type="button"
              onClick={() => reaccionarComentario(c.id)}
              className={`flex items-center gap-1 font-semibold ${c.miReaccion ? "text-fill-primary" : ""}`}
            >
              <IconHeart size={12} fill={c.miReaccion ? "currentColor" : "none"} />
              {c.reaccionesCount > 0 && c.reaccionesCount}
            </button>
            <button type="button" onClick={() => setRespondiendoA({ id: c.id, nombre: c.nombre })} className="font-semibold">
              Responder
            </button>
            {puedeEliminar(c) && (
              <button
                type="button"
                onClick={() => eliminar(c.id)}
                aria-label="Eliminar comentario"
                className="flex items-center gap-1 font-semibold text-fill-warning"
              >
                <IconTrash size={12} />
                Eliminar
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-2">
      <div className="flex items-center justify-between">
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setVista("comentarios")}
            className={`text-xs font-semibold ${vista === "comentarios" ? "text-text-accent" : "text-text-muted"}`}
          >
            {comentarios?.length ?? 0} comentarios
          </button>
          <button
            type="button"
            onClick={() => setVista("reacciones")}
            className={`flex items-center gap-1 text-xs font-semibold ${vista === "reacciones" ? "text-text-accent" : "text-text-muted"}`}
          >
            ☆ {reacciones?.length ?? 0}
          </button>
        </div>
        <button type="button" onClick={onCerrar} aria-label="Cerrar comentarios" className="text-text-muted">
          <IconX size={16} />
        </button>
      </div>

      {vista === "reacciones" ? (
        reacciones === null ? (
          <p className="text-xs text-text-secondary">Cargando...</p>
        ) : reacciones.length === 0 ? (
          <p className="text-xs text-text-secondary">Todavía nadie reaccionó.</p>
        ) : (
          <div className="flex flex-col gap-1">
            {reacciones.map((r) => (
              <div key={r.miembroId} className="flex items-center gap-2">
                <Avatar fotoUrl={r.fotoUrl} nombre={r.nombre} tamano={24} />
                <span className="text-xs text-text-primary">{r.nombre}</span>
                <span className="text-[11px] text-text-muted">{tiempoTranscurrido(r.createdAt)}</span>
              </div>
            ))}
          </div>
        )
      ) : (
        <div className="flex flex-col gap-1">
          {comentarios === null ? (
            <p className="text-xs text-text-secondary">Cargando...</p>
          ) : comentariosRaiz.length === 0 ? (
            <p className="text-xs text-text-secondary">Todavía nadie comentó.</p>
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

          {respondiendoA && (
            <div className="flex items-center gap-2 text-xs text-text-secondary">
              Respondiendo a <span className="font-semibold text-text-primary">{respondiendoA.nombre}</span>
              <button type="button" onClick={() => setRespondiendoA(null)} aria-label="Cancelar respuesta">
                <IconX size={12} />
              </button>
            </div>
          )}
          <div className="flex gap-2">
            <input
              type="text"
              placeholder={respondiendoA ? "Escribe una respuesta..." : "Escribe un comentario..."}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") enviar();
              }}
              maxLength={300}
              className="flex-1 rounded-app border border-border bg-surface-2 px-3 py-1 text-xs text-text-primary outline-none"
            />
            <button
              type="button"
              onClick={enviar}
              disabled={!texto.trim()}
              className="rounded-app bg-fill-primary px-3 py-1 text-xs text-on-primary disabled:opacity-50"
            >
              Enviar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
