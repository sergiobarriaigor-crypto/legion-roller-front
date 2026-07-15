"use client";

import { IconX, IconTrash, IconVolume } from "@tabler/icons-react";
import type { EcoEnHistoria } from "@/lib/historias";
import { tiempoTranscurrido } from "@/lib/tiempo";
import { useSession } from "@/context/SessionContext";
import { Avatar } from "@/components/Avatar";

// Panel de solo lectura (+ borrado) para ver TODOS los Ecos de la historia —
// no tiene hilo de respuestas ni reacciones propias, ni caja para escribir
// (eso ya está en el campo de mensaje de VisorHistorias, con el selector
// Comentario/Eco). Recibe la lista ya cargada por VisorHistorias en vez de
// pedirla de nuevo, porque esta es la misma lista que se muestra fija sobre
// la imagen.
export function PanelEcosHistoria({
  historiaAutorId,
  ecos,
  onEliminar,
  onCerrar,
}: {
  historiaAutorId: number;
  ecos: EcoEnHistoria[];
  onEliminar: (ecoId: number) => void;
  onCerrar: () => void;
}) {
  const { sesion } = useSession();

  function puedeEliminar(e: EcoEnHistoria) {
    return sesion?.id === e.miembroId || sesion?.id === historiaAutorId || sesion?.rol === "admin";
  }

  return (
    <div className="absolute inset-0 z-30" data-no-swipe>
      <div className="absolute inset-0 bg-black/60" onClick={onCerrar} aria-hidden />
      <div className="absolute inset-x-0 bottom-0 flex max-h-[70%] flex-col rounded-t-2xl bg-[#161616] shadow-[0_-8px_30px_rgba(0,0,0,0.5)]">
        <div className="flex justify-center pb-1 pt-2">
          <span className="h-1 w-10 rounded-full bg-white/20" />
        </div>
        <div className="flex items-center justify-between border-b border-white/10 px-3 pb-3">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-white">
            <IconVolume size={16} className="text-fill-primary" />
            {ecos.length} {ecos.length === 1 ? "eco" : "ecos"}
          </div>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="text-white">
            <IconX size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 pb-3">
          {ecos.length === 0 ? (
            <p className="px-3 py-2 text-sm text-white/50">Todavía no hay ecos.</p>
          ) : (
            ecos.map((e) => (
              <div key={e.id} className="flex items-start gap-3 rounded-xl px-3 py-2">
                <Avatar fotoUrl={e.fotoUrl} nombre={e.nombre} tamano={32} />
                <div className="flex flex-1 flex-col">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-semibold text-white">{e.nombre}</span>
                    <span className="text-[11px] text-white/50">{tiempoTranscurrido(e.createdAt)}</span>
                  </div>
                  <span className="text-sm text-white/80">{e.texto}</span>
                  {puedeEliminar(e) && (
                    <button
                      type="button"
                      onClick={() => onEliminar(e.id)}
                      aria-label="Eliminar eco"
                      className="mt-1 flex w-fit items-center gap-1 text-xs font-semibold text-white/50"
                    >
                      <IconTrash size={13} />
                      Eliminar
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
