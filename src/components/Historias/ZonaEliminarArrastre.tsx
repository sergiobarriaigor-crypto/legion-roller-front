"use client";

import { IconTrash } from "@tabler/icons-react";

// Fracción de la altura del contenedor (0..1) a partir de la cual soltar una
// foto-sticker o mención la elimina — mismo umbral que usan ambos componentes
// para decidir cuándo avisar que están "sobre el tacho", así el ícono
// decorativo de acá coincide con la zona real donde se activa el borrado.
export const UMBRAL_TACHO_Y_FRACCION = 0.85;

// Ícono de tacho que aparece al arrastrar una foto-sticker o mención hacia
// abajo (estilo Instagram) — puramente visual, la lógica de "¿se soltó
// encima?" vive en cada componente arrastrable, que comparte el mismo umbral.
export function ZonaEliminarArrastre({ activo, sobreTacho }: { activo: boolean; sobreTacho: boolean }) {
  return (
    <div
      className={`pointer-events-none absolute inset-x-0 bottom-6 z-30 flex justify-center transition-opacity duration-150 ${
        activo ? "opacity-100" : "opacity-0"
      }`}
    >
      <div
        className={`flex items-center justify-center rounded-full transition-all duration-150 ${
          sobreTacho ? "h-16 w-16 bg-fill-warning text-on-primary" : "h-14 w-14 bg-black/60 text-white"
        }`}
      >
        <IconTrash size={sobreTacho ? 26 : 22} />
      </div>
    </div>
  );
}
