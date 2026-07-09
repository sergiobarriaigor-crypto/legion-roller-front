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
    <div className="flex items-center gap-3 rounded-app border border-white/10 bg-black/40 px-3 py-2 backdrop-blur-sm">
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
    <div
      className="flex min-h-[220px] flex-col gap-2 rounded-app border border-border p-4"
      style={{
        backgroundImage:
          "linear-gradient(to bottom, rgba(23,16,8,0.55) 0%, rgba(23,16,8,0.75) 55%, rgba(23,16,8,0.9) 100%), url(/fondo-patinadores-activos.jpg)",
        // Misma corrección que en Mis Rutas: ".card" define "background" fuera de
        // un @layer y le gana en cascada a bg-cover/bg-no-repeat, así que el
        // tamaño va inline para que sí se aplique.
        backgroundSize: "cover",
        backgroundRepeat: "no-repeat",
        // Anclado arriba (no al centro): así siempre se ve la cabeza de los
        // patinadores desde el primer momento, y a medida que el panel crece
        // (más patinadores activos en la lista) se revela más hacia abajo.
        backgroundPosition: "top",
      }}
    >
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
            className="flex max-h-[70vh] min-h-[280px] w-full max-w-md flex-col gap-2 overflow-y-auto rounded-app border border-border p-5"
            style={{
              backgroundImage:
                "linear-gradient(to bottom, rgba(23,16,8,0.55) 0%, rgba(23,16,8,0.75) 55%, rgba(23,16,8,0.9) 100%), url(/fondo-patinadores-activos.jpg)",
              backgroundSize: "cover",
              backgroundRepeat: "no-repeat",
              backgroundPosition: "top",
            }}
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
