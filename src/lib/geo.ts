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

// Ni el patinador más rápido del club sostiene esto ni en la bajada más
// pronunciada — un tramo que lo implique es un salto de GPS (frecuente cerca
// de la costa/cerros, por reflejo de señal), no una velocidad real. 80 km/h
// era demasiado permisivo (pensado para descartar saltos tipo teletransporte,
// no ruido normal de GPS) y dejaba pasar picos falsos de 40-50 km/h en
// recorridos totalmente planos. Se descarta ese tramo en vez de mostrar un
// número absurdo que además desborda su casilla en la ficha y en la tarjeta
// de compartir.
const VELOCIDAD_PLAUSIBLE_MAX_KMH = 45;

// Intervalo mínimo entre dos puntos para confiar en la velocidad calculada
// entre ellos. Con un intervalo muy corto, el error normal del GPS (unos
// pocos metros) pesa proporcionalmente mucho más que el movimiento real y
// puede inflar la velocidad implícita sin que haya habido ningún salto de
// posición grande.
const DT_MINIMO_CONFIABLE_SEG = 2;

// Velocidad máxima entre dos puntos consecutivos (km/h), usada en la ficha de
// detalle de "Mis rutas". Como los puntos vienen decimados desde el backend,
// esto es una aproximación (no ve cada micro-tramo real del recorrido).
export function velocidadMaximaKmH(puntos: PuntoGps[]): number {
  let maxima = 0;
  for (let i = 1; i < puntos.length; i++) {
    const dtSeg = (puntos[i].timestamp - puntos[i - 1].timestamp) / 1000;
    if (dtSeg < DT_MINIMO_CONFIABLE_SEG) continue;
    const distKm = distanciaHaversineKm(puntos[i - 1], puntos[i]);
    const kmh = (distKm / dtSeg) * 3600;
    if (kmh > maxima && kmh <= VELOCIDAD_PLAUSIBLE_MAX_KMH) maxima = kmh;
  }
  return maxima;
}

// El GPS real nunca cae justo en la línea recta -- un tramo recto de verdad
// se ve con un zigzag de unos metros que nunca pasó. Esto es SOLO para
// dibujar la línea (Polyline del mapa, vista previa chica de Mis Rutas) --
// nunca usar el resultado para distancia/velocidad, esas deben seguir
// viniendo de los puntos reales sin alterar. Algoritmo Douglas-Peucker:
// aplana tramos casi rectos sin perder curvas reales (una curva de verdad se
// aleja más que la tolerancia de la línea entre sus extremos y sus puntos se
// conservan). Misma idea que TOLERANCIA_SIMPLIFICADO_KM en
// geo-flyover.util.ts (backend, para la cámara del video 3D) -- duplicada
// acá porque el proyecto no comparte código entre frontend/backend.
const TOLERANCIA_SIMPLIFICADO_DIBUJO_KM = 0.01; // 10 metros

function distanciaPerpendicularKm(punto: PuntoGps, a: PuntoGps, b: PuntoGps): number {
  const KM_POR_GRADO_LAT = 111.32;
  const cosLat = Math.cos((a.lat * Math.PI) / 180);
  const ax = a.lon * cosLat;
  const ay = a.lat;
  const bx = b.lon * cosLat;
  const by = b.lat;
  const px = punto.lon * cosLat;
  const py = punto.lat;

  const dx = bx - ax;
  const dy = by - ay;
  const largoCuadrado = dx * dx + dy * dy;
  const t =
    largoCuadrado > 0
      ? Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / largoCuadrado))
      : 0;
  const proyX = ax + t * dx;
  const proyY = ay + t * dy;
  return Math.sqrt((px - proyX) ** 2 + (py - proyY) ** 2) * KM_POR_GRADO_LAT;
}

export function simplificarRutaParaDibujo(
  puntos: PuntoGps[],
  toleranciaKm: number = TOLERANCIA_SIMPLIFICADO_DIBUJO_KM,
): PuntoGps[] {
  if (puntos.length <= 2) return puntos;

  let distanciaMaxima = 0;
  let indiceMaximo = 0;
  const inicio = puntos[0];
  const fin = puntos[puntos.length - 1];
  for (let i = 1; i < puntos.length - 1; i++) {
    const d = distanciaPerpendicularKm(puntos[i], inicio, fin);
    if (d > distanciaMaxima) {
      distanciaMaxima = d;
      indiceMaximo = i;
    }
  }

  if (distanciaMaxima > toleranciaKm) {
    const izquierda = simplificarRutaParaDibujo(puntos.slice(0, indiceMaximo + 1), toleranciaKm);
    const derecha = simplificarRutaParaDibujo(puntos.slice(indiceMaximo), toleranciaKm);
    return [...izquierda.slice(0, -1), ...derecha];
  }

  return [inicio, fin];
}
