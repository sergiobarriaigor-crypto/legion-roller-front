// V2 -- Fase 3: presupuesto de memoria, ventana efectiva Z17 ("completo o
// apagado, nunca parcial") y segmentación greedy de tiles Z17 por trayectoria
// real de cámara.
//
// No modifica camaraV2.ts/grillaAncha.ts/renderV2.ts -- todo acá es un
// consumidor nuevo de esas funciones ya congeladas (Fase 1/2), leídas
// tal cual están.
import { ANCHO_VIDEO, ALTO_VIDEO, ESCALA_SEGUIMIENTO, clamp, suavizar, type EstadoCamaraV2 } from "./camaraV2";
import { TAM_TILE } from "./proyeccion";
import { rangoTilesVisibles } from "./renderV2";
import type { FrameV2 } from "./trayectoriaV2";

export const BYTES_POR_TILE = TAM_TILE * TAM_TILE * 4;

// Presupuesto total de memoria residente objetivo para todo el video
// (grilla ancha + segmento Z17 activo + transitorios de composición).
// Punto medio del rango 100-150MB acordado.
export const PRESUPUESTO_TOTAL_BYTES_DEFECTO = 130 * 1024 * 1024;

// Fracción del presupuesto de Z17 que UN solo frame puede ocupar en
// solitario -- no es "la" cifra derivable, es una política explícita: deja
// la otra mitad del presupuesto del segmento para que frames vecinos
// puedan compartirlo (si un frame ocupara el 100%, cada frame "caro"
// forzaría su propio segmento de 1 cuadro).
export const FRACCION_MAX_UN_FRAME_DEFECTO = 0.5;

export function calcularPresupuestoZ17Bytes(
  presupuestoTotalBytes: number,
  memGrillaAnchaBytes: number,
  concurrencia: number,
): number {
  // Reserva para los bitmaps transitorios de composición (satélite +
  // etiquetas + compuesto) que tilesHibridos.ts mantiene en vuelo por cada
  // tile que se está preparando -- solo importa durante la preparación
  // (MediaRecorder en pausa), nunca durante recording.
  const reservaTransitoriosBytes = concurrencia * 3 * BYTES_POR_TILE;
  return presupuestoTotalBytes - memGrillaAnchaBytes - reservaTransitoriosBytes;
}

// Semilla analítica -- área continua (ANCHO_VIDEO/escala x ALTO_VIDEO/escala),
// sin cuantización de tiles. Sirve solo de referencia/diagnóstico: la
// decisión real de viabilidad (determinarVentanaEfectivaZ17) usa el conteo
// discreto real de rangoTilesVisibles sobre la trayectoria precomputada,
// porque floor()/alineación de tiles puede desviar el conteo real respecto
// al área continua -- sobre todo con pocos tiles de por medio.
export function estimarEscalaViableZ17Analitico(presupuestoZ17Bytes: number, fraccionMaxUnFrame: number): number {
  if (presupuestoZ17Bytes <= 0) return Infinity;
  return Math.sqrt(
    (ANCHO_VIDEO * ALTO_VIDEO * BYTES_POR_TILE) / (TAM_TILE * TAM_TILE * fraccionMaxUnFrame * presupuestoZ17Bytes),
  );
}

function contarTilesZ17Frame(camara: EstadoCamaraV2): number {
  const r = rangoTilesVisibles({ x: camara.cx, y: camara.cy }, camara.escala, ANCHO_VIDEO, ALTO_VIDEO);
  return (r.tileXMax - r.tileXMin + 1) * (r.tileYMax - r.tileYMin + 1);
}

export interface VentanaEfectivaZ17 {
  escalaInferiorEfectiva: number;
  escalaSuperiorEfectiva: number;
  frameEntrada: number;
  frameSalida: number;
  escalaViableZ17Analitico: number;
}

// Determina, a partir de la trayectoria REAL ya precomputada, desde qué
// frame (entrando) y hasta qué frame (saliendo) una cobertura Z17 COMPLETA
// es afordable -- nunca parcial. Regla "última violación" / "primera
// violación" en vez de "primer frame que entra": esto garantiza activación
// monotónica (ANCHA -> Z17 -> ANCHA, nunca Z17 -> ANCHA -> Z17 por ruido de
// +-1 tile de alineación cerca del cruce), sin asumir que el conteo
// discreto sea perfectamente monótono cuadro a cuadro -- solo que escala
// misma lo es (paneoAcercamiento/alejamientoPaneo son funciones puras de
// tiempo, sin recursión), y el conteo de tiles es una función monótona
// (inversa) de escala salvo por ruido de cuantización acotado.
export function determinarVentanaEfectivaZ17(
  trayectoria: FrameV2[],
  presupuestoZ17Bytes: number,
  fraccionMaxUnFrame: number,
): VentanaEfectivaZ17 {
  const presupuestoUnFrameBytes = fraccionMaxUnFrame * presupuestoZ17Bytes;
  const escalaViableZ17Analitico = estimarEscalaViableZ17Analitico(presupuestoZ17Bytes, fraccionMaxUnFrame);

  const framesAcercamiento = trayectoria.filter((f) => f.fase === "paneoAcercamiento");
  const framesAlejamiento = trayectoria.filter((f) => f.fase === "alejamientoPaneo");

  // Entrada: último frame (orden cronológico, escala creciente) que EXCEDE
  // el presupuesto -- Z17 se activa recién en el siguiente y se mantiene
  // activo de ahí en más.
  let indiceUltimoViolador = -1;
  for (const frame of framesAcercamiento) {
    if (contarTilesZ17Frame(frame.camara) * BYTES_POR_TILE > presupuestoUnFrameBytes) {
      indiceUltimoViolador = frame.indice;
    }
  }
  const frameEntrada = indiceUltimoViolador >= 0 ? indiceUltimoViolador + 1 : (framesAcercamiento[0]?.indice ?? 0);

  // Salida: primer frame (orden cronológico, escala decreciente) que
  // excede el presupuesto -- Z17 queda activo hasta el frame anterior.
  let indicePrimerViolador = -1;
  for (const frame of framesAlejamiento) {
    if (contarTilesZ17Frame(frame.camara) * BYTES_POR_TILE > presupuestoUnFrameBytes) {
      indicePrimerViolador = frame.indice;
      break;
    }
  }
  const frameSalida =
    indicePrimerViolador >= 0 ? indicePrimerViolador - 1 : (framesAlejamiento[framesAlejamiento.length - 1]?.indice ?? 0);

  const iEntrada = clamp(frameEntrada, 0, trayectoria.length - 1);
  const iSalida = clamp(frameSalida, 0, trayectoria.length - 1);
  const escalaEntrada = trayectoria[iEntrada].camara.escala;
  const escalaSalida = trayectoria[iSalida].camara.escala;

  // Una sola ventana para todo el video (entrada Y salida comparten la
  // misma pesoZ17Efectivo) -- se usa la más conservadora de las dos
  // escalas encontradas, para que AMBOS tramos cumplan la garantía de
  // viabilidad completa.
  const escalaInferiorEfectiva = Math.max(escalaEntrada, escalaSalida);
  // Ancho deseado: un nivel de zoom completo (x2), igual que la ventana
  // original de Fase 2 -- pero comprimido si no entra antes de llegar a
  // ESCALA_SEGUIMIENTO (nunca obligamos el x2 completo).
  const escalaSuperiorEfectiva = Math.min(escalaInferiorEfectiva * 2, ESCALA_SEGUIMIENTO);

  if (escalaSuperiorEfectiva <= escalaInferiorEfectiva) {
    throw new Error(
      `[v2-presupuesto] el presupuesto de Z17 no alcanza para esta ruta: ` +
        `escalaInferiorEfectiva=${escalaInferiorEfectiva.toFixed(4)} >= escalaSuperiorEfectiva=${escalaSuperiorEfectiva.toFixed(4)} ` +
        `(ESCALA_SEGUIMIENTO=${ESCALA_SEGUIMIENTO}). Subí PRESUPUESTO_TOTAL_BYTES o revisá zoomAncho de esta ruta.`,
    );
  }

  return { escalaInferiorEfectiva, escalaSuperiorEfectiva, frameEntrada, frameSalida, escalaViableZ17Analitico };
}

// Mismo peso de Fase 2 (suavizar() en log2(escala)), reanclado a la
// ventana EFECTIVA -- coincide exactamente con pesoZ17DesdeEscala cuando
// el presupuesto no es el limitante (escalaInferiorEfectiva ==
// ventana.escalaInferior real).
export function pesoZ17Efectivo(escala: number, ventana: VentanaEfectivaZ17): number {
  if (escala <= ventana.escalaInferiorEfectiva) return 0;
  if (escala >= ventana.escalaSuperiorEfectiva) return 1;
  const t =
    (Math.log2(escala) - Math.log2(ventana.escalaInferiorEfectiva)) /
    (Math.log2(ventana.escalaSuperiorEfectiva) - Math.log2(ventana.escalaInferiorEfectiva));
  return suavizar(t);
}

function clavesDeRango(camara: EstadoCamaraV2): Set<string> {
  const r = rangoTilesVisibles({ x: camara.cx, y: camara.cy }, camara.escala, ANCHO_VIDEO, ALTO_VIDEO);
  const claves = new Set<string>();
  for (let ty = r.tileYMin; ty <= r.tileYMax; ty++) {
    for (let tx = r.tileXMin; tx <= r.tileXMax; tx++) claves.add(`${tx}/${ty}`);
  }
  return claves;
}

// "Completo o apagado, nunca parcial": si pesoZ17Efectivo>0 se devuelve el
// viewport COMPLETO (garantizado afordable por construcción de la
// ventana); si no, un Set vacío -- nunca un recorte a mitad de camino.
export function tilesZ17DelFrame(frame: FrameV2, ventana: VentanaEfectivaZ17): Set<string> {
  if (pesoZ17Efectivo(frame.camara.escala, ventana) <= 0) return new Set();
  return clavesDeRango(frame.camara);
}

// Cobertura de la grilla ancha derivada directamente de la trayectoria
// precomputada -- complementa (no reemplaza) construirCoberturaGrillaAnchaV2
// de Fase 2, que muestrea con un `pasos` fijo (60 por defecto) sin importar
// la duración real del video: para rutas largas/lentas esa cantidad fija de
// muestras puede quedar demasiado espaciada en el tiempo y saltarse una
// ventana angosta de cuadros donde la cámara pisa brevemente un tile del
// borde (confirmado empíricamente en la prueba de estrés de ~24km: 60
// muestras sobre 34s dejan ~13.7 cuadros de separación, suficiente para
// perderse una franja de 6 cuadros). Acá se recorre cada cuadro real (ya
// tenemos la trayectoria completa, sin costo extra de red) y se agrega su
// rango de tiles anchos cuando la grilla ancha tiene peso visual > 0 --
// mismo criterio "1 - pesoZ17Efectivo", mismo rangoTilesVisibles real del
// renderer, misma transformación cámara Z17 -> zoomAncho ya usada en todos
// lados (factorAncho).
export function construirCoberturaGrillaAnchaFase3(
  trayectoria: FrameV2[],
  ventana: VentanaEfectivaZ17,
  factorAncho: number,
): Set<string> {
  const tiles = new Set<string>();
  for (const frame of trayectoria) {
    const pesoAncha = 1 - pesoZ17Efectivo(frame.camara.escala, ventana);
    if (pesoAncha <= 0) continue;
    const camaraAncha = { x: frame.camara.cx * factorAncho, y: frame.camara.cy * factorAncho };
    const escalaCropAncha = frame.camara.escala / factorAncho;
    const r = rangoTilesVisibles(camaraAncha, escalaCropAncha, ANCHO_VIDEO, ALTO_VIDEO);
    for (let ty = r.tileYMin; ty <= r.tileYMax; ty++) {
      for (let tx = r.tileXMin; tx <= r.tileXMax; tx++) tiles.add(`${tx}/${ty}`);
    }
  }
  return tiles;
}

export interface SegmentoZ17 {
  frameInicio: number;
  frameFin: number;
  tiles: Set<string>;
}

// Barrido greedy secuencial: acumula la UNIÓN de tiles necesarios; corta
// (arranca segmento nuevo) apenas agregar el frame actual excedería el
// presupuesto. Segmentos largos donde hay pocos tiles nuevos por frame
// (seguimiento estable), cortos donde hay muchos (transición de zoom) --
// sin ningún caso especial por fase.
export function planificarSegmentosZ17(
  trayectoria: FrameV2[],
  ventana: VentanaEfectivaZ17,
  presupuestoZ17Bytes: number,
): SegmentoZ17[] {
  const segmentos: SegmentoZ17[] = [];
  let actual: SegmentoZ17 = { frameInicio: 0, frameFin: 0, tiles: new Set() };
  for (const frame of trayectoria) {
    const tilesFrame = tilesZ17DelFrame(frame, ventana);
    const union = new Set([...actual.tiles, ...tilesFrame]);
    const memoriaPropuesta = union.size * BYTES_POR_TILE;
    if (memoriaPropuesta > presupuestoZ17Bytes && actual.tiles.size > 0) {
      segmentos.push({ ...actual, frameFin: frame.indice - 1 });
      actual = { frameInicio: frame.indice, frameFin: frame.indice, tiles: tilesFrame };
    } else {
      actual.tiles = union;
      actual.frameFin = frame.indice;
    }
  }
  segmentos.push(actual);
  return segmentos;
}
