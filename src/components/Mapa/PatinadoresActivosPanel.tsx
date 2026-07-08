"use client";

import { useState } from "react";
import { IconX } from "@tabler/icons-react";
import { sectorMasCercano } from "@/lib/sectores";
import { tiempoTranscurrido } from "@/lib/tiempo";

export interface PatinadorActivo {
  miembroId: number;
  nombre: string;
  fotoUrl: string | null;
  lat: number;
  lon: number;
  iniciadoEn: string;
}

const MAX_VISIBLES = 5;

function TarjetaPatinador({ p }: { p: PatinadorActivo }) {
  return (
    <div className="flex items-center gap-3 rounded-app border border-border px-3 py-2">
      {p.fotoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={p.fotoUrl} alt={p.nombre} className="h-10 w-10 rounded-full object-cover" />
      ) : (
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-bg-accent text-sm font-semibold text-text-accent">
          {p.nombre.charAt(0).toUpperCase()}
        </div>
      )}
      <div className="flex flex-1 flex-col">
        <span className="text-sm text-text-primary">{p.nombre}</span>
        <span className="text-xs text-blue-text">{sectorMasCercano(p.lat, p.lon)}</span>
      </div>
      <span className="whitespace-nowrap text-[10px] text-text-muted">
        {tiempoTranscurrido(p.iniciadoEn)}
      </span>
    </div>
  );
}

// Ajuste post-Fase 11 (sección "Panel de Patinadores Activos"): lista a quienes
// tienen activo específicamente "Estoy patinando ahora" (no "Estoy en ruta"),
// respetando la privacidad de quien no comparte ubicación.
export function PatinadoresActivosPanel({ patinadores }: { patinadores: PatinadorActivo[] }) {
  const [mostrarTodos, setMostrarTodos] = useState(false);
  const visibles = patinadores.slice(0, MAX_VISIBLES);
  const restantes = patinadores.slice(MAX_VISIBLES);

  return (
    <div className="card flex flex-col gap-2 p-4">
      <h2 className="text-sm font-semibold text-text-accent">Patinadores activos</h2>

      {patinadores.length === 0 ? (
        <p className="text-xs text-text-secondary">
          No hay patinadores activos en este momento. ¡Sé el primero en salir a rodar!
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            {visibles.map((p) => (
              <TarjetaPatinador key={p.miembroId} p={p} />
            ))}
          </div>
          {restantes.length > 0 && (
            <button
              type="button"
              onClick={() => setMostrarTodos(true)}
              className="text-xs text-text-accent underline"
            >
              Ver los {restantes.length} restantes
            </button>
          )}
        </>
      )}

      {mostrarTodos && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center"
          onClick={() => setMostrarTodos(false)}
        >
          <div
            className="card flex max-h-[70vh] w-full max-w-md flex-col gap-2 overflow-y-auto p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-text-accent">Patinadores activos</h2>
              <button
                type="button"
                onClick={() => setMostrarTodos(false)}
                aria-label="Cerrar"
                className="text-text-secondary"
              >
                <IconX size={18} />
              </button>
            </div>
            {restantes.map((p) => (
              <TarjetaPatinador key={p.miembroId} p={p} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
