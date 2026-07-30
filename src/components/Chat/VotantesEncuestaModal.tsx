"use client";

import { IconX } from "@tabler/icons-react";
import { Avatar } from "@/components/Avatar";
import type { VotanteEncuesta } from "@/lib/chat";

// Lista de quién votó por una alternativa — solo se abre cuando la encuesta
// no es anónima (ver BurbujaMensaje.tsx). Mismo patrón visual de hoja
// inferior que los demás selectores/modales del chat.
export function VotantesEncuestaModal({
  opcionTexto,
  votantes,
  onCerrar,
}: {
  opcionTexto: string;
  votantes: VotanteEncuesta[];
  onCerrar: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50" data-no-swipe>
      <div className="absolute inset-0 bg-black/75" onClick={onCerrar} aria-hidden />
      <div className="absolute inset-x-0 bottom-0 flex max-h-[70%] flex-col rounded-t-2xl bg-surface-2 shadow-[0_-8px_30px_rgba(0,0,0,0.5)]">
        <div className="flex justify-center pb-1 pt-2">
          <span className="h-1 w-10 rounded-full bg-white/20" />
        </div>
        <div className="flex items-center justify-between border-b border-border px-3 pb-3">
          <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-text-primary">
            Votaron: {opcionTexto}
          </h3>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="shrink-0 text-text-secondary"
          >
            <IconX size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {votantes.length === 0 ? (
            <p className="text-xs text-text-secondary">Nadie votó esta opción todavía.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {votantes.map((v) => (
                <div key={v.id} className="flex items-center gap-3">
                  <Avatar fotoUrl={v.fotoUrl} nombre={v.nombre} tamano={36} />
                  <span className="text-sm text-text-primary">{v.nombre}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
