"use client";

import {
  IconAlignCenter,
  IconAlignLeft,
  IconAlignRight,
  IconEdit,
  IconHighlight,
  IconTrash,
} from "@tabler/icons-react";
import type { EstiloTextoHistoria } from "@/lib/historias";

const FUENTES = [
  "Arial, sans-serif",
  "Georgia, 'Times New Roman', serif",
  "'Courier New', monospace",
  "Impact, 'Arial Black', sans-serif",
];

const COLORES = ["#ffffff", "#000000", "#e7c168", "#ff3b30", "#34c759", "#0a84ff", "#af52de"];

const ORDEN_FONDO: EstiloTextoHistoria["fondo"][] = ["ninguno", "oscuro", "claro"];

// Barra compacta de controles del texto sobre la imagen — todo cambia en
// tiempo real sobre la propia foto, sin abrir ventanas/modales aparte.
export function BarraTextoHistoria({
  estilo,
  onChange,
  onEditarContenido,
  onQuitar,
}: {
  estilo: EstiloTextoHistoria;
  onChange: (estilo: EstiloTextoHistoria) => void;
  onEditarContenido: () => void;
  onQuitar: () => void;
}) {
  function cambiarFuente() {
    const indiceActual = FUENTES.indexOf(estilo.fuente);
    const siguiente = FUENTES[(indiceActual + 1) % FUENTES.length];
    onChange({ ...estilo, fuente: siguiente });
  }

  function cambiarFondo() {
    const siguiente = ORDEN_FONDO[(ORDEN_FONDO.indexOf(estilo.fondo) + 1) % ORDEN_FONDO.length];
    onChange({ ...estilo, fondo: siguiente });
  }

  return (
    <div className="flex flex-col gap-2 rounded-app bg-black/60 p-2 backdrop-blur-sm">
      <div className="flex items-center justify-between gap-1.5">
        <button
          type="button"
          onClick={onEditarContenido}
          aria-label="Editar texto"
          className="flex h-8 w-8 items-center justify-center rounded-app border border-white/20 text-white"
        >
          <IconEdit size={16} />
        </button>

        <button
          type="button"
          onClick={cambiarFuente}
          aria-label="Cambiar tipografía"
          style={{ fontFamily: estilo.fuente }}
          className="flex h-8 w-8 items-center justify-center rounded-app border border-white/20 text-sm font-bold text-white"
        >
          Aa
        </button>

        <div className="flex overflow-hidden rounded-app border border-white/20">
          {(
            [
              { valor: "left" as const, icono: IconAlignLeft },
              { valor: "center" as const, icono: IconAlignCenter },
              { valor: "right" as const, icono: IconAlignRight },
            ]
          ).map(({ valor, icono: Icono }) => (
            <button
              key={valor}
              type="button"
              onClick={() => onChange({ ...estilo, alineacion: valor })}
              aria-label={`Alinear ${valor}`}
              className={`flex h-8 w-8 items-center justify-center ${estilo.alineacion === valor ? "bg-white/25" : ""}`}
            >
              <Icono size={16} className="text-white" />
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={cambiarFondo}
          aria-label="Cambiar fondo del texto"
          className={`flex h-8 w-8 items-center justify-center rounded-app border border-white/20 text-white ${estilo.fondo !== "ninguno" ? "bg-white/25" : ""}`}
        >
          <IconHighlight size={16} />
        </button>

        <button
          type="button"
          onClick={onQuitar}
          aria-label="Quitar texto"
          className="flex h-8 w-8 items-center justify-center text-fill-warning"
        >
          <IconTrash size={16} />
        </button>
      </div>

      <div className="flex items-center gap-1.5 overflow-x-auto px-0.5 pb-0.5">
        {COLORES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onChange({ ...estilo, color: c })}
            aria-label={`Color ${c}`}
            className="h-6 w-6 shrink-0 rounded-full border-2"
            style={{
              backgroundColor: c,
              borderColor: estilo.color === c ? "#e7c168" : "rgba(255,255,255,0.35)",
            }}
          />
        ))}
      </div>
    </div>
  );
}
