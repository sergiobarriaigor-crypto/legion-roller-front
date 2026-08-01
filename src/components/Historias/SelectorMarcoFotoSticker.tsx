"use client";

import { MARCOS_FOTO_STICKER, type MarcoFotoStickerId } from "@/lib/historias";

// Aparece al tocar (sin arrastrar) una foto-sticker ya puesta sobre la
// historia — mismo patrón visual que FiltrosFoto (chips con vista previa),
// pero eligiendo el marco en vez del color.
export function SelectorMarcoFotoSticker({
  previewUrl,
  marcoActual,
  onCambiar,
  onCerrar,
}: {
  previewUrl: string;
  marcoActual: MarcoFotoStickerId;
  onCambiar: (marco: MarcoFotoStickerId) => void;
  onCerrar: () => void;
}) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto px-0.5 pb-0.5" data-no-swipe>
      {MARCOS_FOTO_STICKER.map((m) => (
        <button
          key={m.id}
          type="button"
          onClick={() => onCambiar(m.id)}
          className="flex shrink-0 flex-col items-center gap-1"
        >
          <span
            className={`block h-14 w-14 overflow-hidden border-2 bg-cover bg-center ${
              m.id === "circular" ? "rounded-full" : "rounded-app"
            } ${marcoActual === m.id ? "border-text-accent" : "border-transparent"}`}
            style={{ backgroundImage: `url(${previewUrl})` }}
          />
          <span className={`text-[11px] ${marcoActual === m.id ? "text-text-accent" : "text-text-secondary"}`}>
            {m.nombre}
          </span>
        </button>
      ))}
      <button type="button" onClick={onCerrar} className="ml-1 shrink-0 text-xs text-text-secondary underline">
        Listo
      </button>
    </div>
  );
}
