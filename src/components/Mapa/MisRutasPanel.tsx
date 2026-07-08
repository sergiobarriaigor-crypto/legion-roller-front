"use client";

import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, Polyline, CircleMarker } from "react-leaflet";
import { IconX, IconChevronLeft } from "@tabler/icons-react";
import { apiGet } from "@/lib/api";
import { velocidadMaximaKmH, type PuntoGps } from "@/lib/geo";
import { sectorMasCercano } from "@/lib/sectores";

interface Recorrido {
  id: number;
  tipo: string;
  distanciaKm: number;
  duracionSeg: number;
  createdAt: string;
  puntos: PuntoGps[];
}

const ALTURA_PEEK_VH = 50;
const ALTURA_EXPANDIDA_VH = 92;
const TAM_PREVIEW = 56;

// Boceto simple del trazado (no es un mapa real) para identificar la ruta de un
// vistazo en la lista, sin cargar 10 mapas de Leaflet a la vez.
function VistaPreviaSvg({ puntos }: { puntos: PuntoGps[] }) {
  if (puntos.length < 2) {
    return (
      <div
        className="flex shrink-0 items-center justify-center rounded-app bg-surface-2 text-text-muted"
        style={{ width: TAM_PREVIEW, height: TAM_PREVIEW }}
      >
        <span className="text-[10px]">—</span>
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
      className="shrink-0 rounded-app bg-surface-2"
    >
      <polyline points={trazo} fill="none" stroke="#C99A3D" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(inicio.lon)} cy={y(inicio.lat)} r={3} fill="#5fae4e" />
      <circle cx={x(fin.lon)} cy={y(fin.lat)} r={3} fill="#d8342f" />
    </svg>
  );
}

function TarjetaStat({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="card flex flex-col items-center gap-1 p-3">
      <span className="text-base font-semibold text-text-accent">{valor}</span>
      <span className="text-[10px] text-text-secondary">{etiqueta}</span>
    </div>
  );
}

function FichaRecorrido({ recorrido }: { recorrido: Recorrido }) {
  const puntos = recorrido.puntos;
  const bounds: [[number, number], [number, number]] = [
    [Math.min(...puntos.map((p) => p.lat)), Math.min(...puntos.map((p) => p.lon))],
    [Math.max(...puntos.map((p) => p.lat)), Math.max(...puntos.map((p) => p.lon))],
  ];
  const inicio = puntos[0];
  const fin = puntos[puntos.length - 1];

  const horas = recorrido.duracionSeg / 3600;
  const velocidadPromedio = horas > 0 ? recorrido.distanciaKm / horas : 0;
  const velocidadMaxima = velocidadMaximaKmH(puntos);

  const fechaCompleta = new Date(recorrido.createdAt).toLocaleDateString("es-CL", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const horaInicio = new Date(inicio.timestamp).toLocaleTimeString("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const horaFin = new Date(fin.timestamp).toLocaleTimeString("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const sector = sectorMasCercano(inicio.lat, inicio.lon);

  return (
    <div className="flex flex-col gap-3">
      {/* Encabezado discreto: solo contexto (fecha/hora/lugar), texto chico a propósito. */}
      <div className="flex flex-col gap-0.5 text-xs text-text-secondary">
        <p className="capitalize">{fechaCompleta}</p>
        <p>
          {horaInicio} — {horaFin}
        </p>
        <p>{sector}</p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <TarjetaStat etiqueta="Tiempo total" valor={`${Math.round(recorrido.duracionSeg / 60)} min`} />
        <TarjetaStat etiqueta="Vel. promedio" valor={`${Math.round(velocidadPromedio)} km/h`} />
        <TarjetaStat etiqueta="Vel. máxima" valor={`${Math.round(velocidadMaxima)} km/h`} />
      </div>

      {/* Elemento principal: el Recorrido en sí, con más protagonismo visual
          (borde y brillo dorados) ya que es el resultado central de la actividad. */}
      <div
        className="overflow-hidden rounded-app border-2 border-border-accent"
        style={{ boxShadow: "0 0 22px rgba(201, 154, 61, 0.35)" }}
      >
        <div className="flex items-center justify-between bg-bg-accent px-3 py-2">
          <h3 className="text-sm font-semibold text-text-accent">Recorrido</h3>
          <span className="text-sm font-semibold text-text-primary">
            {recorrido.distanciaKm.toFixed(2)} km
          </span>
        </div>
        <div style={{ height: 240 }}>
          <MapContainer
            bounds={bounds}
            boundsOptions={{ padding: [20, 20] }}
            style={{ height: "100%", width: "100%" }}
            zoomControl={false}
            dragging={false}
            scrollWheelZoom={false}
            doubleClickZoom={false}
            touchZoom={false}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <Polyline
              positions={puntos.map((p) => [p.lat, p.lon])}
              pathOptions={{ color: "#C99A3D", weight: 4 }}
            />
            <CircleMarker
              center={[inicio.lat, inicio.lon]}
              radius={6}
              pathOptions={{ color: "#171008", fillColor: "#5fae4e", fillOpacity: 1 }}
            />
            <CircleMarker
              center={[fin.lat, fin.lon]}
              radius={6}
              pathOptions={{ color: "#171008", fillColor: "#d8342f", fillOpacity: 1 }}
            />
          </MapContainer>
        </div>
      </div>
    </div>
  );
}

export function MisRutasPanel({
  token,
  onClose,
}: {
  token: string | null;
  onClose: () => void;
}) {
  const [recorridos, setRecorridos] = useState<Recorrido[]>([]);
  const [cargando, setCargando] = useState(true);
  const [seleccionado, setSeleccionado] = useState<Recorrido | null>(null);
  const [alturaVh, setAlturaVh] = useState(ALTURA_PEEK_VH);

  const arrastreRef = useRef<{ startY: number; startAltura: number } | null>(null);

  useEffect(() => {
    if (!token) return;
    apiGet<Recorrido[]>("/mapa/recorridos", token)
      .then(setRecorridos)
      .finally(() => setCargando(false));
  }, [token]);

  function onDragStart(e: React.TouchEvent) {
    arrastreRef.current = { startY: e.touches[0].clientY, startAltura: alturaVh };
  }

  function onDragMove(e: React.TouchEvent) {
    if (!arrastreRef.current) return;
    const deltaVh =
      ((arrastreRef.current.startY - e.touches[0].clientY) / window.innerHeight) * 100;
    const nueva = Math.min(
      ALTURA_EXPANDIDA_VH,
      Math.max(30, arrastreRef.current.startAltura + deltaVh),
    );
    setAlturaVh(nueva);
  }

  function onDragEnd() {
    arrastreRef.current = null;
    setAlturaVh((actual) =>
      actual > (ALTURA_PEEK_VH + ALTURA_EXPANDIDA_VH) / 2 ? ALTURA_EXPANDIDA_VH : ALTURA_PEEK_VH,
    );
  }

  return (
    <>
      {/* Velo oscuro sobre el mapa: se sigue viendo de fondo (a pedido del usuario),
          pero atenuado para no competir visualmente con el panel. Tocarlo cierra. */}
      <div className="fixed inset-0 z-40 bg-black/45" onClick={onClose} />

      <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center pointer-events-none">
        <div
          className="card pointer-events-auto flex w-full max-w-md flex-col gap-3 rounded-b-none p-4 shadow-2xl transition-[height] duration-150"
          style={{ height: `${alturaVh}vh` }}
        >
        <div
          className="-mt-1 flex cursor-grab flex-col items-center gap-2 pt-1 active:cursor-grabbing"
          onTouchStart={onDragStart}
          onTouchMove={onDragMove}
          onTouchEnd={onDragEnd}
        >
          <span className="h-1 w-10 rounded-full bg-border" />
          <div className="flex w-full items-center justify-between">
            <h2 className="text-sm font-semibold text-text-accent">
              {seleccionado ? "" : "Mis rutas"}
            </h2>
            {seleccionado && (
              <button
                type="button"
                onClick={() => setSeleccionado(null)}
                aria-label="Volver a la lista"
                className="flex items-center gap-1 text-xs text-text-secondary"
              >
                <IconChevronLeft size={16} />
                Volver
              </button>
            )}
            <button type="button" onClick={onClose} aria-label="Cerrar" className="text-text-secondary">
              <IconX size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {seleccionado ? (
            <FichaRecorrido recorrido={seleccionado} />
          ) : (
            <>
              {cargando && <p className="text-xs text-text-secondary">Cargando...</p>}

              {!cargando && recorridos.length === 0 && (
                <p className="text-xs text-text-secondary">
                  Todavía no tienes rutas guardadas. Activa &quot;Estoy en ruta&quot; y acepta
                  mapear tu recorrido para que aparezca aquí.
                </p>
              )}

              <ul className="flex flex-col gap-2">
                {recorridos.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => setSeleccionado(r)}
                      className="flex w-full items-center gap-3 rounded-app border border-border px-3 py-2 text-left"
                    >
                      <VistaPreviaSvg puntos={r.puntos} />
                      <div className="flex flex-1 flex-col">
                        <span className="text-sm text-text-primary">
                          {new Date(r.createdAt).toLocaleDateString("es-CL")}
                        </span>
                        <span className="text-xs text-text-secondary">
                          {r.distanciaKm.toFixed(2)} km — {Math.round(r.duracionSeg / 60)} min
                        </span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
        </div>
      </div>
    </>
  );
}
