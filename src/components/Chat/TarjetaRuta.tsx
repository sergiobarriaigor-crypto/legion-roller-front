"use client";

import { IconRoute } from "@tabler/icons-react";

const TAM_PREVIEW = 64;

interface PuntoRuta {
  lat: number;
  lon: number;
}

// Boceto simple del trazado (misma lógica que VistaPreviaSvg de MisRutasPanel.tsx,
// copiada localmente: no se comparten helpers pequeños entre módulos en este proyecto).
function VistaPreviaTrazado({ puntos }: { puntos: PuntoRuta[] }) {
  if (puntos.length < 2) {
    return (
      <div
        className="flex shrink-0 items-center justify-center rounded-app bg-black/20"
        style={{ width: TAM_PREVIEW, height: TAM_PREVIEW }}
      >
        <IconRoute size={20} className="opacity-60" />
      </div>
    );
  }

  const padding = 6;
  const lats = puntos.map((p) => p.lat);
  const lons = puntos.map((p) => p.lon);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const rangoLat = maxLat - minLat || 0.0001;
  const rangoLon = maxLon - minLon || 0.0001;

  const x = (lon: number) => padding + ((lon - minLon) / rangoLon) * (TAM_PREVIEW - padding * 2);
  const y = (lat: number) => padding + ((maxLat - lat) / rangoLat) * (TAM_PREVIEW - padding * 2);

  const inicio = puntos[0];
  const fin = puntos[puntos.length - 1];
  const trazo = puntos.map((p) => `${x(p.lon)},${y(p.lat)}`).join(" ");

  return (
    <svg
      viewBox={`0 0 ${TAM_PREVIEW} ${TAM_PREVIEW}`}
      width={TAM_PREVIEW}
      height={TAM_PREVIEW}
      className="shrink-0 rounded-app bg-black/20"
    >
      <polyline points={trazo} fill="none" stroke="#C99A3D" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(inicio.lon)} cy={y(inicio.lat)} r={3} fill="#5fae4e" />
      <circle cx={x(fin.lon)} cy={y(fin.lat)} r={3} fill="#d8342f" />
    </svg>
  );
}

export function TarjetaRuta({
  puntos,
  distanciaKm,
  duracionSeg,
}: {
  puntos: PuntoRuta[];
  distanciaKm: number;
  duracionSeg: number;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-app px-2 py-1.5">
      <VistaPreviaTrazado puntos={puntos} />
      <div className="min-w-0">
        <p className="text-xs font-semibold">Recorrido compartido</p>
        <p className="text-xs opacity-80">
          {distanciaKm.toFixed(2)} km — {Math.round(duracionSeg / 60)} min
        </p>
      </div>
    </div>
  );
}
