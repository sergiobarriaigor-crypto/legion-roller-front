export interface PuntoGps {
  lat: number;
  lon: number;
  timestamp: number;
}

// Distancia entre dos puntos GPS en kilómetros (fórmula de Haversine, ver sección 5 del PDF).
export function distanciaHaversineKm(a: PuntoGps, b: PuntoGps): number {
  const radioTierraKm = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  return radioTierraKm * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function distanciaTotalKm(puntos: PuntoGps[]): number {
  let total = 0;
  for (let i = 1; i < puntos.length; i++) {
    total += distanciaHaversineKm(puntos[i - 1], puntos[i]);
  }
  return total;
}
