"use client";

import { useEffect, useState } from "react";
import { obtenerClima, type ClimaCiudad } from "@/lib/clima";
import { ApiError } from "@/lib/api";

// Popover simple, de solo lectura — no se guarda en la base ni se envía al
// chat, solo muestra el clima actual de Puerto Montt/Puerto Varas (mismo
// criterio de alcance acotado ya usado para otras cosas "de un vistazo").
export function PopoverClima({ token, onCerrar }: { token: string | null; onCerrar: () => void }) {
  const [ciudades, setCiudades] = useState<ClimaCiudad[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    obtenerClima(token)
      .then(setCiudades)
      .catch((err) => setError(err instanceof ApiError ? err.message : "No se pudo cargar el clima."));
  }, [token]);

  // El wrapper del botón (en chat/[sala]/page.tsx) es "relative" y este
  // popover se ancla a él con "absolute bottom-full" — el catcher de "tocar
  // afuera" va aparte, a nivel de viewport, para no volverse el contenedor
  // de referencia del anclaje (si fuera un solo div "absolute inset-0" que
  // envuelve todo, el popover terminaría anclado a la altura de la pantalla
  // completa en vez de justo encima del botón).
  return (
    <>
      <div className="fixed inset-0 z-40" data-no-swipe onClick={onCerrar} />
      <div className="card absolute bottom-full left-0 z-50 mb-2 flex w-60 flex-col gap-2 p-3">
        <p className="text-xs font-semibold text-text-accent">Clima</p>
        {error && <p className="text-xs text-fill-warning">{error}</p>}
        {!error && !ciudades && <p className="text-xs text-text-secondary">Cargando...</p>}
        {ciudades?.map((c) => (
          <div
            key={c.clave}
            className="flex items-center justify-between gap-2 border-t border-border pt-2 first:border-t-0 first:pt-0"
          >
            <div>
              <p className="text-xs text-text-primary">{c.nombre}</p>
              <p className="text-[11px] text-text-secondary">{c.descripcion}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <span className="text-lg">{c.icono}</span>
              <span className="text-sm font-semibold text-text-primary">{c.temperatura}°</span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
