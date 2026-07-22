"use client";

import { MapContainer, TileLayer, Marker } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { IconDirections, IconX } from "@tabler/icons-react";
import { Avatar } from "@/components/Avatar";

function escapeHtml(texto: string) {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Marcador con la foto de quien comparte (mismo patrón que crearIconoAvatar()
// de MapaView.tsx, copiado localmente aquí) en vez del pin por defecto de
// Leaflet — ese ícono por defecto depende de rutas de imagen que no se
// resuelven bajo Next.js, y terminaba mostrándose como un recuadro roto con
// borde propio (efecto de "doble tarjeta" encima del mapa).
function crearIconoUbicacion(fotoUrl: string | null, nombre: string) {
  const TAM = 48;
  const inicial = escapeHtml((nombre.charAt(0) || "?").toUpperCase());
  const contenido = fotoUrl
    ? `<img src="${escapeHtml(fotoUrl)}" style="width:100%;height:100%;object-fit:cover;" />`
    : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-weight:600;font-size:18px;color:#171008;">${inicial}</div>`;

  return L.divIcon({
    className: "",
    html: `
      <div style="display:flex;flex-direction:column;align-items:center;">
        <div style="width:${TAM}px;height:${TAM}px;border-radius:9999px;background:#e7c168;border:3px solid #C99A3D;box-shadow:0 2px 8px rgba(0,0,0,0.5);overflow:hidden;">
          ${contenido}
        </div>
        <div style="width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-top:11px solid #C99A3D;margin-top:-2px;"></div>
      </div>
    `,
    iconSize: [TAM, TAM + 11],
    iconAnchor: [TAM / 2, TAM + 11],
  });
}

// Mapa interactivo a pantalla completa para ver exactamente dónde está quien
// compartió su ubicación en el chat. "Cómo llegar" no construye navegación
// propia — abre Google Maps con esas coordenadas como destino y deja que la
// app de mapas del usuario haga la guía real (con voz, tráfico, etc.), igual
// que hace WhatsApp.
export function VisorUbicacionMensaje({
  lat,
  lon,
  nombre,
  autorNombre,
  autorFotoUrl,
  onCerrar,
}: {
  lat: number;
  lon: number;
  nombre: string | null;
  autorNombre: string;
  autorFotoUrl: string | null;
  onCerrar: () => void;
}) {
  function comoLlegar() {
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`, "_blank");
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-page-bg" data-no-swipe>
      <div className="flex items-center gap-2.5 border-b border-border px-3 py-2">
        <Avatar fotoUrl={autorFotoUrl} nombre={autorNombre} tamano={36} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-text-primary">{autorNombre}</h3>
          <p className="truncate text-xs text-text-muted">
            {nombre ? `Ubicación compartida · Cerca de ${nombre}` : "Ubicación compartida"}
          </p>
        </div>
        <button type="button" onClick={onCerrar} aria-label="Cerrar" className="shrink-0 text-text-secondary">
          <IconX size={22} />
        </button>
      </div>

      {/* `relative z-0`: mismo motivo que en MiniMapaUbicacion.tsx — sin
          stacking context propio, los panes internos de Leaflet compiten
          directamente contra el z-index del resto de la página. */}
      <div className="relative z-0 flex-1">
        <MapContainer center={[lat, lon]} zoom={15} style={{ height: "100%", width: "100%" }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Marker position={[lat, lon]} icon={crearIconoUbicacion(autorFotoUrl, autorNombre)} />
        </MapContainer>
      </div>

      <div className="p-3" data-no-swipe>
        <button
          type="button"
          onClick={comoLlegar}
          className="btn-hero flex w-full items-center justify-center gap-1.5 rounded-app px-4 py-2.5 text-sm"
        >
          <IconDirections size={18} />
          Cómo llegar
        </button>
      </div>
    </div>
  );
}
