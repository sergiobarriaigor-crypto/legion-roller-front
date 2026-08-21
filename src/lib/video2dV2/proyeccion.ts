// Proyección Web Mercator para V2 -- deliberadamente independiente de
// tarjetaRecorrido.ts (V1 no se toca ni se importa desde acá). Misma
// matemática exacta que ya usa V1 (lonAPixelX/latAPixelY), duplicada acá
// porque V1 no las exporta y no queremos abrir esa puerta -- son fórmulas
// de Web Mercator estándar, estables, sin lógica de negocio.

export const TAM_TILE = 256;

export function lonAPixelX(lon: number, zoom: number): number {
  return ((lon + 180) / 360) * TAM_TILE * 2 ** zoom;
}

export function latAPixelY(lat: number, zoom: number): number {
  const rad = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * TAM_TILE * 2 ** zoom;
}

export interface PuntoLonLat {
  lon: number;
  lat: number;
}
