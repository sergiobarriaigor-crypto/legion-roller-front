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

// Ningún patinador real supera esto — un tramo que lo implique es un salto de
// GPS (o, en pruebas, un punto simulado sin tiempo real entre medio), no una
// velocidad real. Se descarta ese tramo en vez de mostrar un número absurdo
// que además desborda su casilla en la ficha y en la tarjeta de compartir.
const VELOCIDAD_PLAUSIBLE_MAX_KMH = 80;

// Velocidad máxima entre dos puntos consecutivos (km/h), usada en la ficha de
// detalle de "Mis rutas". Como los puntos vienen decimados desde el backend,
// esto es una aproximación (no ve cada micro-tramo real del recorrido).
export function velocidadMaximaKmH(puntos: PuntoGps[]): number {
  let maxima = 0;
  for (let i = 1; i < puntos.length; i++) {
    const dtSeg = (puntos[i].timestamp - puntos[i - 1].timestamp) / 1000;
    if (dtSeg <= 0) continue;
    const distKm = distanciaHaversineKm(puntos[i - 1], puntos[i]);
    const kmh = (distKm / dtSeg) * 3600;
    if (kmh > maxima && kmh <= VELOCIDAD_PLAUSIBLE_MAX_KMH) maxima = kmh;
  }
  return maxima;
}
