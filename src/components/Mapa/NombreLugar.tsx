"use client";

import { useNombreLugar } from "@/lib/sectores";

// Envoltorio de useNombreLugar para usar dentro de listas (.map()), donde no
// se puede llamar un hook directamente en la función de renderizado.
export function NombreLugar({
  lat,
  lon,
  className,
}: {
  lat: number;
  lon: number;
  className?: string;
}) {
  const nombre = useNombreLugar(lat, lon);
  return <span className={className}>{nombre}</span>;
}
