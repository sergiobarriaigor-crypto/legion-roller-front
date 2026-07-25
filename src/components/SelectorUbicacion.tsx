"use client";

import { useEffect, useState } from "react";
import { IconMapPin, IconSearch, IconX } from "@tabler/icons-react";
import { sectoresPorCercania, type SectorConDistancia } from "@/lib/sectores";
import { buscarLugares } from "@/lib/geocodificacion";
import { useNoAutofill } from "@/lib/useNoAutofill";

// Selector de ubicación estilo Instagram, compartido por Post e Historias: al
// abrir, detecta la posición actual y muestra los sectores conocidos
// ordenados por cercanía (no asigna uno solo en silencio); si el usuario
// escribe, busca de verdad en Nominatim/OpenStreetMap (acotado a Chile) en
// vez de filtrar sobre la lista fija de sectores — así "Valdivia" o cualquier
// otro lugar del país aparece, no solo los alrededores conocidos. Nunca se
// publica la posición exacta — solo el nombre del lugar que se elija acá.
export function SelectorUbicacion({
  onSeleccionar,
  onCerrar,
}: {
  onSeleccionar: (nombre: string) => void;
  onCerrar: () => void;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [cercanos, setCercanos] = useState<SectorConDistancia[] | null>(null);
  const [errorGps, setErrorGps] = useState<string | null>(null);
  const [resultadosBusqueda, setResultadosBusqueda] = useState<string[]>([]);
  const [buscando, setBuscando] = useState(false);
  const noAutofill = useNoAutofill();

  function detectarUbicacion() {
    if (!navigator.geolocation) {
      setErrorGps("Este navegador no admite geolocalización.");
      return;
    }
    setErrorGps(null);
    setCercanos(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => setCercanos(sectoresPorCercania(pos.coords.latitude, pos.coords.longitude)),
      (err) => {
        // Los tres códigos posibles del navegador (permiso negado, posición no
        // disponible, tiempo agotado) — se explican para que el usuario sepa
        // qué revisar, en vez de quedar viendo "Buscando..." sin explicación.
        if (err.code === err.PERMISSION_DENIED) {
          setErrorGps(
            "No autorizaste el acceso a tu ubicación. Revisa los permisos de ubicación del navegador o busca el lugar manualmente.",
          );
        } else {
          setErrorGps("No se pudo detectar tu ubicación (sin señal de GPS). Podés buscar el lugar manualmente.");
        }
      },
      { timeout: 8000, enableHighAccuracy: true },
    );
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    detectarUbicacion();
  }, []);

  // Búsqueda real con debounce: se espera a que el usuario deje de escribir
  // antes de golpear la API de Nominatim (respeta su uso justo de la API
  // pública y evita una consulta por cada tecla).
  useEffect(() => {
    const q = busqueda.trim();
    if (!q) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResultadosBusqueda([]);
      setBuscando(false);
      return;
    }
    setBuscando(true);
    const timeout = setTimeout(() => {
      buscarLugares(q).then((lugares) => {
        setResultadosBusqueda(lugares.map((l) => l.nombre));
        setBuscando(false);
      });
    }, 400);
    return () => clearTimeout(timeout);
  }, [busqueda]);

  const lista = busqueda.trim() ? resultadosBusqueda : (cercanos ?? []).map((s) => s.nombre);

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
            autoComplete="off"
            {...noAutofill}
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar cualquier lugar de Chile..."
            className="w-full bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
          />
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-3">
          {!busqueda && cercanos === null && !errorGps && (
            <p className="px-2 py-3 text-center text-xs text-text-secondary">Detectando tu ubicación...</p>
          )}
          {!busqueda && errorGps && (
            <div className="flex flex-col items-center gap-2 px-3 py-3 text-center">
              <p className="text-xs text-text-secondary">{errorGps}</p>
              <button
                type="button"
                onClick={detectarUbicacion}
                className="text-xs font-semibold text-text-accent underline"
              >
                Reintentar
              </button>
            </div>
          )}
          {busqueda && buscando && (
            <p className="px-2 py-3 text-center text-xs text-text-secondary">Buscando...</p>
          )}
          {busqueda && !buscando && lista.length === 0 && (
            <p className="px-2 py-3 text-center text-xs text-text-secondary">Sin resultados.</p>
          )}
          {!busqueda && lista.length === 0 && cercanos !== null && (
            <p className="px-2 py-3 text-center text-xs text-text-secondary">Sin resultados.</p>
          )}
          {lista.map((nombre, i) => {
            const distancia = distanciaDe(nombre);
            return (
              <button
                key={`${nombre}-${i}`}
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
