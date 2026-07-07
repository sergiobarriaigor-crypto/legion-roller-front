"use client";

import dynamic from "next/dynamic";

const MapaView = dynamic(
  () => import("@/components/Mapa/MapaView").then((m) => m.MapaView),
  { ssr: false, loading: () => <p className="text-sm text-text-secondary">Cargando mapa...</p> },
);

export default function MapaPage() {
  return <MapaView />;
}
