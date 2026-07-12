"use client";

import { useEffect, useState } from "react";
import { IconMapPin, IconSearch, IconX } from "@tabler/icons-react";
import { sectoresPorCercania, buscarSectoresPorNombre, type SectorConDistancia } from "@/lib/sectores";

// Selector de ubicación estilo Instagram para el compositor de Post: al abrir,
// detecta la posición actual y muestra los lugares conocidos ordenados por
// cercanía (no asigna uno solo en silencio, como sí hace el editor de
// Historias); el usuario también puede buscar manualmente por nombre. Nunca
// se publica la posición exacta — solo el nombre del lugar que se elija acá.
export function SelectorUbicacion({
  onSeleccionar,
  onCerrar,
}: {
  onSeleccionar: (nombre: string) => void;
  onCerrar: () => void;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [cercanos, setCercanos] = useState<SectorConDistancia[] | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setCercanos(sectoresPorCercania(pos.coords.latitude, pos.coords.longitude)),
      () => {
        // sin permiso o sin GPS: se puede seguir buscando manualmente
      },
      { timeout: 5000 },
    );
  }, []);

  const lista = busqueda.trim()
    ? buscarSectoresPorNombre(busqueda)
    : (cercanos ?? []).map((s) => s.nombre);

  function distanciaDe(nombre: string) {
    return cercanos?.find((s) => s.nombre === nombre)?.distanciaKm;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center" data-no-swipe>
      <div className="card flex max-h-[70vh] w-full max-w-sm flex-col overflow-hidden rounded-b-none p-0 sm:rounded-app">
        <div className="flex items-center justify-between px-4 pt-3">
          <h3 className="text-sm font-semibold text-text-primary">Agregar ubicación</h3>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="text-text-secondary">
            <IconX size={18} />
          </button>
        </div>

        <div className="mx-4 my-2 flex items-center gap-2 rounded-app border border-border px-3 py-2">
          <IconSearch size={16} className="text-text-secondary" />
          <input
            autoFocus
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar un lugar..."
            className="w-full bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
          />
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-3">
          {!busqueda && cercanos === null && (
            <p className="px-2 py-3 text-center text-xs text-text-secondary">Buscando lugares cercanos...</p>
          )}
          {lista.length === 0 && (busqueda || cercanos !== null) && (
            <p className="px-2 py-3 text-center text-xs text-text-secondary">Sin resultados.</p>
          )}
          {lista.map((nombre) => {
            const distancia = distanciaDe(nombre);
            return (
              <button
                key={nombre}
                type="button"
                onClick={() => onSeleccionar(nombre)}
                className="flex w-full items-center gap-2 rounded-app px-3 py-2 text-left text-sm text-text-primary hover:bg-bg-accent"
              >
                <IconMapPin size={16} className="shrink-0 text-text-secondary" />
                <span className="flex-1">{nombre}</span>
                {distancia !== undefined && (
                  <span className="text-xs text-text-muted">
                    {distancia < 1 ? `${Math.round(distancia * 1000)} m` : `${distancia.toFixed(1)} km`}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
