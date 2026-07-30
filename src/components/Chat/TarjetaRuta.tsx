"use client";

import { IconRoute } from "@tabler/icons-react";

const ANCHO_PREVIEW = 320;
const ALTO_PREVIEW = 170;

interface PuntoRuta {
  lat: number;
  lon: number;
}

// Vista previa grande del trazado (a diferencia del ícono chico de 64x64 que
// se usa en listas como MisRutasPanel.tsx, acá el recorrido es el propio
// contenido del mensaje — mismo criterio que una foto o un video: ocupa todo
// el ancho de la burbuja, no una tarjeta angosta).
function VistaPreviaTrazado({ puntos }: { puntos: PuntoRuta[] }) {
  if (puntos.length < 2) {
    return (
      <div className="flex aspect-[16/9] w-full items-center justify-center bg-black/30">
        <IconRoute size={32} className="opacity-60" />
      </div>
    );
  }

  const padding = 16;
  const lats = puntos.map((p) => p.lat);
  const lons = puntos.map((p) => p.lon);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const rangoLat = maxLat - minLat || 0.0001;
  const rangoLon = maxLon - minLon || 0.0001;

  const x = (lon: number) => padding + ((lon - minLon) / rangoLon) * (ANCHO_PREVIEW - padding * 2);
  const y = (lat: number) => padding + ((maxLat - lat) / rangoLat) * (ALTO_PREVIEW - padding * 2);

  const inicio = puntos[0];
  const fin = puntos[puntos.length - 1];
  const trazo = puntos.map((p) => `${x(p.lon)},${y(p.lat)}`).join(" ");

  return (
    <svg
      viewBox={`0 0 ${ANCHO_PREVIEW} ${ALTO_PREVIEW}`}
      className="block w-full bg-black/30"
      preserveAspectRatio="xMidYMid meet"
    >
      <polyline points={trazo} fill="none" stroke="#C99A3D" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(inicio.lon)} cy={y(inicio.lat)} r={5} fill="#5fae4e" />
      <circle cx={x(fin.lon)} cy={y(fin.lat)} r={5} fill="#d8342f" />
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
    <div className="relative w-full overflow-hidden rounded-app">
      <VistaPreviaTrazado puntos={puntos} />
      <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-black/75 to-transparent px-3 py-2.5">
        <IconRoute size={18} className="shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-semibold">Recorrido compartido</p>
          <p className="text-xs opacity-85">
            {distanciaKm.toFixed(2)} km — {Math.round(duracionSeg / 60)} min
          </p>
        </div>
      </div>
    </div>
  );
}
