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

// 45 km/h ya NO es un techo de velocidad real (un patinador de verdad puede
// superarlo en una bajada -- ver DH/"bajadas en cuenta" del club, hasta
// ~100 km/h reales) -- es el umbral que abre la duda sobre un tramo,
// resuelta después por clasificarTramos() mirando si hay desplazamiento neto
// real o no (ver su comentario). Se mantiene el mismo nombre porque sigue
// siendo la referencia de "esto ya no es un ritmo normal de patinaje, hay
// que revisarlo".
const VELOCIDAD_PLAUSIBLE_MAX_KMH = 45;

// El GPS real nunca cae justo en la línea recta -- un tramo recto de verdad
// se ve con un zigzag de unos metros que nunca pasó. Esto es SOLO para
// dibujar la línea (Polyline del mapa, vista previa chica de Mis Rutas) --
// nunca usar el resultado para distancia/velocidad, esas deben seguir
// viniendo de los puntos reales sin alterar. Algoritmo Douglas-Peucker:
// aplana tramos casi rectos sin perder curvas reales (una curva de verdad se
// aleja más que la tolerancia de la línea entre sus extremos y sus puntos se
// conservan). Misma idea que TOLERANCIA_SIMPLIFICADO_KM en
// geo-flyover.util.ts (backend, para la cámara del video 3D) -- duplicada
// acá porque el proyecto no comparte código entre frontend/backend. También
// se reutiliza como piso de distancia "insignificante" en clasificarTramos
// cuando el intervalo entre dos puntos es nulo o negativo (ver más abajo).
const TOLERANCIA_SIMPLIFICADO_DIBUJO_KM = 0.01; // 10 metros

function kmhEntrePuntos(a: PuntoGps, b: PuntoGps): number {
  const dtSeg = (b.timestamp - a.timestamp) / 1000;
  const distKm = distanciaHaversineKm(a, b);
  // Intervalo nulo/negativo entre timestamps: no hay un "por segundo" real
  // con qué dividir. Un salto de posición ahí de todos modos se nota en la
  // distancia sola (ver TOLERANCIA_SIMPLIFICADO_DIBUJO_KM) -- se devuelve
  // Infinity para que ese tramo entre igual a la racha sospechosa de más
  // abajo, en vez de perderse silenciosamente por esta división imposible.
  if (dtSeg <= 0) return distKm > TOLERANCIA_SIMPLIFICADO_DIBUJO_KM ? Infinity : 0;
  return (distKm / dtSeg) * 3600;
}

export type ClasificacionTramo = "normal" | "rapidoValido" | "saltoGps";

// Clasifica cada tramo (par de puntos consecutivos) del recorrido. Devuelve
// un arreglo del mismo largo que `puntos`; clasificacion[i] describe el
// tramo que TERMINA en puntos[i] (clasificacion[0] no se usa).
//
// 45 km/h (VELOCIDAD_PLAUSIBLE_MAX_KMH) solo abre la duda -- no descarta
// nada por sí solo. Cualquier racha de tramos consecutivos por encima de ese
// umbral se resuelve con una sola prueba física, sin importar si la racha
// dura un tramo o varios: se compara el desplazamiento NETO de punta a
// punta de toda la racha (del último punto normal ANTES, al primer punto
// normal DESPUÉS, salteando por completo los puntos intermedios
// sospechosos) contra el mismo umbral.
//   - Si ese neto TAMBIÉN implica velocidad alta, hubo desplazamiento real
//     de principio a fin -- típico de una bajada real, con aceleración y
//     desaceleración coherentes (racha "rapidoValido": el pico real, aunque
//     sea 57 km/h, cuenta como válido).
//   - Si el neto colapsa a algo parecido a la velocidad de antes de la
//     racha, los puntos intermedios no representaron desplazamiento real --
//     fueron ruido o un rebote de señal que "fue y volvió" (racha
//     "saltoGps"), sin importar si fue un solo tramo raro o varios seguidos
//     (dos lecturas de GPS malas seguidas son tan posibles como una).
// Si la racha llega hasta el final del arreglo (no hay punto normal
// después con qué comparar), se acepta por defecto -- no hay forma de
// desmentirla con los datos disponibles, y es justo la cola de
// desaceleración de una bajada real la que más fácil queda al final.
//
// Se comparte entre velocidadMaximaKmH/velocidadMaximaConPunto (qué número
// mostrar) y dividirEnTramosParaDibujo (dónde cortar el trazado) para que la
// ficha y el mapa nunca se contradigan sobre el mismo tramo.
export function clasificarTramos(puntos: PuntoGps[]): ClasificacionTramo[] {
  const clasificacion: ClasificacionTramo[] = puntos.map(() => "normal");
  let i = 1;
  while (i < puntos.length) {
    if (kmhEntrePuntos(puntos[i - 1], puntos[i]) <= VELOCIDAD_PLAUSIBLE_MAX_KMH) {
      i++;
      continue;
    }
    let fin = i;
    while (
      fin + 1 < puntos.length &&
      kmhEntrePuntos(puntos[fin], puntos[fin + 1]) > VELOCIDAD_PLAUSIBLE_MAX_KMH
    ) {
      fin++;
    }
    const hayPuntoDespues = fin + 1 < puntos.length;
    const esValida =
      !hayPuntoDespues ||
      kmhEntrePuntos(puntos[i - 1], puntos[fin + 1]) > VELOCIDAD_PLAUSIBLE_MAX_KMH;
    const etiqueta: ClasificacionTramo = esValida ? "rapidoValido" : "saltoGps";
    for (let j = i; j <= fin; j++) clasificacion[j] = etiqueta;
    i = fin + 1;
  }
  return clasificacion;
}

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
  const clasificacion = clasificarTramos(puntos);
  let maxima = 0;
  for (let i = 1; i < puntos.length; i++) {
    if (clasificacion[i] === "saltoGps") continue;
    const dtSeg = (puntos[i].timestamp - puntos[i - 1].timestamp) / 1000;
    if (dtSeg < DT_MINIMO_CONFIABLE_SEG) continue;
    const distKm = distanciaHaversineKm(puntos[i - 1], puntos[i]);
    const kmh = (distKm / dtSeg) * 3600;
    if (kmh > maxima) maxima = kmh;
  }
  return maxima;
}

export interface VelocidadMaximaConPunto {
  kmh: number;
  // Punto e índice (dentro de `puntos`) donde se alcanzó -- el índice sirve
  // para ubicar el tramo dentro de una animación (ver tarjetaRecorrido.ts,
  // que necesita saber en qué fracción del recorrido "prender" la marca de
  // velocidad máxima sobre el mapa). null si el recorrido no tiene ningún
  // tramo confiable (ver DT_MINIMO_CONFIABLE_SEG).
  punto: PuntoGps | null;
  indice: number;
}

// Misma lógica que velocidadMaximaKmH, pero además devuelve DÓNDE pasó --
// pensado para el video del recorrido, que marca ese punto sobre el mapa en
// vez de mostrar solo el número.
export function velocidadMaximaConPunto(puntos: PuntoGps[]): VelocidadMaximaConPunto {
  const clasificacion = clasificarTramos(puntos);
  let maxima = 0;
  let punto: PuntoGps | null = null;
  let indice = -1;
  for (let i = 1; i < puntos.length; i++) {
    if (clasificacion[i] === "saltoGps") continue;
    const dtSeg = (puntos[i].timestamp - puntos[i - 1].timestamp) / 1000;
    if (dtSeg < DT_MINIMO_CONFIABLE_SEG) continue;
    const distKm = distanciaHaversineKm(puntos[i - 1], puntos[i]);
    const kmh = (distKm / dtSeg) * 3600;
    if (kmh > maxima) {
      maxima = kmh;
      punto = puntos[i];
      indice = i;
    }
  }
  return { kmh: maxima, punto, indice };
}

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

// Divide el trazado en tramos separados por cada racha que clasificarTramos
// resuelve como "saltoGps" (ver su comentario) -- nunca por una racha
// "rapidoValido" (bajada real, aunque sea rápida y varios tramos seguidos).
// Sin esto, el punto válido previo al salto y el punto válido posterior
// quedaban unidos por una línea recta en el mapa, como si el patinador se
// hubiera desplazado instantáneamente entre ambos. Cada tramo se dibuja como
// una Polyline aparte -- el hueco entre tramos simplemente no se dibuja.
export function dividirEnTramosParaDibujo(puntos: PuntoGps[]): PuntoGps[][] {
  if (puntos.length === 0) return [];
  const clasificacion = clasificarTramos(puntos);
  const tramos: PuntoGps[][] = [[puntos[0]]];
  for (let i = 1; i < puntos.length; i++) {
    if (clasificacion[i] === "saltoGps") {
      tramos.push([puntos[i]]);
    } else {
      tramos[tramos.length - 1].push(puntos[i]);
    }
  }
  return tramos;
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
