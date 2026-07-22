"use client";

import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const CENTRO_DEFECTO: [number, number] = [-41.4, -72.96];

// El ícono por defecto de Leaflet no se resuelve bien empaquetado con Next.js
// (se ve como un cuadrado roto) — mismo problema y misma solución que ya usa
// MapaView.tsx (crearIcono/crearIconoAvatar): un divIcon propio en vez del PNG.
const iconoPunto = L.divIcon({
  className: "",
  html: `<div style="width:20px;height:20px;border-radius:9999px;background:#e7c168;border:2px solid #171008;box-shadow:0 0 0 2px rgba(201,154,61,0.55);"></div>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

interface ResultadoBusqueda {
  display_name: string;
  lat: string;
  lon: string;
}

function ClicMapa({ onSeleccionar }: { onSeleccionar: (lat: number, lon: number) => void }) {
  useMapEvents({
    click(e) {
      onSeleccionar(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

// El prop `center` de MapContainer solo se aplica al montar — para que el mapa
// se mueva solo al elegir un resultado de búsqueda (no solo al hacer clic,
// donde ya se está viendo el punto) hay que recentrarlo a mano.
function RecentrarMapa({ lat, lon }: { lat: number | null; lon: number | null }) {
  const map = useMap();
  useEffect(() => {
    if (lat !== null && lon !== null) {
      map.setView([lat, lon], map.getZoom());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lon]);
  return null;
}

// Selector de punto de inicio para rodadas (Admin): toca el mapa o busca una
// dirección para fijar las coordenadas reales que luego se usan para validar
// la cercanía GPS al conceder asistencia confirmada (ver backend/src/mapa/mapa.service.ts).
export function SelectorPuntoMapa({
  lat,
  lon,
  onSeleccionar,
}: {
  lat: number | null;
  lon: number | null;
  onSeleccionar: (lat: number, lon: number) => void;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState<ResultadoBusqueda[]>([]);
  const [buscando, setBuscando] = useState(false);

  const centro: [number, number] = lat !== null && lon !== null ? [lat, lon] : CENTRO_DEFECTO;

  async function buscar() {
    if (!busqueda.trim()) return;
    setBuscando(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=cl&q=${encodeURIComponent(busqueda)}`,
      );
      const data = await res.json();
      setResultados(Array.isArray(data) ? data : []);
    } catch {
      setResultados([]);
    } finally {
      setBuscando(false);
    }
  }

  function elegirResultado(r: ResultadoBusqueda) {
    onSeleccionar(parseFloat(r.lat), parseFloat(r.lon));
    setBusqueda(r.display_name);
    setResultados([]);
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-1">
        <input
          type="text"
          placeholder="Buscar dirección o lugar..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              buscar();
            }
          }}
          className="flex-1 rounded-app border border-border bg-surface-2 px-2 py-1.5 text-xs text-text-primary outline-none"
        />
        <button
          type="button"
          onClick={buscar}
          disabled={buscando}
          className="shrink-0 rounded-app border border-border px-3 py-1.5 text-xs text-text-secondary disabled:opacity-60"
        >
          {buscando ? "Buscando..." : "Buscar"}
        </button>
      </div>

      {resultados.length > 0 && (
        <ul className="flex flex-col gap-0.5 rounded-app border border-border bg-surface-2">
          {resultados.map((r, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => elegirResultado(r)}
                className="w-full px-2 py-1.5 text-left text-xs text-text-secondary hover:text-text-primary"
              >
                {r.display_name}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="overflow-hidden rounded-app border border-border" style={{ height: 220 }}>
        <MapContainer center={centro} zoom={13} style={{ height: "100%", width: "100%" }}>
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution="&copy; OpenStreetMap"
          />
          <RecentrarMapa lat={lat} lon={lon} />
          <ClicMapa onSeleccionar={onSeleccionar} />
          {lat !== null && lon !== null && <Marker position={[lat, lon]} icon={iconoPunto} />}
        </MapContainer>
      </div>
    </div>
  );
}
