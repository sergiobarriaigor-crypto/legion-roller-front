"use client";

import { useEffect, useState } from "react";
import { IconX, IconTrash, IconHeart } from "@tabler/icons-react";
import {
  listarResenas,
  crearResena,
  eliminarResena,
  reaccionarResena,
  type ResenaEmprendedorDetalle,
} from "@/lib/emprendedores";
import { tiempoTranscurrido } from "@/lib/tiempo";
import { primerNombre, separarMencion } from "@/lib/texto";
import { useSession } from "@/context/SessionContext";
import { Avatar } from "@/components/Avatar";

// Reseñas de una ficha de emprendedor — mismo comportamiento que
// ComentariosPost.tsx: visible para cualquiera (no es un inbox privado del
// dueño), hilo de un nivel (Responder, con "@Nombre" para sub-respuestas) y
// corazón por reseña. Se muestra en línea, debajo de la tarjeta.
export function ComentariosEmprendedor({
  emprendedorId,
  fichaDuenioId,
  resenaDestacadaId,
  token,
  onCerrar,
}: {
  emprendedorId: number;
  fichaDuenioId: number;
  // Deep-link desde la notificación de "te respondieron una reseña": una vez
  // que el hilo carga, se hace scroll hasta acá y se resalta un momento.
  resenaDestacadaId?: number | null;
  token: string | null;
  onCerrar: () => void;
}) {
  const { sesion } = useSession();
  const [resenas, setResenas] = useState<ResenaEmprendedorDetalle[] | null>(null);
  const [texto, setTexto] = useState("");
  // `id` siempre es la raíz del hilo (no la reseña que se está respondiendo)
  // — mismo patrón que ComentariosPost.tsx.
  const [respondiendoA, setRespondiendoA] = useState<{ id: number; nombre: string; mencion: boolean } | null>(
    null,
  );

  useEffect(() => {
    listarResenas(emprendedorId, token)
      .then(setResenas)
      .catch(() => setResenas([]));
  }, [emprendedorId, token]);

  useEffect(() => {
    if (!resenaDestacadaId || !resenas) return;
    document.getElementById(`resena-emprendedor-${resenaDestacadaId}`)?.scrollIntoView({ block: "center" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resenas !== null, resenaDestacadaId]);

  async function enviar() {
    const contenido = texto.trim();
    if (!contenido || !token) return;
    try {
      const textoFinal = respondiendoA?.mencion
        ? `@${primerNombre(respondiendoA.nombre)} ${contenido}`
        : contenido;
      const nueva = await crearResena(emprendedorId, textoFinal, respondiendoA?.id, token);
      setResenas((prev) => (prev ? [...prev, nueva] : prev));
      setTexto("");
      setRespondiendoA(null);
    } catch {
      // Sin feedback elaborado: si falla, el usuario puede reintentar.
    }
  }

  async function eliminar(resenaId: number) {
    if (!token) return;
    try {
      await eliminarResena(emprendedorId, resenaId, token);
      setResenas(
        (prev) => prev?.filter((r) => r.id !== resenaId && r.respuestaAId !== resenaId) ?? prev,
      );
    } catch {
      // Sin feedback elaborado: si falla, la reseña simplemente sigue ahí.
    }
  }

  async function reaccionar(resenaId: number) {
    if (!token) return;
    try {
      const { reaccionesCount, miReaccion } = await reaccionarResena(resenaId, token);
      setResenas(
        (prev) => prev?.map((r) => (r.id === resenaId ? { ...r, reaccionesCount, miReaccion } : r)) ?? prev,
      );
    } catch {
      // Sin feedback elaborado: el corazón simplemente no cambia.
    }
  }

  function puedeEliminar(r: ResenaEmprendedorDetalle) {
    return sesion?.id === r.miembroId || sesion?.id === fichaDuenioId || sesion?.rol === "admin";
  }

  const resenasRaiz = resenas?.filter((r) => !r.respuestaAId) ?? [];
  function respuestasDe(id: number) {
    return resenas?.filter((r) => r.respuestaAId === id) ?? [];
  }

  function Fila({ r, esRespuesta }: { r: ResenaEmprendedorDetalle; esRespuesta?: boolean }) {
    const destacado = r.id === resenaDestacadaId;
    const { mencion, resto } = separarMencion(r.texto);
    return (
      <div
        id={`resena-emprendedor-${r.id}`}
        className={`flex items-start gap-2 rounded-app px-2 py-1.5 transition-colors ${esRespuesta ? "ml-8 mt-1" : ""} ${
          destacado ? "bg-fill-primary/15 ring-1 ring-fill-primary/50" : ""
        }`}
      >
        <Avatar fotoUrl={r.fotoUrl} nombre={r.nombre} tamano={esRespuesta ? 24 : 28} />
        <div className="flex flex-1 flex-col">
          <p className="text-xs text-text-secondary">
            <span className="font-semibold text-text-primary">{r.nombre}:</span>{" "}
            {mencion && <span className="font-semibold text-text-accent">{mencion} </span>}
            {resto}
          </p>
          <div className="mt-0.5 flex items-center gap-3 text-[11px] text-text-muted">
            <span>{tiempoTranscurrido(r.createdAt)}</span>
            <button
              type="button"
              onClick={() => reaccionar(r.id)}
              className={`flex items-center gap-1 font-semibold ${r.miReaccion ? "text-fill-primary" : ""}`}
            >
              <IconHeart size={12} fill={r.miReaccion ? "currentColor" : "none"} />
              {r.reaccionesCount > 0 && r.reaccionesCount}
            </button>
            <button
              type="button"
              onClick={() =>
                setRespondiendoA({ id: r.respuestaAId ?? r.id, nombre: r.nombre, mencion: !!r.respuestaAId })
              }
              className="font-semibold"
            >
              Responder
            </button>
            {puedeEliminar(r) && (
              <button
                type="button"
                onClick={() => eliminar(r.id)}
                aria-label="Eliminar reseña"
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
        <span className="text-xs font-semibold text-text-accent">{resenas?.length ?? 0} reseñas</span>
        <button type="button" onClick={onCerrar} aria-label="Cerrar reseñas" className="text-text-muted">
          <IconX size={16} />
        </button>
      </div>

      <div className="flex flex-col gap-1">
        {resenas === null ? (
          <p className="text-xs text-text-secondary">Cargando...</p>
        ) : resenasRaiz.length === 0 ? (
          <p className="text-xs text-text-secondary">Todavía nadie dejó una reseña.</p>
        ) : (
          resenasRaiz.map((r) => (
            <div key={r.id}>
              <Fila r={r} />
              {respuestasDe(r.id).map((resp) => (
                <Fila key={resp.id} r={resp} esRespuesta />
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
            placeholder={respondiendoA ? "Escribe una respuesta..." : "Escribe una reseña..."}
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
    </div>
  );
}
