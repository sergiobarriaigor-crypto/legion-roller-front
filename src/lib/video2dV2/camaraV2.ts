// V2 -- Fase 2: cámara única en espacio Z17 para toda la coreografía
// (panorámica inicial -> paneo -> acercamiento -> seguimiento -> alejamiento
// -> paneo final -> panorámica final). Independiente de tarjetaRecorrido.ts
// (V1) -- solo comparte geo.ts (distanciaHaversineKm/PuntoGps), que ya es de
// uso general y no tiene lógica de video.
import { distanciaHaversineKm, type PuntoGps } from "@/lib/geo";
import { lonAPixelX, latAPixelY, TAM_TILE } from "./proyeccion";
import type { GrillaAnchaResultado } from "./grillaAncha";
import { rangoTilesVisibles } from "./renderV2";

export const ZOOM_SEGUIMIENTO = 17;
export const ESCALA_SEGUIMIENTO = 0.6; // mismo valor de referencia ya validado en V1
export const ANCHO_VIDEO = 720;
export const ALTO_VIDEO = 1280;

// --- Cámara de seguimiento: anticipación y suavizado ---
// Mismos valores/fórmulas ya validados en V1 (tarjetaRecorrido.ts), portados
// acá porque V2 no importa de ese archivo. Sin el clamp a "bordes del mapa
// cargado" que tenía estadoCamara en V1 -- ya no hace falta: acá no hay un
// PNG panorámico de tamaño finito, la grilla Z17 es continua.
const RADIO_TOLERANCIA_PX = 72;
const FACTOR_SUAVIZADO_CAMARA = 0.18;
const FRACCION_INICIO_CONVERGENCIA_CAMARA = 0.92;
const DISTANCIA_ANTICIPACION_KM = 0.12;
const DESPLAZAMIENTO_ANTICIPACION_PX = 70;
const MAX_DESPLAZAMIENTO_ANTICIPACION_PX = 90;
const FACTOR_SUAVIZADO_ANTICIPACION = 0.08;

// --- Crossfade entre grilla ancha y grilla Z17 ---
// Derivado de zoomAncho (vía factorAncho), NO un número fijo: el punto de
// corte es la escala a la que la grilla ancha empieza a upscalearse más
// allá de un umbral de nitidez aceptable (UMBRAL_NITIDEZ_ANCHA=sqrt(2),
// "medio nivel de zoom" de margen -- el punto medio geométrico entre verla
// nítida (1x nativo) y un nivel de zoom más). El ancho de la ventana
// también es relativo (en niveles de zoom equivalentes), no en unidades de
// escala fijas.
const UMBRAL_NITIDEZ_ANCHA = Math.SQRT2;
const ANCHO_CROSSFADE_ZOOM_LEVELS = 1;

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function suavizar(t: number): number {
  const c = clamp(t, 0, 1);
  return c * c * (3 - 2 * c);
}

export interface EstadoCamaraV2 {
  cx: number;
  cy: number;
  escala: number;
}

export interface VentanaCrossfade {
  factorAncho: number;
  escalaCorte: number;
  escalaInferior: number;
  escalaSuperior: number;
}

export function calcularVentanaCrossfade(zoomAncho: number): VentanaCrossfade {
  const factorAncho = 2 ** (zoomAncho - ZOOM_SEGUIMIENTO);
  const escalaCorte = factorAncho * UMBRAL_NITIDEZ_ANCHA;
  const anchoFactor = 2 ** (ANCHO_CROSSFADE_ZOOM_LEVELS / 2);
  return {
    factorAncho,
    escalaCorte,
    escalaInferior: escalaCorte / anchoFactor,
    escalaSuperior: escalaCorte * anchoFactor,
  };
}

// Peso (0..1) con el que debe dibujarse Z17 encima de la grilla ancha, dado
// el estado actual de `escala` -- interpolado en espacio LOGARÍTMICO
// (log2(escala)) porque la relación entre zooms es multiplicativa, no
// aditiva. Fuera de la ventana, 0 (solo ancha) o 1 (solo Z17) exactos.
export function pesoZ17DesdeEscala(escala: number, ventana: VentanaCrossfade): number {
  if (escala <= ventana.escalaInferior) return 0;
  if (escala >= ventana.escalaSuperior) return 1;
  const t =
    (Math.log2(escala) - Math.log2(ventana.escalaInferior)) /
    (Math.log2(ventana.escalaSuperior) - Math.log2(ventana.escalaInferior));
  return suavizar(t);
}

export interface RutaCoreografiaV2 {
  puntosZ17: { x: number; y: number }[];
  distanciaAcumuladaKm: number[];
  distanciaTotalKm: number;
  centroide: EstadoCamaraV2;
  inicioSeguimiento: EstadoCamaraV2;
  finSeguimiento: EstadoCamaraV2;
}

function puntoADistanciaKmZ17(
  puntosZ17: { x: number; y: number }[],
  distanciaAcumuladaKm: number[],
  distObjetivoKmCrudo: number,
): { x: number; y: number } {
  const distTotal = distanciaAcumuladaKm[distanciaAcumuladaKm.length - 1];
  const distObjetivoKm = clamp(distObjetivoKmCrudo, 0, distTotal);
  let i = 0;
  while (i < puntosZ17.length - 2 && distanciaAcumuladaKm[i + 1] <= distObjetivoKm) i++;
  const distTramoKm = distanciaAcumuladaKm[i + 1] - distanciaAcumuladaKm[i];
  const progresoTramo = distTramoKm > 0 ? clamp((distObjetivoKm - distanciaAcumuladaKm[i]) / distTramoKm, 0, 1) : 0;
  return {
    x: puntosZ17[i].x + (puntosZ17[i + 1].x - puntosZ17[i].x) * progresoTramo,
    y: puntosZ17[i].y + (puntosZ17[i + 1].y - puntosZ17[i].y) * progresoTramo,
  };
}

function focoActualEnFraccion(ruta: RutaCoreografiaV2, fraccionTrazo: number): { x: number; y: number } {
  return puntoADistanciaKmZ17(ruta.puntosZ17, ruta.distanciaAcumuladaKm, fraccionTrazo * ruta.distanciaTotalKm);
}

interface DireccionAnticipacion {
  dx: number;
  dy: number;
}

function calcularFocoConAnticipacionV2(
  ruta: RutaCoreografiaV2,
  focoActual: { x: number; y: number },
  fraccionTrazo: number,
  direccionAnterior: DireccionAnticipacion | null,
): { foco: { x: number; y: number }; direccion: DireccionAnticipacion } {
  const distanciaActualKm = fraccionTrazo * ruta.distanciaTotalKm;
  const puntoAdelante = puntoADistanciaKmZ17(
    ruta.puntosZ17,
    ruta.distanciaAcumuladaKm,
    distanciaActualKm + DISTANCIA_ANTICIPACION_KM,
  );
  let dx = puntoAdelante.x - focoActual.x;
  let dy = puntoAdelante.y - focoActual.y;
  const dist = Math.hypot(dx, dy);
  if (dist > 0) {
    dx /= dist;
    dy /= dist;
  }
  let direccion: DireccionAnticipacion = { dx, dy };
  if (direccionAnterior) {
    if (dist === 0) {
      direccion = direccionAnterior;
    } else {
      const sx = direccionAnterior.dx + (dx - direccionAnterior.dx) * FACTOR_SUAVIZADO_ANTICIPACION;
      const sy = direccionAnterior.dy + (dy - direccionAnterior.dy) * FACTOR_SUAVIZADO_ANTICIPACION;
      const norm = Math.hypot(sx, sy);
      direccion = norm > 0 ? { dx: sx / norm, dy: sy / norm } : direccionAnterior;
    }
  }
  const desplazamiento = Math.min(DESPLAZAMIENTO_ANTICIPACION_PX, MAX_DESPLAZAMIENTO_ANTICIPACION_PX) / ESCALA_SEGUIMIENTO;
  return {
    foco: { x: focoActual.x + direccion.dx * desplazamiento, y: focoActual.y + direccion.dy * desplazamiento },
    direccion,
  };
}

// Puerto exacto de suavizarCamara() de V1 (misma zona muerta + suavizado +
// rampa de convergencia final), sin el clamp a bordes de mapa (no aplica en
// Z17 continuo). fraccionTrazo acá es 0..1 relativo SOLO al tramo de
// seguimiento (no a todo el video, a diferencia de V1).
function suavizarCamaraV2(
  objetivo: { x: number; y: number },
  anterior: { cx: number; cy: number } | null,
  fraccionTrazo: number,
): { cx: number; cy: number } {
  if (!anterior) return { cx: objetivo.x, cy: objetivo.y };

  if (fraccionTrazo >= FRACCION_INICIO_CONVERGENCIA_CAMARA) {
    const t = suavizar((fraccionTrazo - FRACCION_INICIO_CONVERGENCIA_CAMARA) / (1 - FRACCION_INICIO_CONVERGENCIA_CAMARA));
    const factor = Math.max(FACTOR_SUAVIZADO_CAMARA, t);
    return {
      cx: anterior.cx + (objetivo.x - anterior.cx) * factor,
      cy: anterior.cy + (objetivo.y - anterior.cy) * factor,
    };
  }

  const radioBase = RADIO_TOLERANCIA_PX / ESCALA_SEGUIMIENTO;
  const dx = objetivo.x - anterior.cx;
  const dy = objetivo.y - anterior.cy;
  const dist = Math.hypot(dx, dy);
  if (dist <= radioBase) return { cx: anterior.cx, cy: anterior.cy };
  const excedente = dist - radioBase;
  const objetivoEfectivoX = anterior.cx + (dx / dist) * excedente;
  const objetivoEfectivoY = anterior.cy + (dy / dist) * excedente;
  return {
    cx: anterior.cx + (objetivoEfectivoX - anterior.cx) * FACTOR_SUAVIZADO_CAMARA,
    cy: anterior.cy + (objetivoEfectivoY - anterior.cy) * FACTOR_SUAVIZADO_CAMARA,
  };
}

export interface EstadoRecursivoSeguimientoV2 {
  direccion: DireccionAnticipacion | null;
  camaraSuavizada: { cx: number; cy: number } | null;
}

export function crearEstadoRecursivoV2(): EstadoRecursivoSeguimientoV2 {
  return { direccion: null, camaraSuavizada: null };
}

// Un paso de la recursión de seguimiento -- MUTA `estado` (mismo patrón que
// los refs de V1). Debe llamarse con fraccionTrazo creciente.
export function pasoSeguimientoV2(
  ruta: RutaCoreografiaV2,
  fraccionTrazo: number,
  estado: EstadoRecursivoSeguimientoV2,
): EstadoCamaraV2 {
  const focoActual = focoActualEnFraccion(ruta, fraccionTrazo);
  const { foco: focoAnticipado, direccion } = calcularFocoConAnticipacionV2(ruta, focoActual, fraccionTrazo, estado.direccion);
  estado.direccion = direccion;
  const suavizada = suavizarCamaraV2(focoAnticipado, estado.camaraSuavizada, fraccionTrazo);
  estado.camaraSuavizada = suavizada;
  return { cx: suavizada.cx, cy: suavizada.cy, escala: ESCALA_SEGUIMIENTO };
}

// Resimula desde fraccionTrazo=0 hasta el objetivo -- usado por el scrubber
// (para reconstruir un estado consistente sin depender de reproducción en
// vivo previa) y para calcular inicioSeguimiento/finSeguimiento. La
// granularidad (`pasos`) afecta el resultado (es una recursión con lag,
// como en V1) -- se recomienda pasarlo proporcional a duración×fps para
// que se parezca a la reproducción real.
export function resimularSeguimientoV2(ruta: RutaCoreografiaV2, fraccionTrazoObjetivo: number, pasos = 240): EstadoCamaraV2 {
  const estado = crearEstadoRecursivoV2();
  const objetivo = clamp(fraccionTrazoObjetivo, 0, 1);
  let resultado: EstadoCamaraV2 = { cx: ruta.puntosZ17[0].x, cy: ruta.puntosZ17[0].y, escala: ESCALA_SEGUIMIENTO };
  for (let i = 1; i <= pasos; i++) {
    resultado = pasoSeguimientoV2(ruta, (objetivo * i) / pasos, estado);
  }
  return resultado;
}

// Construye la ruta + los tres puntos de anclaje de la coreografía
// (centroide/inicioSeguimiento/finSeguimiento) a partir de datos GPS reales
// y la grilla ancha ya elegida (ver grillaAncha.ts). No modifica datos GPS,
// solo proyecta a Z17 y calcula distancias (distanciaHaversineKm, de
// geo.ts, sin tocar).
//
// `distanciaTotalKmOficial` (opcional): la distancia real guardada del
// recorrido (datos.distanciaKm), para que el video muestre y escale sus
// fracciones contra el MISMO número que la imagen resumen y la ruta
// oficial -- nunca uno recalculado acá. `distanciaAcumuladaKm` se sigue
// derivando de `puntos` (lo necesita la interpolación por fracción para
// ubicar cada posición a lo largo del trazo real); si no se pasa (debug-
// video-v2, que no tiene un valor oficial de referencia), se mantiene el
// comportamiento anterior de autocalcularla sumando los mismos puntos.
export function construirRutaCoreografiaV2(
  puntos: PuntoGps[],
  grillaAncha: GrillaAnchaResultado,
  distanciaTotalKmOficial?: number,
): RutaCoreografiaV2 {
  const puntosZ17 = puntos.map((p) => ({
    x: lonAPixelX(p.lon, ZOOM_SEGUIMIENTO),
    y: latAPixelY(p.lat, ZOOM_SEGUIMIENTO),
  }));
  const distanciaAcumuladaKm = [0];
  for (let i = 1; i < puntos.length; i++) {
    distanciaAcumuladaKm.push(distanciaAcumuladaKm[i - 1] + distanciaHaversineKm(puntos[i - 1], puntos[i]));
  }
  const distanciaTotalKm = distanciaTotalKmOficial ?? distanciaAcumuladaKm[distanciaAcumuladaKm.length - 1];

  const factorAncho = 2 ** (grillaAncha.zoom - ZOOM_SEGUIMIENTO);
  const anchoWidePx = (grillaAncha.tileXMax - grillaAncha.tileXMin + 1) * TAM_TILE;
  const altoWidePx = (grillaAncha.tileYMax - grillaAncha.tileYMin + 1) * TAM_TILE;
  const escalaCropAnchaQueEntra = Math.min(ANCHO_VIDEO / anchoWidePx, ALTO_VIDEO / altoWidePx);
  const centroWideX = ((grillaAncha.tileXMin + grillaAncha.tileXMax + 1) / 2) * TAM_TILE;
  const centroWideY = ((grillaAncha.tileYMin + grillaAncha.tileYMax + 1) / 2) * TAM_TILE;
  const centroide: EstadoCamaraV2 = {
    cx: centroWideX / factorAncho,
    cy: centroWideY / factorAncho,
    escala: escalaCropAnchaQueEntra * factorAncho,
  };

  const rutaParcial: RutaCoreografiaV2 = {
    puntosZ17,
    distanciaAcumuladaKm,
    distanciaTotalKm,
    centroide,
    inicioSeguimiento: { cx: puntosZ17[0].x, cy: puntosZ17[0].y, escala: ESCALA_SEGUIMIENTO },
    finSeguimiento: { cx: puntosZ17[puntosZ17.length - 1].x, cy: puntosZ17[puntosZ17.length - 1].y, escala: ESCALA_SEGUIMIENTO },
  };
  const inicioSeguimiento = resimularSeguimientoV2(rutaParcial, 0, 1);
  const finSeguimiento = resimularSeguimientoV2(rutaParcial, 1, 240);

  return { ...rutaParcial, inicioSeguimiento, finSeguimiento };
}

// Duración de referencia para el tramo de seguimiento -- mismos valores ya
// validados en V1 (SEGUNDOS_POR_KM_SEGUIMIENTO/DURACION_TRAZO_MIN_SEG/
// DURACION_TRAZO_MAX_SEG), sin la conversión a duracionAnimSeg (acá el
// tramo de seguimiento ya es 0..1 propio, no comparte eje con intro/outro).
const SEGUNDOS_POR_KM_SEGUIMIENTO = 1.8;
const DURACION_TRAZO_MIN_SEG = 7;
const DURACION_TRAZO_MAX_SEG = 26;

export function calcularDuracionSeguimientoV2(distanciaKm: number): number {
  return clamp(distanciaKm * SEGUNDOS_POR_KM_SEGUIMIENTO, DURACION_TRAZO_MIN_SEG, DURACION_TRAZO_MAX_SEG);
}

export interface ParametrosCoreografiaV2 {
  duracionPanoramicaInicialSeg: number;
  duracionPaneoAcercamientoSeg: number;
  duracionSeguimientoSeg: number;
  duracionAlejamientoPaneoSeg: number;
  duracionPanoramicaFinalSeg: number;
  finPaneoFraccion: number; // 0..1 dentro del tramo paneo+acercamiento
  inicioZoomFraccion: number; // 0..1 dentro del tramo paneo+acercamiento
}

export function duracionTotalV2(params: ParametrosCoreografiaV2): number {
  return (
    params.duracionPanoramicaInicialSeg +
    params.duracionPaneoAcercamientoSeg +
    params.duracionSeguimientoSeg +
    params.duracionAlejamientoPaneoSeg +
    params.duracionPanoramicaFinalSeg
  );
}

export type FaseV2 = "panoramicaInicial" | "paneoAcercamiento" | "seguimiento" | "alejamientoPaneo" | "panoramicaFinal";

export interface ResultadoFaseV2 {
  fase: FaseV2;
  camara: EstadoCamaraV2;
  fraccionTrazo: number | null;
}

// Único punto de entrada de la coreografía completa: dado un tiempo real
// (segundos desde el arranque) devuelve la fase activa y la cámara. Fases
// A/B/C/E/F/G son funciones puras de `tiempoSeg` (interpolación con
// suavizar()); la fase D (seguimiento) es recursiva -- en modo
// "incremental" usa `estadoSeguimiento` (mutado in place, para reproducción
// en vivo cuadro a cuadro); en modo "resimular" reconstruye desde cero
// (para el scrubber).
export function calcularFaseYCamaraV2(
  ruta: RutaCoreografiaV2,
  params: ParametrosCoreografiaV2,
  tiempoSeg: number,
  estadoSeguimiento: EstadoRecursivoSeguimientoV2,
  modo: "incremental" | "resimular",
): ResultadoFaseV2 {
  const tA = params.duracionPanoramicaInicialSeg;
  const tBC = tA + params.duracionPaneoAcercamientoSeg;
  const tD = tBC + params.duracionSeguimientoSeg;
  const tEF = tD + params.duracionAlejamientoPaneoSeg;

  if (tiempoSeg <= tA) {
    return { fase: "panoramicaInicial", camara: { ...ruta.centroide }, fraccionTrazo: null };
  }

  if (tiempoSeg <= tBC) {
    const tauLocal = clamp((tiempoSeg - tA) / (tBC - tA), 0, 1);
    const pPan = suavizar(tauLocal / params.finPaneoFraccion);
    const pZoom = suavizar((tauLocal - params.inicioZoomFraccion) / (1 - params.inicioZoomFraccion));
    return {
      fase: "paneoAcercamiento",
      camara: {
        cx: ruta.centroide.cx + (ruta.inicioSeguimiento.cx - ruta.centroide.cx) * pPan,
        cy: ruta.centroide.cy + (ruta.inicioSeguimiento.cy - ruta.centroide.cy) * pPan,
        escala: ruta.centroide.escala + (ruta.inicioSeguimiento.escala - ruta.centroide.escala) * pZoom,
      },
      fraccionTrazo: null,
    };
  }

  if (tiempoSeg <= tD) {
    const fraccionTrazo = clamp((tiempoSeg - tBC) / (tD - tBC), 0, 1);
    const camara =
      modo === "incremental" ? pasoSeguimientoV2(ruta, fraccionTrazo, estadoSeguimiento) : resimularSeguimientoV2(ruta, fraccionTrazo);
    return { fase: "seguimiento", camara, fraccionTrazo };
  }

  if (tiempoSeg <= tEF) {
    // Espejo exacto de paneoAcercamiento: se reutiliza la MISMA curva
    // (pPan/pZoom con las mismas fracciones), evaluada con el tiempo
    // invertido -- literalmente reproducir B+C hacia atrás, entre
    // finSeguimiento y centroide en vez de centroide e inicioSeguimiento.
    const tauLocal = clamp((tiempoSeg - tD) / (tEF - tD), 0, 1);
    const tauInvertido = 1 - tauLocal;
    const pPan = suavizar(tauInvertido / params.finPaneoFraccion);
    const pZoom = suavizar((tauInvertido - params.inicioZoomFraccion) / (1 - params.inicioZoomFraccion));
    return {
      fase: "alejamientoPaneo",
      camara: {
        cx: ruta.centroide.cx + (ruta.finSeguimiento.cx - ruta.centroide.cx) * pPan,
        cy: ruta.centroide.cy + (ruta.finSeguimiento.cy - ruta.centroide.cy) * pPan,
        escala: ruta.centroide.escala + (ruta.finSeguimiento.escala - ruta.centroide.escala) * pZoom,
      },
      fraccionTrazo: null,
    };
  }

  return { fase: "panoramicaFinal", camara: { ...ruta.centroide }, fraccionTrazo: null };
}

// --- Corredor de tiles Z17 para la coreografía completa (sin segmentación
// todavía -- Fase 2 solo necesita que TODO lo que la cámara pueda mostrar
// esté preparado de antemano, sin importar el tamaño total). Cubre: (a) el
// tramo de seguimiento con el margen normal de V1 (viewport a
// ESCALA_SEGUIMIENTO + excursión de cámara), y (b) alrededor de los puntos
// de inicio/fin con el margen mucho mayor que necesita el acercamiento/
// alejamiento en el lugar a escalas bajas (viewport a escalaInferior, el
// extremo más ancho del crossfade).
export function construirCorredorZ17V2(ruta: RutaCoreografiaV2, ventana: VentanaCrossfade): Set<string> {
  const margenExcursionPx = RADIO_TOLERANCIA_PX + MAX_DESPLAZAMIENTO_ANTICIPACION_PX;
  const mitadAnchoSeguimiento = ANCHO_VIDEO / 2 / ESCALA_SEGUIMIENTO + margenExcursionPx;
  const mitadAltoSeguimiento = ALTO_VIDEO / 2 / ESCALA_SEGUIMIENTO + margenExcursionPx;
  const mitadAnchoTransicion = ANCHO_VIDEO / 2 / ventana.escalaInferior;
  const mitadAltoTransicion = ALTO_VIDEO / 2 / ventana.escalaInferior;

  const tiles = new Set<string>();
  function agregar(gx: number, gy: number, mitadAncho: number, mitadAlto: number): void {
    const tileXMin = Math.floor((gx - mitadAncho) / TAM_TILE);
    const tileXMax = Math.floor((gx + mitadAncho) / TAM_TILE);
    const tileYMin = Math.floor((gy - mitadAlto) / TAM_TILE);
    const tileYMax = Math.floor((gy + mitadAlto) / TAM_TILE);
    for (let ty = tileYMin; ty <= tileYMax; ty++) {
      for (let tx = tileXMin; tx <= tileXMax; tx++) tiles.add(`${tx}/${ty}`);
    }
  }

  for (const p of ruta.puntosZ17) agregar(p.x, p.y, mitadAnchoSeguimiento, mitadAltoSeguimiento);
  const inicio = ruta.puntosZ17[0];
  const fin = ruta.puntosZ17[ruta.puntosZ17.length - 1];
  agregar(inicio.x, inicio.y, mitadAnchoTransicion, mitadAltoTransicion);
  agregar(fin.x, fin.y, mitadAnchoTransicion, mitadAltoTransicion);
  return tiles;
}

// --- Cobertura real de la grilla ancha para TODA la coreografía ---
// elegirGrillaAncha() sólo decide QUÉ ZOOM usar (a partir del bbox de la
// ruta + margen fijo) -- no sabe nada de paneo/zoom de cámara. Acá, a
// zoom ya elegido y CONGELADO, se recorre la coreografía completa (mismo
// principio que la cobertura de tiles del intro en V1: precomputar la
// trayectoria real de cámara y unir los tiles que efectivamente pisa) y
// se agregan a la preparación los tiles anchos que la cámara necesita en
// cualquier instante donde la grilla ancha tenga opacidad > 0 (1-pesoZ17).
// No toca zoomAncho/ventana de crossfade/corredor Z17 -- sólo amplía qué
// tiles de la grilla ancha (al MISMO zoom) se preparan.
const LIMITE_TILES_COBERTURA_ANCHA = 2000; // resguardo, no debería alcanzarse en uso normal

export function construirCoberturaGrillaAnchaV2(
  ruta: RutaCoreografiaV2,
  ventana: VentanaCrossfade,
  params: ParametrosCoreografiaV2,
  factorAncho: number,
  pasos = 60,
): Set<string> {
  const tiles = new Set<string>();

  function agregarSiVisible(camara: EstadoCamaraV2): void {
    const pesoZ17 = pesoZ17DesdeEscala(camara.escala, ventana);
    if (pesoZ17 >= 1) return; // Z17 ya tapa del todo -- la grilla ancha no se ve acá
    const camaraAncha = { x: camara.cx * factorAncho, y: camara.cy * factorAncho };
    const escalaCropAncha = camara.escala / factorAncho;
    const rango = rangoTilesVisibles(camaraAncha, escalaCropAncha, ANCHO_VIDEO, ALTO_VIDEO);
    for (let ty = rango.tileYMin; ty <= rango.tileYMax; ty++) {
      for (let tx = rango.tileXMin; tx <= rango.tileXMax; tx++) {
        if (tiles.size < LIMITE_TILES_COBERTURA_ANCHA) tiles.add(`${tx}/${ty}`);
      }
    }
  }

  const duracionTotal = duracionTotalV2(params);
  const tBC = params.duracionPanoramicaInicialSeg + params.duracionPaneoAcercamientoSeg;
  const tD = tBC + params.duracionSeguimientoSeg;
  // Durante el seguimiento, escala es constante (ESCALA_SEGUIMIENTO) -- si
  // ahí la grilla ancha ya está totalmente tapada (caso normal), no hace
  // falta resimular la recursión completa en cada muestra de ese tramo.
  const pesoTracking = pesoZ17DesdeEscala(ESCALA_SEGUIMIENTO, ventana);
  const estadoDescartable = crearEstadoRecursivoV2();

  for (let i = 0; i <= pasos; i++) {
    const tiempoSeg = (duracionTotal * i) / pasos;
    if (tiempoSeg > tBC && tiempoSeg <= tD && pesoTracking >= 1) continue;
    const { camara } = calcularFaseYCamaraV2(ruta, params, tiempoSeg, estadoDescartable, "resimular");
    agregarSiVisible(camara);
  }

  return tiles;
}
