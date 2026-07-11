"use client";

import { IconX } from "@tabler/icons-react";
import type { Historia } from "@/lib/historias";

// Ventana emergente que aparece al tocar una notificación de mención en la
// campana — vista previa de la historia + la decisión de republicarla o no.
export function PopupMencion({
  historia,
  enviando,
  onResponder,
  onCerrar,
}: {
  historia: Historia;
  enviando: boolean;
  onResponder: (aceptar: boolean) => void;
  onCerrar: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6">
      <div className="card w-full max-w-xs overflow-hidden p-0">
        <div className="flex items-center justify-between px-4 pt-3">
          <h3 className="text-sm font-semibold text-text-primary">Te mencionaron</h3>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="text-text-secondary">
            <IconX size={18} />
          </button>
        </div>
        <p className="px-4 pb-3 pt-1 text-sm text-text-secondary">
          <strong className="text-text-primary">{historia.autorNombre}</strong> te ha mencionado en
          una historia.
        </p>

        <div className="relative max-h-64 w-full bg-black">
          {historia.tipo === "video" ? (
            <video
              src={historia.mediaUrl}
              className="mx-auto max-h-64 w-auto object-contain"
              muted
              playsInline
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={historia.mediaUrl}
              alt="Vista previa de la historia"
              className="mx-auto max-h-64 w-auto object-contain"
            />
          )}
        </div>

        <div className="flex flex-col gap-2 p-4">
          <button
            type="button"
            disabled={enviando}
            onClick={() => onResponder(true)}
            className="btn-hero rounded-app px-4 py-2 text-sm disabled:opacity-60"
          >
            Republicar en mi historia
          </button>
          <button
            type="button"
            disabled={enviando}
            onClick={() => onResponder(false)}
            className="rounded-app border border-border px-4 py-2 text-sm text-text-secondary disabled:opacity-60"
          >
            No, gracias
          </button>
        </div>
      </div>
    </div>
  );
}
