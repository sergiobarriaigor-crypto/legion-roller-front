"use client";

import { useEffect, useState } from "react";
import { IconX } from "@tabler/icons-react";
import { apiGet, ApiError } from "@/lib/api";
import type { PuntoGps } from "@/lib/geo";
import { TarjetaRuta } from "@/components/Chat/TarjetaRuta";

interface Recorrido {
  id: number;
  distanciaKm: number;
  duracionSeg: number;
  puntos: PuntoGps[];
}

// Selector de "ruta registrada" para adjuntar al chat: lista mis recorridos
// (mismo endpoint que MisRutasPanel.tsx) y al elegir uno, entrega un snapshot
// de distancia/duración/puntos — no una referencia viva al Recorrido.
export function SelectorRutaMensaje({
  token,
  onElegir,
  onCerrar,
}: {
  token: string | null;
  onElegir: (recorrido: Recorrido) => void;
  onCerrar: () => void;
}) {
  const [recorridos, setRecorridos] = useState<Recorrido[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    apiGet<Recorrido[]>("/mapa/recorridos", token)
      .then(setRecorridos)
      .catch((err) => setError(err instanceof ApiError ? err.message : "No se pudieron cargar tus rutas."));
  }, [token]);

  return (
    <div className="fixed inset-0 z-50" data-no-swipe>
      <div className="absolute inset-0 bg-black/75" onClick={onCerrar} aria-hidden />
      <div className="absolute inset-x-0 bottom-0 flex max-h-[70%] flex-col rounded-t-2xl bg-surface-2 shadow-[0_-8px_30px_rgba(0,0,0,0.5)]">
        <div className="flex justify-center pb-1 pt-2">
          <span className="h-1 w-10 rounded-full bg-white/20" />
        </div>
        <div className="flex items-center justify-between border-b border-border px-3 pb-3">
          <h3 className="text-sm font-semibold text-text-primary">Compartir ruta</h3>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="text-text-secondary">
            <IconX size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {error && <p className="text-xs text-fill-warning">{error}</p>}
          {!error && recorridos === null && (
            <p className="text-xs text-text-secondary">Cargando tus rutas...</p>
          )}
          {recorridos?.length === 0 && (
            <p className="text-xs text-text-secondary">Todavía no registraste ninguna ruta.</p>
          )}
          {recorridos?.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => onElegir(r)}
              className="w-full rounded-app text-left text-text-primary active:bg-white/5"
            >
              <TarjetaRuta puntos={r.puntos} distanciaKm={r.distanciaKm} duracionSeg={r.duracionSeg} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
