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
import {
  cargarFotosRutaV2,
  cargarImagenDecodificada,
  construirFotosRutaV2,
  construirEtiquetasPanoramicaV2,
  dibujarCierreLogoV2,
  dibujarFondoMarcaV2,
  dibujarFotoFinalV2,
  dibujarFotosRutaV2,
  dibujarEtiquetaVelMaxFinalV2,
  dibujarEtiquetasPanoramicaV2,
  alphaEtiquetasPanoramicaV2,
  dibujarPausaVelMaxV2,
  dibujarTransicionAFondoMarcaV2,
  alphaFadeIn,
  alphaFadeInHoldOut,
} from "./overlayFase6";
import { cargarBufferMusicaV2, construirGrafoMusicaV2, liberarMusicaV2, programarFadeOutMusicaV2, type GrafoMusicaV2 } from "./musicaV2";

const CONCURRENCIA = 6;
// Fase 6A -- cierre (foto final + transición + logo/ciudad). Duraciones en
// segundos lógicos, mismo eje que el resto del video (fps * duración =
// cantidad de cuadros agregados DESPUÉS de trayectoria[]).
const LOGO_URL = "/logo-legion-roller.png";
const DURACION_FOTO_FINAL_SEG = 3;
const FADE_FOTO_FINAL_SEG = 0.4;
const DURACION_TRANSICION_CIERRE_SEG = 0.45;
const DURACION_LOGO_SEG = 2.2;
const FADE_LOGO_SEG = 0.35;
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

// Devuelve el delta (ms) si el frame califica como STALL (recorder
// realmente "recording", nunca durante pausa/preparación), o null si no.
// Reutilizado tanto por el loop principal como por los 3 sub-loops del
// cierre -- mismo criterio exacto en los 4 lugares.
function esStall(recorder: MediaRecorder, tAntesMs: number, tiempoFrameAnteriorMs: number, intervaloMs: number): number | null {
  if (recorder.state !== "recording") return null;
  const delta = tAntesMs - tiempoFrameAnteriorMs;
  return delta > intervaloMs + 20 ? delta : null;
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
// Variantes con codec de audio explícito -- solo se usan cuando hay
// música, igual criterio que V1 (elegirMimeTypeVideo(conAudio)).
const CANDIDATOS_MIME_VIDEO_CON_AUDIO = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
  "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
  "video/mp4;codecs=avc1,mp4a.40.2",
  "video/mp4",
];

function elegirMimeTypeVideoV2(log: (linea: string) => void, conAudio: boolean): string {
  if (typeof MediaRecorder === "undefined") {
    throw new Error("[v2-grabacion] MediaRecorder no está disponible en este navegador.");
  }
  const candidatos = conAudio ? CANDIDATOS_MIME_VIDEO_CON_AUDIO : CANDIDATOS_MIME_VIDEO;
  const soportados = candidatos.filter((c) => MediaRecorder.isTypeSupported(c));
  log(`[v2-grabacion] candidatosMime(conAudio=${conAudio})=${candidatos.join(",")}`);
  log(`[v2-grabacion] userAgent=${typeof navigator !== "undefined" ? navigator.userAgent : "(sin navigator)"}`);
  log(`[v2-grabacion] mimeSoportados=${soportados.length ? soportados.join(",") : "(ninguno)"}`);
  if (soportados.length === 0) {
    throw new Error(
      `[v2-grabacion] ningún mimeType de video fue confirmado por MediaRecorder.isTypeSupported() en este navegador. ` +
        `Candidatos probados: ${candidatos.join(", ")}`,
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
  // Etiquetas del panorámico final -- hasta 3 sectores/calles ya
  // resueltos por MisRutasPanel.tsx (datos.sectoresRuta, cero consultas
  // nuevas acá) + el nombre de calle de velocidad máxima, resuelto una
  // única vez por el llamador (generarVideoRecorridoV2.ts) ANTES de
  // empezar a grabar. null/undefined en cualquiera de los dos simplemente
  // muestra menos etiquetas (o solo "VELOCIDAD MÁXIMA" genérico) -- nunca
  // interrumpe la generación del video.
  sectoresRuta?: { lat: number; lon: number; nombre: string; distanciaKm: number }[];
  nombreCalleVelMax: string | null;
  // Fase 6A -- URLs planas (data-URL o ruta pública), ya resueltas por el
  // llamador; la carga/decodificación de todas ellas ocurre acá adentro,
  // siempre antes de start(). Ninguna es obligatoria: sin fotos de ruta el
  // overlay de Fase 6 simplemente no dibuja nada durante el trazado; sin
  // foto de cierre, ese beat se omite; el logo tiene su propio fallback de
  // texto si falla (ver overlayFase6.ts).
  fotosRutaUrls: string[];
  fotoCierreUrl?: string;
  ciudad?: string;
  // Fase 6B -- música de fondo, opcional. Sin musicaUrl el video queda
  // mudo, exactamente como hoy (cero cambios de comportamiento).
  musicaUrl?: string;
  musicaInicioSeg?: number;
}

export interface ResultadoGrabacionV2 {
  blob: Blob;
  mimeType: string;
  duracionLogicaSeg: number;
  tiempoTotalMs: number;
  tiempoPausadoTotalMs: number;
  stallsLoopPrincipal: number;
  stallsCierre: number;
  stallsTotales: number;
}

export async function grabarVideoV2(entrada: EntradaGrabacionV2, log: (linea: string) => void): Promise<ResultadoGrabacionV2> {
  const {
    ventana,
    ventanaEfectiva,
    trayectoria,
    segmentos,
    clavesAnchaFinal,
    zoomAncho,
    fps,
    canvas,
    ruta,
    params,
    datosEstadisticas,
    sectoresRuta,
    nombreCalleVelMax,
    fotosRutaUrls,
    fotoCierreUrl,
    ciudad,
    musicaUrl,
    musicaInicioSeg,
  } = entrada;
  if (trayectoria.length === 0) throw new Error("[v2-grabacion] trayectoria vacía.");
  if (segmentos.length === 0) throw new Error("[v2-grabacion] sin segmentos.");

  const tInicioTotal = performance.now();

  // Contenedores mutables para los recursos que deben liberarse SIEMPRE
  // (ImageBitmaps, tracks de video/audio, AudioContext), sin importar si la
  // función termina con éxito o por una excepción -- ver finally al final.
  // Excepción autorizada puntualmente para esto: no cambia timing, pause()/
  // resume(), segmentación, cámara, trayectoria, overlays, tiles/render ni
  // música/sincronización -- solo CUÁNDO se liberan estos recursos.
  const tilesAncha = new Map<string, ImageBitmap>();
  const tilesZ17 = new Map<string, ImageBitmap>();
  let grafoMusica: GrafoMusicaV2 | null = null;
  let streamVideo: MediaStream | null = null;

  try {
    // --- Grilla ancha completa (residente todo el video) -- reintentos +
    // verificación de cobertura ANTES de crear el MediaRecorder. ---
    const cargadosAncha = await prepararConReintentos(clavesAnchaFinal, zoomAncho, log, "grillaAncha");
    for (const [clave, bitmap] of cargadosAncha) tilesAncha.set(clave, bitmap);
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
    const cargadosZ17 = await prepararConReintentos(segmentos[0].tiles, ZOOM_SEGUIMIENTO, log, "segmento0");
    for (const [clave, bitmap] of cargadosZ17) tilesZ17.set(clave, bitmap);
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

    // --- Fase 6A: fotos + logo -- decodificados ANTES de start(), igual
    // criterio que los tiles. skip (no abort) si alguna falla: se loguea y se
    // excluye, la generación del video sigue. ---
    const fotosRutaImgs = await cargarFotosRutaV2(fotosRutaUrls, log);
    const fotosRuta = construirFotosRutaV2(fotosRutaImgs, ruta, params, trayectoria);
    log(`[v2-fase6] fotosDeRutaListas=${fotosRuta.length}/${fotosRutaUrls.length}`);

    // Etiquetas del panorámico final -- cámara SIEMPRE fija (ruta.centroide)
    // durante panoramicaFinal, así que la posición de cada etiqueta se
    // resuelve UNA sola vez acá, nunca por frame.
    const etiquetasPanoramica = construirEtiquetasPanoramicaV2(ruta.centroide, ruta, datosEstadisticas, sectoresRuta, nombreCalleVelMax);
    log(`[v2-fase6] etiquetasPanoramicaListas=${etiquetasPanoramica.length}`);

    const fotoCierreImg = fotoCierreUrl ? await cargarImagenDecodificada(fotoCierreUrl, log) : null;
    if (fotoCierreUrl && !fotoCierreImg) log(`[v2-fase6] foto de cierre no cargó -- se omite ese beat.`);

    const logoImg = await cargarImagenDecodificada(LOGO_URL, log);
    if (!logoImg) log(`[v2-fase6] logo no cargó -- se usa fallback de texto (LEGIÓN ROLLER + ciudad).`);

    // --- Fase 6B: música -- decodificada ANTES de start(), igual criterio
    // que tiles/fotos/logo. Nunca aborta el video: cualquier falla (red,
    // decode, navegador sin Web Audio) deja grafoMusica=null y el video
    // sigue mudo. audioCtx se deja en "running" ACÁ (resuelto antes del
    // bloque crítico de arranque, nunca después) para que fuenteMusica.start()
    // más abajo sea puramente síncrono. ---
    if (musicaUrl) {
      try {
        const audioCtx = new AudioContext();
        if (audioCtx.state !== "running") {
          await audioCtx.resume();
        }
        const buffer = await cargarBufferMusicaV2(musicaUrl, audioCtx, log);
        if (buffer) {
          grafoMusica = construirGrafoMusicaV2(audioCtx, buffer);
          log(
            `[v2-musica] musica lista duracionBufferSeg=${buffer.duration.toFixed(2)} musicaInicioSeg=${(musicaInicioSeg ?? 0).toFixed(2)} ` +
              `audioCtx.state=${audioCtx.state}`,
          );
        } else {
          await audioCtx.close().catch(() => {});
          log(`[v2-musica] no se pudo decodificar la música -- video sin música.`);
        }
      } catch (e) {
        log(`[v2-musica] ERROR preparando música: ${(e as Error).message ?? e} -- video sin música.`);
        grafoMusica = null;
      }
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("[v2-grabacion] no se pudo obtener contexto 2D del canvas.");
    canvas.width = ANCHO_VIDEO;
    canvas.height = ALTO_VIDEO;

    // Primer cuadro dibujado ANTES de captureStream()/start() -- mismo
    // principio que V1: no capturar un instante en blanco.
    dibujarFrameGrabacion(ctx, trayectoria[0], ventana, ventanaEfectiva, tilesAncha, tilesZ17);
    dibujarOverlayFase5(ctx, trayectoria[0], ruta, params, datosEstadisticas);
    dibujarFotosRutaV2(ctx, trayectoria[0], ruta, params, fotosRuta);
    dibujarEtiquetaVelMaxFinalV2(ctx, trayectoria[0], ruta, datosEstadisticas);
    dibujarPausaVelMaxV2(ctx, trayectoria[0], ruta, datosEstadisticas, nombreCalleVelMax);
    dibujarEtiquetasPanoramicaV2(ctx, etiquetasPanoramica, alphaEtiquetasPanoramicaV2(trayectoria[0], params));

    const mimeType = elegirMimeTypeVideoV2(log, !!grafoMusica);
    streamVideo = canvas.captureStream(fps);
    const stream = grafoMusica
      ? new MediaStream([...streamVideo.getVideoTracks(), ...grafoMusica.destinoMusica.stream.getAudioTracks()])
      : streamVideo;
    const mediaRecorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 5_000_000 });
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
    let stallsLoopPrincipal = 0;
    let stallsCierre = 0;

    // --- Bloque crítico: CERO await entre estas dos líneas -- todo lo
    // async (decode de música, audioCtx.resume()) ya se resolvió arriba,
    // así que el único desfase posible acá es el costo puramente síncrono
    // de estas dos llamadas. ---
    const tAntesInicioMs = performance.now();
    grafoMusica?.fuenteMusica.start(0, musicaInicioSeg ?? 0);
    mediaRecorder.start();
    const tiempoEntreAudioYRecorderMs = performance.now() - tAntesInicioMs;
    log(
      `[v2-grabacion] start() frameActual=0/${totalFrames} segmentoActual=0 recorder.state=${mediaRecorder.state}` +
        (grafoMusica ? ` tiempoEntreAudioYRecorderMs=${tiempoEntreAudioYRecorderMs.toFixed(2)}` : " (sin música)"),
    );

    let tiempoFrameAnteriorMs = performance.now();

    for (let i = 0; i < totalFrames; i++) {
      const frame = trayectoria[i];
      const tAntesMs = performance.now();
      // Solo cuenta como STALL si de verdad estábamos "recording" -- el
      // tiempo real que tarda la preparación entre segmentos ocurre con
      // recorder.state==="paused" y se descuenta explícitamente más abajo
      // (tiempoFrameAnteriorMs se resetea justo después de resume()), para
      // no repetir el diagnóstico engañoso que tuvo V1.
      const deltaStall = esStall(mediaRecorder, tAntesMs, tiempoFrameAnteriorMs, intervaloMs);
      if (deltaStall !== null) {
        stallsLoopPrincipal++;
        log(`[v2-grabacion] *** STALL *** frame=${i}/${totalFrames} deltaMs=${deltaStall.toFixed(1)} esperado=${intervaloMs.toFixed(1)}`);
      }

      dibujarFrameGrabacion(ctx, frame, ventana, ventanaEfectiva, tilesAncha, tilesZ17);
      dibujarOverlayFase5(ctx, frame, ruta, params, datosEstadisticas);
      dibujarFotosRutaV2(ctx, frame, ruta, params, fotosRuta);
      dibujarEtiquetaVelMaxFinalV2(ctx, frame, ruta, datosEstadisticas);
      dibujarPausaVelMaxV2(ctx, frame, ruta, datosEstadisticas, nombreCalleVelMax);
      dibujarEtiquetasPanoramicaV2(ctx, etiquetasPanoramica, alphaEtiquetasPanoramicaV2(frame, params));

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
        const tRecorderPauseMs = performance.now();
        mediaRecorder.pause();
        log(`[v2-grabacion] pause() confirmado recorder.state=${mediaRecorder.state}`);

        // --- Fase 6B: congelar la música exactamente donde está -- se
        // aísla la grabación PRIMERO (pause(), instantáneo) y recién
        // DESPUÉS se congela el audio (suspend(), async), nunca al revés:
        // así lo que pase con el audio durante ese pequeño intervalo no
        // afecta nada, porque el recorder ya dejó de grabar. ---
        let tAudioSuspendedMs = tRecorderPauseMs;
        if (grafoMusica) {
          const estadoAntes = grafoMusica.audioCtx.state;
          try {
            await grafoMusica.audioCtx.suspend();
          } catch (e) {
            log(`[v2-musica] ERROR audioCtx.suspend(): ${(e as Error).message ?? e}`);
          }
          tAudioSuspendedMs = performance.now();
          log(`[v2-musica] audioCtx.suspend() estadoAntes=${estadoAntes} estadoDespues=${grafoMusica.audioCtx.state}`);
        }

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

        // --- Fase 6B: reanudar el audio ANTES que el recorder -- si lo
        // hiciéramos al revés, el instante entre resume()s quedaría
        // grabado como silencio (un corte feo). Esperando a que el audio
        // esté confirmado "running" primero, lo único que se pierde es el
        // propio costo de conmutación del AudioContext (milisegundos),
        // nunca los segundos que tardó la búsqueda de tiles. ---
        let tAudioResumedMs = tAudioSuspendedMs;
        if (grafoMusica) {
          const estadoAntes = grafoMusica.audioCtx.state;
          try {
            await grafoMusica.audioCtx.resume();
          } catch (e) {
            log(`[v2-musica] ERROR audioCtx.resume(): ${(e as Error).message ?? e}`);
          }
          tAudioResumedMs = performance.now();
          log(`[v2-musica] audioCtx.resume() estadoAntes=${estadoAntes} estadoDespues=${grafoMusica.audioCtx.state}`);
        }

        mediaRecorder.resume();
        const tRecorderResumeMs = performance.now();
        log(
          `[v2-grabacion] resume() confirmado frameActual=${i + 1}/${totalFrames} segmentoActual=${segmentoActivo + 1} recorder.state=${mediaRecorder.state}`,
        );

        if (grafoMusica) {
          const tiempoPausaRecorderMs = tRecorderResumeMs - tRecorderPauseMs;
          const tiempoPausaAudioMs = tAudioResumedMs - tAudioSuspendedMs;
          const gapEntradaMs = tAudioSuspendedMs - tRecorderPauseMs;
          const gapSalidaMs = tRecorderResumeMs - tAudioResumedMs;
          const diferenciaPausaMs = tiempoPausaRecorderMs - tiempoPausaAudioMs;
          log(
            `[v2-musica] segmento=${segmentoActivo} gapEntradaMs=${gapEntradaMs.toFixed(1)} gapSalidaMs=${gapSalidaMs.toFixed(1)} ` +
              `tiempoPausaRecorderMs=${tiempoPausaRecorderMs.toFixed(1)} tiempoPausaAudioMs=${tiempoPausaAudioMs.toFixed(1)} ` +
              `diferenciaPausaMs=${diferenciaPausaMs.toFixed(1)}`,
          );
        }

        // Reset -- lo de arriba (pause..resume) no debe contar como delta
        // de frame en la próxima medición de STALL.
        tiempoFrameAnteriorMs = performance.now();
        tiempoPausadoTotalMs += tiempoFrameAnteriorMs - tPausaInicioMs;

        segmentoActivo++;
      }
    }

    // --- Fase 6A: cierre -- cuadros agregados DESPUÉS del trazado real, sin
    // volver a tocar cámara/trayectoria (fondo sólido de marca, nunca tiles).
    // La foto final solo corre si cargó; el logo/ciudad SIEMPRE corre (con
    // fallback de texto si el logo falló). Todo sigue grabado por el mismo
    // MediaRecorder, así que también se mide para stalls (stallsCierre). ---
    const framesFotoFinal = fotoCierreImg ? Math.round(DURACION_FOTO_FINAL_SEG * fps) : 0;
    const duracionFotoFinalRealSeg = framesFotoFinal / fps;
    for (let j = 0; j < framesFotoFinal; j++) {
      const tAntesMs = performance.now();
      const deltaStall = esStall(mediaRecorder, tAntesMs, tiempoFrameAnteriorMs, intervaloMs);
      if (deltaStall !== null) {
        stallsCierre++;
        log(`[v2-grabacion] *** STALL (cierre: foto final) *** frame=${j}/${framesFotoFinal} deltaMs=${deltaStall.toFixed(1)}`);
      }
      dibujarFondoMarcaV2(ctx);
      dibujarFotoFinalV2(ctx, fotoCierreImg as HTMLImageElement, alphaFadeInHoldOut(j / fps, duracionFotoFinalRealSeg, FADE_FOTO_FINAL_SEG));
      tiempoFrameAnteriorMs = performance.now();
      await esperar(intervaloMs);
    }

    const framesTransicion = Math.round(DURACION_TRANSICION_CIERRE_SEG * fps);
    for (let j = 0; j < framesTransicion; j++) {
      const tAntesMs = performance.now();
      const deltaStall = esStall(mediaRecorder, tAntesMs, tiempoFrameAnteriorMs, intervaloMs);
      if (deltaStall !== null) {
        stallsCierre++;
        log(`[v2-grabacion] *** STALL (cierre: transicion) *** frame=${j}/${framesTransicion} deltaMs=${deltaStall.toFixed(1)}`);
      }
      dibujarTransicionAFondoMarcaV2(ctx, (j + 1) / framesTransicion);
      tiempoFrameAnteriorMs = performance.now();
      await esperar(intervaloMs);
    }

    // --- Fase 6B: fade-out -- programado en el instante exacto en que
    // arranca el beat de logo/ciudad, nunca antes (durante recorrido,
    // fotos, panorámica final o foto final la música se mantiene al
    // volumen normal). ---
    if (grafoMusica) {
      programarFadeOutMusicaV2(grafoMusica, DURACION_LOGO_SEG);
      log(`[v2-musica] fade-out programado duracionSeg=${DURACION_LOGO_SEG}`);
    }

    const framesLogo = Math.round(DURACION_LOGO_SEG * fps);
    for (let j = 0; j < framesLogo; j++) {
      const tAntesMs = performance.now();
      const deltaStall = esStall(mediaRecorder, tAntesMs, tiempoFrameAnteriorMs, intervaloMs);
      if (deltaStall !== null) {
        stallsCierre++;
        log(`[v2-grabacion] *** STALL (cierre: logo) *** frame=${j}/${framesLogo} deltaMs=${deltaStall.toFixed(1)}`);
      }
      dibujarFondoMarcaV2(ctx);
      dibujarCierreLogoV2(ctx, logoImg, ciudad, alphaFadeIn(j / fps, FADE_LOGO_SEG));
      tiempoFrameAnteriorMs = performance.now();
      await esperar(intervaloMs);
    }

    mediaRecorder.stop();
    log(`[v2-grabacion] stop() recorder.state=${mediaRecorder.state}`);
    const blob = await grabacionLista;

    const tiempoTotalMs = performance.now() - tInicioTotal;
    const duracionLogicaSeg = (totalFrames + framesFotoFinal + framesTransicion + framesLogo) / fps;
    const stallsTotales = stallsLoopPrincipal + stallsCierre;
    log(
      `[v2-fase6] cierre: framesFotoFinal=${framesFotoFinal} framesTransicion=${framesTransicion} framesLogo=${framesLogo} stallsCierre=${stallsCierre}`,
    );

    return {
      blob,
      mimeType,
      duracionLogicaSeg,
      tiempoTotalMs,
      tiempoPausadoTotalMs,
      stallsLoopPrincipal,
      stallsCierre,
      stallsTotales,
    };
  } finally {
    // Liberación de recursos SIEMPRE, éxito o excepción (ABORT en
    // cualquier punto de arriba): ImageBitmaps de ambas grillas, tracks de
    // video del canvas y tracks de audio de la música, y por último el
    // propio grafo de audio (stop/disconnect/close del AudioContext, ya
    // existente desde Fase 6B). Cada bitmap/track ya cerrado y quitado del
    // Map durante la reproducción normal (ver aLiberar en el loop
    // principal) simplemente no aparece acá -- no hay doble-close.
    for (const bitmap of tilesAncha.values()) {
      try {
        bitmap.close();
      } catch {
        /* noop */
      }
    }
    tilesAncha.clear();
    for (const bitmap of tilesZ17.values()) {
      try {
        bitmap.close();
      } catch {
        /* noop */
      }
    }
    tilesZ17.clear();
    if (streamVideo) {
      for (const track of streamVideo.getVideoTracks()) {
        try {
          track.stop();
        } catch {
          /* noop */
        }
      }
    }
    if (grafoMusica) {
      for (const track of grafoMusica.destinoMusica.stream.getAudioTracks()) {
        try {
          track.stop();
        } catch {
          /* noop */
        }
      }
    }
    await liberarMusicaV2(grafoMusica, log);
  }
}
