"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { IconX } from "@tabler/icons-react";
import { sectorMasCercano } from "@/lib/sectores";
import { apiGet } from "@/lib/api";
import type { MiembroSimple } from "@/lib/chat";

const MiniMapaUbicacion = dynamic(
  () => import("@/components/Chat/MiniMapaUbicacion").then((m) => m.MiniMapaUbicacion),
  { ssr: false, loading: () => <div className="h-36 rounded-app bg-surface-2" /> },
);

// Reemplaza a SelectorUbicacion.tsx *solo en el flujo de Chat*: a diferencia
// de Post (que solo comparte el nombre de un sector, nunca la posición
// exacta), acá sí se comparte la ubicación real detectada por GPS — el chat
// es una conversación privada 1 a 1, no un feed comunitario, y quien recibe
// debe poder ver exactamente dónde está el otro y pedir indicaciones, como en
// WhatsApp. Sin buscador manual de lugar: acá no se elige un lugar, se
// comparte la posición real.
export function SelectorUbicacionChat({
  propioId,
  token,
  onConfirmar,
  onCerrar,
}: {
  propioId: number | null | undefined;
  token: string | null;
  onConfirmar: (datos: { lat: number; lon: number; nombre: string }) => void;
  onCerrar: () => void;
}) {
  const [posicion, setPosicion] = useState<{ lat: number; lon: number } | null>(null);
  const [errorGps, setErrorGps] = useState<string | null>(null);
  const [propio, setPropio] = useState<MiembroSimple | null>(null);

  useEffect(() => {
    apiGet<MiembroSimple[]>("/chat/miembros", token)
      .then((miembros) => setPropio(miembros.find((m) => m.id === propioId) ?? null))
      .catch(() => {});
  }, [token, propioId]);

  function detectarUbicacion() {
    if (!navigator.geolocation) {
      setErrorGps("Este navegador no admite geolocalización.");
      return;
    }
    setErrorGps(null);
    setPosicion(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => setPosicion({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setErrorGps(
            "No autorizaste el acceso a tu ubicación. Revisa los permisos de ubicación del navegador.",
          );
        } else {
          setErrorGps("No se pudo detectar tu ubicación (sin señal de GPS).");
        }
      },
      { timeout: 8000, enableHighAccuracy: true },
    );
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    detectarUbicacion();
  }, []);

  const nombreSector = posicion ? sectorMasCercano(posicion.lat, posicion.lon) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center" data-no-swipe>
      <div className="card flex w-full max-w-sm flex-col gap-3 rounded-b-none p-4 sm:rounded-app">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text-primary">Compartir mi ubicación</h3>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="text-text-secondary">
            <IconX size={18} />
          </button>
        </div>

        {!posicion && !errorGps && (
          <p className="py-6 text-center text-xs text-text-secondary">Detectando tu ubicación...</p>
        )}

        {errorGps && (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
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

        {posicion && (
          <>
            <MiniMapaUbicacion
              lat={posicion.lat}
              lon={posicion.lon}
              fotoUrl={propio?.fotoUrl ?? null}
              nombre={propio?.nombre ?? "Yo"}
            />
            <p className="text-center text-xs text-text-muted">Cerca de {nombreSector}</p>
            <button
              type="button"
              onClick={() => onConfirmar({ lat: posicion.lat, lon: posicion.lon, nombre: nombreSector! })}
              className="btn-hero rounded-app px-4 py-2 text-sm"
            >
              Enviar mi ubicación
            </button>
          </>
        )}
      </div>
    </div>
  );
}
