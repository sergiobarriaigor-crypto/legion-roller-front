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

function mediana(valores: number[]): number {
  if (valores.length === 0) return 0;
  const ordenados = [...valores].sort((a, b) => a - b);
  const mitad = Math.floor(ordenados.length / 2);
  return ordenados.length % 2 === 0 ? (ordenados[mitad - 1] + ordenados[mitad]) / 2 : ordenados[mitad];
}

// Intervalo mínimo entre dos puntos para confiar en la velocidad calculada
// entre ellos. Con un intervalo muy corto, el error normal del GPS (unos
// pocos metros) pesa proporcionalmente mucho más que el movimiento real y
// puede inflar la velocidad implícita sin que haya habido ningún salto de
// posición grande (rutas reales han mostrado dt de 0.01-0.02s con
// velocidades de decenas de miles de km/h -- timestamps casi duplicados,
// no movimiento real).
const DT_MINIMO_CONFIABLE_SEG = 2;

// Velocidad real máxima documentada para patinaje -- la misma referencia que
// ya usaba el comentario original de VELOCIDAD_PLAUSIBLE_MAX_KMH ("bajadas
// en cuenta" del club, hasta ~100 km/h reales). ÚNICO número que hace falta
// ajustar si algún día se registra una bajada más rápida -- los dos techos
// de abajo se DERIVAN de este con un factor justificado cada uno, no son
// constantes independientes ("números mágicos" sueltos).
const VELOCIDAD_REAL_MAXIMA_PATINAJE_KMH = 100;

// Margen sobre la velocidad real máxima para UN SOLO tramo (pico aislado):
// tolera una bajada récord genuina o ruido de GPS que infle un único punto,
// sin aceptar nada groseramente por encima.
const FACTOR_TECHO_PICO_INDIVIDUAL = 1.3; // -> 130 km/h

// Margen para la MEDIANA de una racha completa -- más chico que el de
// arriba: una mediana ya es el ritmo TÍPICO de varios tramos, no un solo
// dato posiblemente ruidoso, así que si ya está cerca del techo real es más
// sospechoso que un pico aislado.
const FACTOR_TECHO_MEDIANA_RACHA = 0.9; // -> 90 km/h

// Perfil de clasificación: agrupa los 4 parámetros que decide clasificarTramos
// para poder reutilizar la misma lógica con otra actividad en el futuro
// (bicicleta, vehículo -- velocidades reales plausibles muy distintas a
// patinaje) sin tocar la función, solo pasando otro perfil. PERFIL_PATINAJE
// es el default -- ningún llamador existente (velocidadMaximaKmH,
// velocidadMaximaConPunto, dividirEnTramosParaDibujo) necesita cambiar.
export interface PerfilClasificacionGps {
  dtMinimoConfiableSeg: number;
  velocidadAbreSospechaKmh: number;
  techoPicoIndividualKmh: number;
  techoMedianaRachaKmh: number;
}

export const PERFIL_PATINAJE: PerfilClasificacionGps = {
  dtMinimoConfiableSeg: DT_MINIMO_CONFIABLE_SEG,
  velocidadAbreSospechaKmh: VELOCIDAD_PLAUSIBLE_MAX_KMH,
  techoPicoIndividualKmh: VELOCIDAD_REAL_MAXIMA_PATINAJE_KMH * FACTOR_TECHO_PICO_INDIVIDUAL,
  techoMedianaRachaKmh: VELOCIDAD_REAL_MAXIMA_PATINAJE_KMH * FACTOR_TECHO_MEDIANA_RACHA,
};

export type ClasificacionTramo = "normal" | "rapidoValido" | "saltoGps";

// Clasifica cada tramo (par de puntos consecutivos) del recorrido. Devuelve
// un arreglo del mismo largo que `puntos`; clasificacion[i] describe el
// tramo que TERMINA en puntos[i] (clasificacion[0] no se usa). `puntos`
// nunca se toca ni se filtra -- esto es solo una clasificación paralela.
//
// 45 km/h (VELOCIDAD_PLAUSIBLE_MAX_KMH) sigue siendo el umbral que abre la
// duda sobre un tramo -- eso no cambió. Lo que cambió es cómo se resuelve
// esa duda: antes, un solo chequeo (desplazamiento neto de punta a punta de
// la racha) decidía todo, y podía aceptar una racha con velocidad neta apenas
// sobre 45 km/h aunque adentro tuviera tramos individuales de 300+ km/h (caso
// real observado). Ahora son 4 capas, cada una cubriendo el punto ciego de
// la anterior:
//
//   Capa 0 (dt): un intervalo menor a dtMinimoConfiableSeg nunca llega a
//   calcularse como velocidad -- se marca saltoGps directo (timestamp casi
//   duplicado/corrupto), sin dejar que ese número (a veces Infinity, a veces
//   decenas de miles de km/h) arrastre los límites de una racha vecina.
//
//   Capa 1 (techo por pico individual): dentro de una racha sospechosa, un
//   tramo que por sí solo supera techoPicoIndividualKmh se marca saltoGps
//   SOLO, sin invalidar el resto de la racha (un pico absurdo en medio de
//   tramos por lo demás coherentes no debe arrastrarlos).
//
//   Capa 2 (mediana de lo que queda): si el ritmo TÍPICO de los tramos que
//   sobrevivieron a la Capa 1 (mediana, robusta a los 1-2 valores más
//   extremos) ya supera techoMedianaRachaKmh, la racha completa es
//   sistemáticamente implausible -- no alcanza con que no tenga un pico
//   puntual, el conjunto ya es demasiado rápido para ser real.
//
//   Capa 3 (neto, respaldo): mismo chequeo de siempre, como red de
//   seguridad para rachas cortas donde una mediana de 1-2 puntos no dice
//   mucho por sí sola.
//
// Si la racha llega hasta el final del arreglo (no hay punto normal después
// con qué comparar en la Capa 3), se acepta por defecto en esa capa --
// mismo criterio que antes, no hay forma de desmentirla con los datos
// disponibles.
//
// Se comparte entre velocidadMaximaKmH/velocidadMaximaConPunto (qué número
// mostrar) y dividirEnTramosParaDibujo (dónde cortar el trazado) para que la
// ficha y el mapa nunca se contradigan sobre el mismo tramo.
export function clasificarTramos(
  puntos: PuntoGps[],
  perfil: PerfilClasificacionGps = PERFIL_PATINAJE,
): ClasificacionTramo[] {
  const clasificacion: ClasificacionTramo[] = puntos.map(() => "normal");
  let i = 1;
  while (i < puntos.length) {
    const dtSeg = (puntos[i].timestamp - puntos[i - 1].timestamp) / 1000;
    if (dtSeg < perfil.dtMinimoConfiableSeg) {
      clasificacion[i] = "saltoGps"; // Capa 0
      i++;
      continue;
    }
    if (kmhEntrePuntos(puntos[i - 1], puntos[i]) <= perfil.velocidadAbreSospechaKmh) {
      i++;
      continue;
    }

    let fin = i;
    const segmentos: { indice: number; kmh: number }[] = [
      { indice: i, kmh: kmhEntrePuntos(puntos[i - 1], puntos[i]) },
    ];
    while (fin + 1 < puntos.length) {
      const dtSig = (puntos[fin + 1].timestamp - puntos[fin].timestamp) / 1000;
      if (dtSig < perfil.dtMinimoConfiableSeg) {
        clasificacion[fin + 1] = "saltoGps"; // Capa 0, dentro de la racha
        fin++;
        continue;
      }
      const kmhSig = kmhEntrePuntos(puntos[fin], puntos[fin + 1]);
      if (kmhSig <= perfil.velocidadAbreSospechaKmh) break;
      fin++;
      segmentos.push({ indice: fin, kmh: kmhSig });
    }

    const picos = segmentos.filter((s) => s.kmh > perfil.techoPicoIndividualKmh);
    picos.forEach((p) => {
      clasificacion[p.indice] = "saltoGps"; // Capa 1
    });
    const resto = segmentos.filter((s) => s.kmh <= perfil.techoPicoIndividualKmh);

    const medianaResto = mediana(resto.map((s) => s.kmh));
    const rachaSistemica = resto.length > 0 && medianaResto > perfil.techoMedianaRachaKmh; // Capa 2

    const hayPuntoDespues = fin + 1 < puntos.length;
    const netoValido =
      !hayPuntoDespues || kmhEntrePuntos(puntos[i - 1], puntos[fin + 1]) > perfil.velocidadAbreSospechaKmh; // Capa 3

    const etiquetaRacha: ClasificacionTramo = !rachaSistemica && netoValido ? "rapidoValido" : "saltoGps";
    resto.forEach((s) => {
      clasificacion[s.indice] = etiquetaRacha;
    });

    i = fin + 1;
  }
  return clasificacion;
}

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
