"use client";

import { MapContainer, TileLayer, Marker } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

function escapeHtml(texto: string) {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Marcador con la foto de quien comparte (mismo patrón que crearIconoAvatar()
// de MapaView.tsx) en vez del pin por defecto de Leaflet — ese ícono por
// defecto depende de rutas de imagen que no se resuelven bajo Next.js, y
// terminaba mostrándose como un recuadro roto con borde propio (efecto de
// "doble tarjeta" encima del mapa).
function crearIconoUbicacion(fotoUrl: string | null, nombre: string) {
  const TAM = 40;
  const inicial = escapeHtml((nombre.charAt(0) || "?").toUpperCase());
  const contenido = fotoUrl
    ? `<img src="${escapeHtml(fotoUrl)}" style="width:100%;height:100%;object-fit:cover;" />`
    : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-weight:600;color:#171008;">${inicial}</div>`;

  return L.divIcon({
    className: "",
    html: `
      <div style="display:flex;flex-direction:column;align-items:center;">
        <div style="width:${TAM}px;height:${TAM}px;border-radius:9999px;background:#e7c168;border:2.5px solid #C99A3D;box-shadow:0 2px 6px rgba(0,0,0,0.5);overflow:hidden;">
          ${contenido}
        </div>
        <div style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:9px solid #C99A3D;margin-top:-2px;"></div>
      </div>
    `,
    iconSize: [TAM, TAM + 9],
    iconAnchor: [TAM / 2, TAM + 9],
  });
}

// Vista previa pequeña y no interactiva de un punto exacto — usada tanto en
// el selector (antes de enviar) como en la burbuja del mensaje ya enviado.
// Sin controles de zoom/arrastre: es solo una miniatura, tocar la burbuja abre
// el mapa interactivo real (VisorUbicacionMensaje.tsx).
export function MiniMapaUbicacion({
  lat,
  lon,
  fotoUrl,
  nombre,
  alto = 140,
}: {
  lat: number;
  lon: number;
  fotoUrl: string | null;
  nombre: string;
  alto?: number;
}) {
  return (
    // `relative z-0` no es decorativo: sin un stacking context propio, los
    // panes internos de Leaflet (z-index 200-700 para tiles/marcadores) se
    // comparan directamente contra el z-index de toda la página — y ganan
    // sobre overlays con z-index más bajo (ej. el visor de pantalla completa,
    // z-50), "atravesándolo" visualmente aunque esté encima en el DOM.
    <div style={{ height: alto }} className="relative z-0 overflow-hidden rounded-app">
      <MapContainer
        center={[lat, lon]}
        zoom={15}
        style={{ height: "100%", width: "100%" }}
        dragging={false}
        zoomControl={false}
        scrollWheelZoom={false}
        doubleClickZoom={false}
        touchZoom={false}
        attributionControl={false}
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <Marker position={[lat, lon]} icon={crearIconoUbicacion(fotoUrl, nombre)} />
      </MapContainer>
    </div>
  );
}
