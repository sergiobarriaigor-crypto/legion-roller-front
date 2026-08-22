// V2 -- Fase 4: grabación real con MediaRecorder, sobre la trayectoria y
// segmentación ya congeladas (Fase 3). No modifica camaraV2.ts/grillaAncha.ts/
// renderV2.ts/tilesHibridos.ts/segmentacionZ17.ts/trayectoriaV2.ts -- todo acá
// es un consumidor nuevo de esas funciones, más el ciclo de vida del propio
// MediaRecorder. Tampoco toca V1 (tarjetaRecorrido.ts) ni
// CompartirRecorridoModal.tsx -- mecanismo de pause()/resume() re-derivado
// del mismo patrón ya validado en dispositivo real por V1 (ver
// tarjetaRecorrido.ts líneas ~4125-4156), no uno nuevo sin probar.
import { ANCHO_VIDEO, ALTO_VIDEO, ZOOM_SEGUIMIENTO, type VentanaCrossfade, type ParametrosCoreografiaV2, type RutaCoreografiaV2 } from "./camaraV2";
import { BYTES_POR_TILE, pesoZ17Efectivo, type VentanaEfectivaZ17, type SegmentoZ17 } from "./segmentacionZ17";
import type { FrameV2 } from "./trayectoriaV2";
import { dibujarTilesHibridos } from "./renderV2";
import { prepararTilesHibridos, crearContadoresTilesHibridos } from "./tilesHibridos";
import { dibujarOverlayFase5, type DatosEstadisticasV2 } from "./overlayFase5";

const CONCURRENCIA = 6;
// Reintentos por tile individual SOLO durante la preparación (nunca
// durante recording -- el guard de abajo lo impide estructuralmente, ya
// que este reintento ocurre siempre antes de start() o mientras
// recorder.state==="paused"). Un tile que sigue faltando después de esto
// es una falla real de red/servidor, no un hueco transitorio.
const MAX_REINTENTOS_TILE = 2;

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Reintenta SOLO los tiles que faltaron en la vuelta anterior -- si
// cargarTileHibrido() falla por la capa de satélite (World_Imagery), el
// tile entero queda ausente del Map (comportamiento ya existente en
// tilesHibridos.ts, sin tocar); si falla solo por la capa de etiquetas
// (World_Boundaries_and_Places), el tile YA queda presente compuesto solo
// con satélite (también comportamiento existente) -- así que "sigue
// faltando después de todos los reintentos" es, sin ambigüedad, una falla
// de la capa obligatoria (satélite), nunca de la opcional (etiquetas).
async function prepararConReintentos(
  claves: Set<string>,
  zoom: number,
  log: (linea: string) => void,
  etiqueta: string,
): Promise<Map<string, ImageBitmap>> {
  let pendientes = claves;
  const resultado = new Map<string, ImageBitmap>();
  for (let intento = 0; intento <= MAX_REINTENTOS_TILE && pendientes.size > 0; intento++) {
    const contadores = crearContadoresTilesHibridos();
    const preparados = await prepararTilesHibridos(pendientes, zoom, CONCURRENCIA, contadores);
    for (const [k, v] of preparados) resultado.set(k, v);
    const faltantes = [...pendientes].filter((k) => !preparados.has(k));
    log(
      `[v2-grabacion] ${etiqueta} intento=${intento} pedidos=${pendientes.size} logrados=${preparados.size} ` +
        `faltantes=${faltantes.length} fallos(sat/etq)=${contadores.falloSatelite}/${contadores.falloEtiquetas}`,
    );
    pendientes = new Set(faltantes);
  }
  return resultado;
}

function verificarCobertura(requeridas: Set<string>, residentes: Map<string, ImageBitmap>): string[] {
  const faltantes: string[] = [];
  for (const clave of requeridas) if (!residentes.has(clave)) faltantes.push(clave);
  return faltantes;
}

// Sin el fallback ciego de V1 (que devolvía "video/webm" aunque
// isTypeSupported() nunca hubiera confirmado nada) -- si ningún candidato
// está soportado, se aborta con diagnóstico en vez de arriesgar un
// MediaRecorder con un mimeType no verificado.
const CANDIDATOS_MIME_VIDEO = [
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
  "video/mp4;codecs=avc1.42E01E",
  "video/mp4;codecs=avc1",
  "video/mp4",
];

function elegirMimeTypeVideoV2(log: (linea: string) => void): string {
  if (typeof MediaRecorder === "undefined") {
    throw new Error("[v2-grabacion] MediaRecorder no está disponible en este navegador.");
  }
  const soportados = CANDIDATOS_MIME_VIDEO.filter((c) => MediaRecorder.isTypeSupported(c));
  log(`[v2-grabacion] candidatosMime=${CANDIDATOS_MIME_VIDEO.join(",")}`);
  log(`[v2-grabacion] userAgent=${typeof navigator !== "undefined" ? navigator.userAgent : "(sin navigator)"}`);
  log(`[v2-grabacion] mimeSoportados=${soportados.length ? soportados.join(",") : "(ninguno)"}`);
  if (soportados.length === 0) {
    throw new Error(
      `[v2-grabacion] ningún mimeType de video fue confirmado por MediaRecorder.isTypeSupported() en este navegador. ` +
        `Candidatos probados: ${CANDIDATOS_MIME_VIDEO.join(", ")}`,
    );
  }
  const elegido = soportados[0];
  log(`[v2-grabacion] mimeTypeElegido=${elegido}`);
  return elegido;
}

function dibujarFrameGrabacion(
  ctx: CanvasRenderingContext2D,
  frame: FrameV2,
  ventana: VentanaCrossfade,
  ventanaEfectiva: VentanaEfectivaZ17,
  tilesAncha: Map<string, ImageBitmap>,
  tilesZ17: Map<string, ImageBitmap>,
): void {
  const { camara } = frame;
  const peso = pesoZ17Efectivo(camara.escala, ventanaEfectiva);

  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, ANCHO_VIDEO, ALTO_VIDEO);

  const camaraAncha = { x: camara.cx * ventana.factorAncho, y: camara.cy * ventana.factorAncho };
  const escalaCropAncha = camara.escala / ventana.factorAncho;
  dibujarTilesHibridos(ctx, tilesAncha, camaraAncha, escalaCropAncha, ANCHO_VIDEO, ALTO_VIDEO, 1);

  if (peso > 0) {
    dibujarTilesHibridos(ctx, tilesZ17, { x: camara.cx, y: camara.cy }, camara.escala, ANCHO_VIDEO, ALTO_VIDEO, peso);
  }
}

export interface EntradaGrabacionV2 {
  ventana: VentanaCrossfade;
  ventanaEfectiva: VentanaEfectivaZ17;
  trayectoria: FrameV2[];
  segmentos: SegmentoZ17[];
  clavesAnchaFinal: Set<string>;
  zoomAncho: number;
  fps: number;
  canvas: HTMLCanvasElement;
  ruta: RutaCoreografiaV2;
  params: ParametrosCoreografiaV2;
  datosEstadisticas: DatosEstadisticasV2;
}

export interface ResultadoGrabacionV2 {
  blob: Blob;
  mimeType: string;
  duracionLogicaSeg: number;
  tiempoTotalMs: number;
  tiempoPausadoTotalMs: number;
  stallsDuranteRecording: number;
}

export async function grabarVideoV2(entrada: EntradaGrabacionV2, log: (linea: string) => void): Promise<ResultadoGrabacionV2> {
  const { ventana, ventanaEfectiva, trayectoria, segmentos, clavesAnchaFinal, zoomAncho, fps, canvas, ruta, params, datosEstadisticas } =
    entrada;
  if (trayectoria.length === 0) throw new Error("[v2-grabacion] trayectoria vacía.");
  if (segmentos.length === 0) throw new Error("[v2-grabacion] sin segmentos.");

  const tInicioTotal = performance.now();

  // --- Grilla ancha completa (residente todo el video) -- reintentos +
  // verificación de cobertura ANTES de crear el MediaRecorder. ---
  const tilesAncha = await prepararConReintentos(clavesAnchaFinal, zoomAncho, log, "grillaAncha");
  const faltantesAnchaInicial = verificarCobertura(clavesAnchaFinal, tilesAncha);
  if (faltantesAnchaInicial.length > 0) {
    throw new Error(
      `[v2-grabacion] ABORT antes de start(): grilla ancha con ${faltantesAnchaInicial.length} tiles obligatorios ` +
        `faltantes tras ${MAX_REINTENTOS_TILE} reintentos (ej. ${faltantesAnchaInicial.slice(0, 5).join(",")}).`,
    );
  }
  log(
    `[v2-grabacion] grillaAncha lista: ${tilesAncha.size} tiles memoriaMB=${((tilesAncha.size * BYTES_POR_TILE) / 1_048_576).toFixed(2)}`,
  );

  // --- Segmento 0 -- mismo criterio: reintentos + verificación antes de
  // start(). ---
  const tilesZ17 = await prepararConReintentos(segmentos[0].tiles, ZOOM_SEGUIMIENTO, log, "segmento0");
  const faltantesZ17Inicial = verificarCobertura(segmentos[0].tiles, tilesZ17);
  if (faltantesZ17Inicial.length > 0) {
    throw new Error(
      `[v2-grabacion] ABORT antes de start(): segmento 0 con ${faltantesZ17Inicial.length} tiles Z17 obligatorios ` +
        `faltantes tras ${MAX_REINTENTOS_TILE} reintentos (ej. ${faltantesZ17Inicial.slice(0, 5).join(",")}).`,
    );
  }
  log(
    `[v2-grabacion] segmento=0 listo: tilesZ17=${tilesZ17.size} memoriaMB=${((tilesZ17.size * BYTES_POR_TILE) / 1_048_576).toFixed(2)}`,
  );

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("[v2-grabacion] no se pudo obtener contexto 2D del canvas.");
  canvas.width = ANCHO_VIDEO;
  canvas.height = ALTO_VIDEO;

  // Primer cuadro dibujado ANTES de captureStream()/start() -- mismo
  // principio que V1: no capturar un instante en blanco.
  dibujarFrameGrabacion(ctx, trayectoria[0], ventana, ventanaEfectiva, tilesAncha, tilesZ17);
  dibujarOverlayFase5(ctx, trayectoria[0], ruta, params, datosEstadisticas);

  const mimeType = elegirMimeTypeVideoV2(log);
  const streamVideo = canvas.captureStream(fps);
  const mediaRecorder = new MediaRecorder(streamVideo, { mimeType, videoBitsPerSecond: 5_000_000 });
  const chunks: BlobPart[] = [];
  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  const grabacionLista = new Promise<Blob>((resolve, reject) => {
    mediaRecorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
    mediaRecorder.onerror = (ev) => {
      const detalle = (ev as unknown as { error?: unknown }).error;
      reject(new Error(`[v2-grabacion] error de MediaRecorder: ${detalle ? String(detalle) : String(ev)}`));
    };
  });

  const totalFrames = trayectoria.length;
  const intervaloMs = 1000 / fps;
  let segmentoActivo = 0;
  let tiempoPausadoTotalMs = 0;
  let stallsDuranteRecording = 0;

  mediaRecorder.start();
  log(`[v2-grabacion] start() frameActual=0/${totalFrames} segmentoActual=0 recorder.state=${mediaRecorder.state}`);

  let tiempoFrameAnteriorMs = performance.now();

  for (let i = 0; i < totalFrames; i++) {
    const frame = trayectoria[i];
    const tAntesMs = performance.now();
    // Solo cuenta como STALL si de verdad estábamos "recording" -- el
    // tiempo real que tarda la preparación entre segmentos ocurre con
    // recorder.state==="paused" y se descuenta explícitamente más abajo
    // (tiempoFrameAnteriorMs se resetea justo después de resume()), para
    // no repetir el diagnóstico engañoso que tuvo V1.
    if (mediaRecorder.state === "recording") {
      const delta = tAntesMs - tiempoFrameAnteriorMs;
      if (delta > intervaloMs + 20) {
        stallsDuranteRecording++;
        log(`[v2-grabacion] *** STALL *** frame=${i}/${totalFrames} deltaMs=${delta.toFixed(1)} esperado=${intervaloMs.toFixed(1)}`);
      }
    }

    dibujarFrameGrabacion(ctx, frame, ventana, ventanaEfectiva, tilesAncha, tilesZ17);
    dibujarOverlayFase5(ctx, frame, ruta, params, datosEstadisticas);
    tiempoFrameAnteriorMs = performance.now();
    await esperar(intervaloMs);

    const segmentoEsteFrame = segmentos[segmentoActivo];
    const hayMasSegmentos = segmentoActivo < segmentos.length - 1;
    if (hayMasSegmentos && i === segmentoEsteFrame.frameFin) {
      const tPausaInicioMs = performance.now();
      const siguiente = segmentos[segmentoActivo + 1];

      log(
        `[v2-grabacion] frameActual=${i}/${totalFrames} segmentoActual=${segmentoActivo} recorder.state(antes de pause)=${mediaRecorder.state}`,
      );
      mediaRecorder.pause();
      log(`[v2-grabacion] pause() confirmado recorder.state=${mediaRecorder.state}`);

      const memAntesMB = ((tilesAncha.size + tilesZ17.size) * BYTES_POR_TILE) / 1_048_576;

      const aLiberar = [...tilesZ17.keys()].filter((k) => !siguiente.tiles.has(k));
      for (const k of aLiberar) {
        tilesZ17.get(k)?.close();
        tilesZ17.delete(k);
      }
      const aFetchear = [...siguiente.tiles].filter((k) => !tilesZ17.has(k));
      log(`[v2-grabacion] liberados=${aLiberar.length} compartidos=${siguiente.tiles.size - aFetchear.length} aFetchear=${aFetchear.length}`);

      // Guard duro: nunca se debe llegar acá con el recorder grabando.
      if (mediaRecorder.state !== "paused") {
        throw new Error(
          `[v2-grabacion] GUARD: se intentó preparar tiles con recorder.state=${mediaRecorder.state}, se esperaba "paused".`,
        );
      }

      const nuevos = await prepararConReintentos(new Set(aFetchear), ZOOM_SEGUIMIENTO, log, `segmento${segmentoActivo + 1}`);
      for (const [k, v] of nuevos) tilesZ17.set(k, v);

      const faltantesZ17 = verificarCobertura(siguiente.tiles, tilesZ17);
      const faltantesAncha = verificarCobertura(clavesAnchaFinal, tilesAncha);
      log(`[v2-grabacion] cobertura antes de resume: anchaFaltantes=${faltantesAncha.length} z17Faltantes=${faltantesZ17.length}`);
      if (faltantesZ17.length > 0 || faltantesAncha.length > 0) {
        throw new Error(
          `[v2-grabacion] ABORT antes de resume(): cobertura incompleta (anchaFaltantes=${faltantesAncha.length} ` +
            `z17Faltantes=${faltantesZ17.length}) para el segmento ${segmentoActivo + 1}.`,
        );
      }

      const memDespuesMB = ((tilesAncha.size + tilesZ17.size) * BYTES_POR_TILE) / 1_048_576;
      log(`[v2-grabacion] memoria antes=${memAntesMB.toFixed(2)}MB despues=${memDespuesMB.toFixed(2)}MB`);

      mediaRecorder.resume();
      log(
        `[v2-grabacion] resume() confirmado frameActual=${i + 1}/${totalFrames} segmentoActual=${segmentoActivo + 1} recorder.state=${mediaRecorder.state}`,
      );

      // Reset -- lo de arriba (pause..resume) no debe contar como delta
      // de frame en la próxima medición de STALL.
      tiempoFrameAnteriorMs = performance.now();
      tiempoPausadoTotalMs += tiempoFrameAnteriorMs - tPausaInicioMs;

      segmentoActivo++;
    }
  }

  mediaRecorder.stop();
  log(`[v2-grabacion] stop() recorder.state=${mediaRecorder.state}`);
  const blob = await grabacionLista;

  for (const bitmap of tilesAncha.values()) bitmap.close();
  for (const bitmap of tilesZ17.values()) bitmap.close();

  const tiempoTotalMs = performance.now() - tInicioTotal;
  const duracionLogicaSeg = totalFrames / fps;

  return { blob, mimeType, duracionLogicaSeg, tiempoTotalMs, tiempoPausadoTotalMs, stallsDuranteRecording };
}
