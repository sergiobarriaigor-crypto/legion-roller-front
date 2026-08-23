"use client";

// DIAGNÓSTICO TEMPORAL -- V2 Fase 2: coreografía completa de cámara
// (panorámica inicial -> paneo -> acercamiento -> seguimiento -> alejamiento
// -> paneo final -> panorámica final), sin MediaRecorder/audio/segmentación
// real/huecos todavía. Página aislada, sin link desde ninguna navegación
// real -- no toca V1 ni CompartirRecorridoModal.

import { useRef, useState } from "react";
import type { PuntoGps } from "@/lib/geo";
import { elegirGrillaAncha } from "@/lib/video2dV2/grillaAncha";
import { prepararTilesHibridos, crearContadoresTilesHibridos, cargarTileHibrido } from "@/lib/video2dV2/tilesHibridos";
import { dibujarTilesHibridos } from "@/lib/video2dV2/renderV2";
import {
  ANCHO_VIDEO,
  ALTO_VIDEO,
  ZOOM_SEGUIMIENTO,
  ESCALA_SEGUIMIENTO,
  calcularVentanaCrossfade,
  pesoZ17DesdeEscala,
  construirRutaCoreografiaV2,
  construirCorredorZ17V2,
  construirCoberturaGrillaAnchaV2,
  calcularDuracionSeguimientoV2,
  duracionTotalV2,
  calcularFaseYCamaraV2,
  crearEstadoRecursivoV2,
  pasoSeguimientoV2,
  type RutaCoreografiaV2,
  type VentanaCrossfade,
  type ParametrosCoreografiaV2,
  type EstadoRecursivoSeguimientoV2,
  type FaseV2,
  type EstadoCamaraV2,
} from "@/lib/video2dV2/camaraV2";
import { construirTrayectoriaV2 } from "@/lib/video2dV2/trayectoriaV2";
import { construirDatosEstadisticasV2, dibujarOverlayFase5, type DatosEstadisticasV2 } from "@/lib/video2dV2/overlayFase5";
import {
  cargarFotosRutaV2,
  construirFotosRutaV2,
  construirEtiquetasPanoramicaV2,
  dibujarFotosRutaV2,
  dibujarEtiquetaVelMaxFinalV2,
  dibujarEtiquetasPanoramicaV2,
  alphaEtiquetasPanoramicaV2,
  type FotoRutaV2,
  type EtiquetaPanoramicaV2,
} from "@/lib/video2dV2/overlayFase6";
import { reverseGeocodificarEspecifico } from "@/lib/geocodificacion";
import { TAM_TILE } from "@/lib/video2dV2/proyeccion";
import {
  BYTES_POR_TILE,
  PRESUPUESTO_TOTAL_BYTES_DEFECTO,
  FRACCION_MAX_UN_FRAME_DEFECTO,
  calcularPresupuestoZ17Bytes,
  determinarVentanaEfectivaZ17,
  planificarSegmentosZ17,
  pesoZ17Efectivo,
  construirCoberturaGrillaAnchaFase3,
} from "@/lib/video2dV2/segmentacionZ17";
import { grabarVideoV2 } from "@/lib/video2dV2/grabacionV2";

// Ruta de prueba más larga que la de Fase 1 (~11km, Puerto Montt) -- una
// ruta corta (~2km) hacía que la escala "ancha" necesaria para encuadrar
// toda la ruta cayera DENTRO de la ventana de crossfade (Z17 se filtraba en
// la panorámica inicial/final, ver diagnóstico real de esta ronda). Con más
// distancia real, hay margen de sobra entre la escala ancha y el umbral de
// nitidez -- PuntoGps requiere timestamp aunque acá no se use su valor en
// sí, solo espaciados crecientes.
// Ruta de prueba orientada N-S (con leve zigzag E-O) -- a diferencia de la
// ruta horizontal anterior, esta se parece en aspecto al video 9:16, así
// que elegirGrillaAncha no necesita inflar una dimensión para encuadrarla,
// y el corredor Z17 de inicio/fin no explota en cantidad de tiles.
const RUTA_PRUEBA: PuntoGps[] = [
  { lon: -72.905, lat: -41.47, timestamp: 0 },
  { lon: -72.903, lat: -41.4676, timestamp: 200000 },
  { lon: -72.902, lat: -41.465, timestamp: 400000 },
  { lon: -72.904, lat: -41.4626, timestamp: 600000 },
  { lon: -72.906, lat: -41.46, timestamp: 800000 },
  { lon: -72.905, lat: -41.4576, timestamp: 1000000 },
  { lon: -72.903, lat: -41.455, timestamp: 1200000 },
  { lon: -72.902, lat: -41.4526, timestamp: 1400000 },
  { lon: -72.904, lat: -41.45, timestamp: 1600000 },
  { lon: -72.906, lat: -41.4476, timestamp: 1800000 },
  { lon: -72.905, lat: -41.445, timestamp: 2000000 },
  { lon: -72.903, lat: -41.4426, timestamp: 2200000 },
  { lon: -72.902, lat: -41.44, timestamp: 2400000 },
  { lon: -72.904, lat: -41.4376, timestamp: 2600000 },
];

// Ruta corta (~2.15km) -- para la prueba puntual de Fase 4 en dispositivo
// real (celular), pedida explícitamente antes de probar ~4km/~25km. Ya
// validada en esta sesión: da zoomAncho=16, ventana efectiva comprimida
// pero válida (no dispara el error de "presupuesto insuficiente" que sí
// daba una ruta aún más corta de ~1.5km probada primero). No reemplaza
// RUTA_PRUEBA -- Fase 4 elige entre ambas vía el selector de la UI.
const RUTA_PRUEBA_CORTA: PuntoGps[] = [
  { lon: -72.905, lat: -41.47, timestamp: 0 },
  { lon: -72.9027, lat: -41.4718, timestamp: 200000 },
  { lon: -72.9013, lat: -41.4736, timestamp: 400000 },
  { lon: -72.9011, lat: -41.4754, timestamp: 600000 },
  { lon: -72.9023, lat: -41.4772, timestamp: 800000 },
  { lon: -72.9044, lat: -41.479, timestamp: 1000000 },
  { lon: -72.9068, lat: -41.4808, timestamp: 1200000 },
  { lon: -72.9085, lat: -41.4826, timestamp: 1400000 },
  { lon: -72.909, lat: -41.4844, timestamp: 1600000 },
  { lon: -72.9081, lat: -41.4862, timestamp: 1800000 },
];

// Ruta larga de referencia (~24.3km, N-S con zigzag) -- misma usada en la
// prueba de estrés de Fase 3 y en la prueba larga/multisegmento de Fase 4
// (3 segmentos, 467/465/258 tiles Z17, ya validada localmente: 3/3
// segmentos con anchaFaltantes=0/z17Faltantes=0, guard nunca disparado).
// Necesaria en el build desplegado para poder repetir esa misma prueba
// desde el celular real vía Vercel -- selector de la UI, no reemplaza las
// otras dos rutas.
const RUTA_PRUEBA_LARGA: PuntoGps[] = [
  { lon: -72.905, lat: -41.47, timestamp: 0 },
  { lon: -72.9013, lat: -41.4741, timestamp: 200000 },
  { lon: -72.8988, lat: -41.4782, timestamp: 400000 },
  { lon: -72.898, lat: -41.4823, timestamp: 600000 },
  { lon: -72.8993, lat: -41.4864, timestamp: 800000 },
  { lon: -72.9023, lat: -41.4905, timestamp: 1000000 },
  { lon: -72.9061, lat: -41.4946, timestamp: 1200000 },
  { lon: -72.9096, lat: -41.4987, timestamp: 1400000 },
  { lon: -72.9117, lat: -41.5028, timestamp: 1600000 },
  { lon: -72.9118, lat: -41.5069, timestamp: 1800000 },
  { lon: -72.9099, lat: -41.511, timestamp: 2000000 },
  { lon: -72.9066, lat: -41.5151, timestamp: 2200000 },
  { lon: -72.9028, lat: -41.5192, timestamp: 2400000 },
  { lon: -72.8997, lat: -41.5233, timestamp: 2600000 },
  { lon: -72.8981, lat: -41.5274, timestamp: 2800000 },
  { lon: -72.8985, lat: -41.5315, timestamp: 3000000 },
  { lon: -72.9009, lat: -41.5356, timestamp: 3200000 },
  { lon: -72.9045, lat: -41.5397, timestamp: 3400000 },
  { lon: -72.9082, lat: -41.5438, timestamp: 3600000 },
  { lon: -72.911, lat: -41.5479, timestamp: 3800000 },
  { lon: -72.912, lat: -41.552, timestamp: 4000000 },
  { lon: -72.911, lat: -41.5561, timestamp: 4200000 },
  { lon: -72.9081, lat: -41.5602, timestamp: 4400000 },
  { lon: -72.9044, lat: -41.5643, timestamp: 4600000 },
  { lon: -72.9009, lat: -41.5684, timestamp: 4800000 },
  { lon: -72.8985, lat: -41.5725, timestamp: 5000000 },
  { lon: -72.8981, lat: -41.5766, timestamp: 5200000 },
  { lon: -72.8997, lat: -41.5807, timestamp: 5400000 },
  { lon: -72.9029, lat: -41.5848, timestamp: 5600000 },
  { lon: -72.9067, lat: -41.5889, timestamp: 5800000 },
  { lon: -72.91, lat: -41.593, timestamp: 6000000 },
  { lon: -72.9118, lat: -41.5971, timestamp: 6200000 },
  { lon: -72.9116, lat: -41.6012, timestamp: 6400000 },
  { lon: -72.9095, lat: -41.6053, timestamp: 6600000 },
  { lon: -72.906, lat: -41.6094, timestamp: 6800000 },
  { lon: -72.9023, lat: -41.6135, timestamp: 7000000 },
  { lon: -72.8993, lat: -41.6176, timestamp: 7200000 },
  { lon: -72.898, lat: -41.6217, timestamp: 7400000 },
  { lon: -72.8988, lat: -41.6258, timestamp: 7600000 },
  { lon: -72.9014, lat: -41.6299, timestamp: 7800000 },
  { lon: -72.9051, lat: -41.634, timestamp: 8000000 },
  { lon: -72.9087, lat: -41.6381, timestamp: 8200000 },
  { lon: -72.9113, lat: -41.6422, timestamp: 8400000 },
  { lon: -72.912, lat: -41.6463, timestamp: 8600000 },
  { lon: -72.9106, lat: -41.6504, timestamp: 8800000 },
  { lon: -72.9076, lat: -41.6545, timestamp: 9000000 },
  { lon: -72.9038, lat: -41.6586, timestamp: 9200000 },
  { lon: -72.9004, lat: -41.6627, timestamp: 9400000 },
  { lon: -72.8983, lat: -41.6668, timestamp: 9600000 },
];

// Fase 6A -- imágenes de prueba (assets ya existentes en public/, no se
// agrega ningún archivo nuevo) para validar fotos durante el recorrido +
// foto de cierre + logo, sin depender de CompartirRecorridoModal.tsx (fuera
// de alcance de esta fase). Mezcla deliberada de orientaciones para poder
// verificar visualmente el manejo de vertical/horizontal (contain, nunca
// recorta).
const FOTOS_RUTA_PRUEBA_URLS = ["/fondo-mis-rutas.jpg", "/avatar-chat-grupal.png", "/fondo-patinadores-activos.jpg"];
const FOTO_CIERRE_PRUEBA_URL = "/fondo-compartir-post.jpg";
const CIUDAD_PRUEBA = "Puerto Montt";
// Etiquetas de calles/sectores para el panorámico final -- mismo formato
// que datos.sectoresRuta en producción (ya resuelto por MisRutasPanel.tsx,
// cero geocodificación acá). Puntos reales de RUTA_PRUEBA (inicio/medio/fin)
// con nombres inventados -- para "corta"/"larga" pueden caer fuera del
// trazado real (son otras rutas), suficiente para validar el dibujo/anti-
// superposición en este laboratorio, no para verificar precisión geográfica.
const SECTORES_RUTA_PRUEBA: { lat: number; lon: number; nombre: string; distanciaKm: number }[] = [
  { lat: -41.47, lon: -72.905, nombre: "Av. Costanera", distanciaKm: 0 },
  { lat: -41.455, lon: -72.903, nombre: "Calle Centro", distanciaKm: 2 },
  { lat: -41.4376, lon: -72.904, nombre: "Av. Presidente Ibáñez", distanciaKm: 4 },
];
// Fase 6B -- pista real del catálogo ya existente (public/musica/), solo
// para validar el mecanismo de mezcla/sincronización en este debug page.
const MUSICA_PRUEBA_URL = "/musica/legion/01-legion-roller.mp3";
const MUSICA_PRUEBA_INICIO_SEG = 0;

const CONCURRENCIA = 6;
const FPS_FASE3 = 24; // FPS_DEFECTO de V1 (tarjetaRecorrido.ts) -- confirmar si V2 debe usar otro valor

function resimularEstadoCompleto(
  ruta: RutaCoreografiaV2,
  fraccionObjetivo: number,
  pasos: number,
): { estado: EstadoRecursivoSeguimientoV2; camara: EstadoCamaraV2 } {
  const estado = crearEstadoRecursivoV2();
  let camara: EstadoCamaraV2 = { cx: ruta.puntosZ17[0].x, cy: ruta.puntosZ17[0].y, escala: 0.6 };
  for (let i = 1; i <= pasos; i++) {
    camara = pasoSeguimientoV2(ruta, (fraccionObjetivo * i) / pasos, estado);
  }
  return { estado, camara };
}

export default function DebugVideoV2Page() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [preparando, setPreparando] = useState(false);
  const [planificandoFase3, setPlanificandoFase3] = useState(false);
  const [grabandoFase4, setGrabandoFase4] = useState(false);
  const [rutaFase4, setRutaFase4] = useState<"corta" | "referencia" | "larga">("corta");
  const [conMusicaFase4, setConMusicaFase4] = useState(true);
  const [tapsFase4, setTapsFase4] = useState(0);
  const [videoUrlFase4, setVideoUrlFase4] = useState<string | null>(null);
  // DIAGNÓSTICO TEMPORAL -- verificar si el ImageBitmap híbrido usado por
  // Fase 4 ya contiene las etiquetas de Esri (World_Boundaries_and_Places)
  // ANTES de cualquier render/captura/codificación -- separa "el tile ya
  // viene sin etiquetas" (preparación) de "el tile las tiene pero se
  // pierden después" (render/composición/captura). Sacar una vez resuelto.
  const [diagTileEstado, setDiagTileEstado] = useState<string>("(sin probar)");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [reproduciendo, setReproduciendo] = useState(false);
  const [tiempoSeg, setTiempoSeg] = useState(0);
  const [faseActual, setFaseActual] = useState<FaseV2 | null>(null);
  // Apagado por defecto -- el texto verde de diagnóstico de Fase 2 (fase/
  // cx/cy/escala/tiles visibles-faltantes) ya no debe aparecer sobre el
  // mapa al evaluar Fase 5 visualmente; solo se muestra si se activa acá.
  const [modoDebug, setModoDebug] = useState(false);

  const [duracionA, setDuracionA] = useState(0.8);
  const [duracionBC, setDuracionBC] = useState(3.2);
  const [duracionD, setDuracionD] = useState(0); // se autocompleta al preparar
  const [duracionEF, setDuracionEF] = useState(3.2);
  // Panorámica final: cámara SIEMPRE fija -- trazado+calles+velocidad
  // máxima (~2.8s), fundido corto, estadísticas generales (~2.7s). Ver
  // overlayFase5.ts/overlayFase6.ts (FRAC_BEAT_A_FIN/FRAC_FUNDIDO_FIN).
  const [duracionG, setDuracionG] = useState(5.5);
  const [finPaneoFraccion, setFinPaneoFraccion] = useState(0.7);
  const [inicioZoomFraccion, setInicioZoomFraccion] = useState(0.55);
  const [velocidad, setVelocidad] = useState(1);

  const rutaRef = useRef<RutaCoreografiaV2 | null>(null);
  const ventanaRef = useRef<VentanaCrossfade | null>(null);
  const datosEstadisticasRef = useRef<DatosEstadisticasV2 | null>(null);
  const etiquetasPanoramicaRef = useRef<EtiquetaPanoramicaV2[]>([]);
  const fotosRutaRef = useRef<FotoRutaV2[]>([]);
  const tilesAnchaRef = useRef<Map<string, ImageBitmap>>(new Map());
  const tilesZ17Ref = useRef<Map<string, ImageBitmap>>(new Map());
  const zoomAnchoRef = useRef(0);
  const estadoSeguimientoRef = useRef<EstadoRecursivoSeguimientoV2>(crearEstadoRecursivoV2());
  const ultimaFaseRef = useRef<FaseV2 | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const ultimoTickMsRef = useRef(0);

  function log(linea: string) {
    console.log(linea);
    setLogs((prev) => [...prev.slice(-60), linea]);
  }

  function parametros(): ParametrosCoreografiaV2 {
    return {
      duracionPanoramicaInicialSeg: duracionA,
      duracionPaneoAcercamientoSeg: duracionBC,
      duracionSeguimientoSeg: duracionD,
      duracionAlejamientoPaneoSeg: duracionEF,
      duracionPanoramicaFinalSeg: duracionG,
      finPaneoFraccion,
      inicioZoomFraccion,
    };
  }

  async function prepararTodo() {
    setPreparando(true);
    setLogs([]);
    const tInicio = performance.now();

    const grillaAncha = elegirGrillaAncha(RUTA_PRUEBA, ANCHO_VIDEO, ALTO_VIDEO);
    zoomAnchoRef.current = grillaAncha.zoom;
    const ruta = construirRutaCoreografiaV2(RUTA_PRUEBA, grillaAncha);
    rutaRef.current = ruta;
    datosEstadisticasRef.current = construirDatosEstadisticasV2(RUTA_PRUEBA, ruta.distanciaTotalKm);
    const indiceVelMax = datosEstadisticasRef.current.indiceVelMax;
    const puntoVelMaxGps = indiceVelMax >= 0 ? RUTA_PRUEBA[indiceVelMax] : null;
    const nombreCalleVelMax = puntoVelMaxGps ? await reverseGeocodificarEspecifico(puntoVelMaxGps.lat, puntoVelMaxGps.lon) : null;
    log(`[v2-fase6] nombreCalleVelMax=${nombreCalleVelMax ?? "null (fallback VELOCIDAD MÁXIMA)"}`);
    etiquetasPanoramicaRef.current = construirEtiquetasPanoramicaV2(
      ruta.centroide,
      ruta,
      datosEstadisticasRef.current,
      SECTORES_RUTA_PRUEBA,
      nombreCalleVelMax,
    );
    const ventana = calcularVentanaCrossfade(grillaAncha.zoom);
    ventanaRef.current = ventana;
    const duracionSeguimientoAuto = calcularDuracionSeguimientoV2(ruta.distanciaTotalKm);
    setDuracionD(duracionSeguimientoAuto);
    const params = { ...parametros(), duracionSeguimientoSeg: duracionSeguimientoAuto };

    // trayectoria propia SOLO para congelar la posición de las tarjetas de
    // foto (ver construirFotosRutaV2) -- no es la que usa el scrubber en
    // vivo (ese sigue siendo calcularFaseYCamaraV2 incremental), es
    // simplemente la misma función pura de Fase 3 evaluada una vez acá.
    const trayectoriaParaFotos = construirTrayectoriaV2(ruta, params, FPS_FASE3, indiceVelMax);
    const fotosRutaImgs = await cargarFotosRutaV2(FOTOS_RUTA_PRUEBA_URLS, log);
    fotosRutaRef.current = construirFotosRutaV2(fotosRutaImgs, ruta, params, trayectoriaParaFotos);
    log(`[v2-fase6] fotosDeRutaListas(preview)=${fotosRutaRef.current.length}/${FOTOS_RUTA_PRUEBA_URLS.length}`);

    const corredorZ17 = construirCorredorZ17V2(ruta, ventana);
    // Cobertura real de la grilla ancha (panorámica + paneo/zoom de
    // entrada y salida) -- se agrega al set del bbox, no lo reemplaza; el
    // zoom elegido (grillaAncha.zoom) queda intacto.
    const coberturaAncha = construirCoberturaGrillaAnchaV2(ruta, ventana, params, ventana.factorAncho);
    const clavesAncha = new Set([...grillaAncha.claves, ...coberturaAncha]);

    const contAncha = crearContadoresTilesHibridos();
    const contZ17 = crearContadoresTilesHibridos();
    const [tilesAncha, tilesZ17] = await Promise.all([
      prepararTilesHibridos(clavesAncha, grillaAncha.zoom, CONCURRENCIA, contAncha),
      prepararTilesHibridos(corredorZ17, ZOOM_SEGUIMIENTO, CONCURRENCIA, contZ17),
    ]);
    tilesAnchaRef.current = tilesAncha;
    tilesZ17Ref.current = tilesZ17;

    const tTotalMs = performance.now() - tInicio;
    const bytesPorTile = 256 * 256 * 4;
    const memAnchaMB = (tilesAncha.size * bytesPorTile) / 1_048_576;
    const memZ17MB = (tilesZ17.size * bytesPorTile) / 1_048_576;

    log(`[v2-camara] zoomAncho=${grillaAncha.zoom} factorAncho=${ventana.factorAncho.toFixed(6)}`);
    log(
      `[v2-camara] ventanaCrossfade escalaInferior=${ventana.escalaInferior.toFixed(4)} escalaCorte=${ventana.escalaCorte.toFixed(4)} escalaSuperior=${ventana.escalaSuperior.toFixed(4)}`,
    );
    log(
      `[v2-camara] grillaAncha tiles=${tilesAncha.size}/${clavesAncha.size} (bbox=${grillaAncha.claves.size} cobertura=${coberturaAncha.size}) memoriaMB=${memAnchaMB.toFixed(2)} fallos(sat/etq)=${contAncha.falloSatelite}/${contAncha.falloEtiquetas}`,
    );
    log(
      `[v2-camara] grillaZ17 tiles=${tilesZ17.size}/${corredorZ17.size} memoriaMB=${memZ17MB.toFixed(2)} fallos(sat/etq)=${contZ17.falloSatelite}/${contZ17.falloEtiquetas}`,
    );
    log(`[v2-camara] memoriaTotalMB=${(memAnchaMB + memZ17MB).toFixed(2)} tiempoPreparacionMs=${tTotalMs.toFixed(0)}`);
    log(`[v2-camara] distanciaTotalKm=${ruta.distanciaTotalKm.toFixed(3)} duracionSeguimientoSeg=${duracionSeguimientoAuto.toFixed(2)}`);
    log(
      `[v2-camara] centroide=(${ruta.centroide.cx.toFixed(1)},${ruta.centroide.cy.toFixed(1)},${ruta.centroide.escala.toFixed(5)}) ` +
        `inicioSeguimiento=(${ruta.inicioSeguimiento.cx.toFixed(1)},${ruta.inicioSeguimiento.cy.toFixed(1)},${ruta.inicioSeguimiento.escala.toFixed(4)}) ` +
        `finSeguimiento=(${ruta.finSeguimiento.cx.toFixed(1)},${ruta.finSeguimiento.cy.toFixed(1)},${ruta.finSeguimiento.escala.toFixed(4)})`,
    );

    // Verificación de continuidad matemática en los límites de fase --
    // evalúa la cámara justo antes/después de cada frontera y confirma que
    // cx/cy/escala no saltan.
    const fronteras = [
      params.duracionPanoramicaInicialSeg,
      params.duracionPanoramicaInicialSeg + params.duracionPaneoAcercamientoSeg,
      params.duracionPanoramicaInicialSeg + params.duracionPaneoAcercamientoSeg + params.duracionSeguimientoSeg,
      params.duracionPanoramicaInicialSeg + params.duracionPaneoAcercamientoSeg + params.duracionSeguimientoSeg + params.duracionAlejamientoPaneoSeg,
    ];
    for (const t of fronteras) {
      const antes = calcularFaseYCamaraV2(ruta, params, t - 0.001, crearEstadoRecursivoV2(), "resimular");
      const despues = calcularFaseYCamaraV2(ruta, params, t + 0.001, crearEstadoRecursivoV2(), "resimular");
      const saltoPx = Math.hypot(despues.camara.cx - antes.camara.cx, despues.camara.cy - antes.camara.cy);
      const saltoEscala = Math.abs(despues.camara.escala - antes.camara.escala);
      log(
        `[v2-continuidad] t=${t.toFixed(2)}s ${antes.fase}->${despues.fase} saltoPosicionPx=${saltoPx.toFixed(3)} saltoEscala=${saltoEscala.toFixed(6)}`,
      );
    }

    setPreparando(false);
    dibujarCuadro(ruta, ventana, params, 0);
  }

  // V2 -- Fase 3: planifica segmentos Z17 por presupuesto de memoria a
  // partir de la trayectoria real de cámara, los prepara secuencialmente
  // (liberando antes de fetchear, conservando compartidos) y verifica los
  // 100% de los frames del video -- SIN MediaRecorder todavía. Usa sus
  // propias variables locales (no toca rutaRef/ventanaRef/tilesAnchaRef/
  // tilesZ17Ref, que son del flujo de Fase 2) para no interferir con el
  // botón "Preparar tiles" existente.
  async function planificarFase3() {
    setPlanificandoFase3(true);
    setLogs([]);
    const tInicio = performance.now();
    log("--- Fase 3: planificación y verificación de segmentos (sin grabar) ---");

    const grillaAncha = elegirGrillaAncha(RUTA_PRUEBA, ANCHO_VIDEO, ALTO_VIDEO);
    const ruta = construirRutaCoreografiaV2(RUTA_PRUEBA, grillaAncha);
    const ventana = calcularVentanaCrossfade(grillaAncha.zoom);
    const duracionSeguimientoAuto = calcularDuracionSeguimientoV2(ruta.distanciaTotalKm);
    const paramsFase3 = { ...parametros(), duracionSeguimientoSeg: duracionSeguimientoAuto };
    log(`[v2-fase3] zoomAncho=${grillaAncha.zoom} distanciaTotalKm=${ruta.distanciaTotalKm.toFixed(3)} duracionSeguimientoSeg=${duracionSeguimientoAuto.toFixed(2)}`);

    // Cobertura ancha de Fase 2 (bbox + trayectoria de intro/outro con
    // pasos fijos) -- sin cambios, se sigue calculando igual.
    const coberturaAnchaFase2 = construirCoberturaGrillaAnchaV2(ruta, ventana, paramsFase3, ventana.factorAncho);
    const clavesAnchaFase2 = new Set([...grillaAncha.claves, ...coberturaAnchaFase2]);

    // Trayectoria completa precomputada -- única fuente de verdad para
    // planificar Y para dibujar/verificar (Z17 y, ahora, también la
    // cobertura ancha complementaria). indiceVelMax solo para que la
    // pausa de velocidad máxima (si aplica) quede incluida en los cuadros
    // que se planifican/verifican acá -- mismo dato que ya usa Fase 5/6,
    // sin geocodificar nada nuevo (esta función no necesita el nombre de
    // calle, solo el índice para saber DÓNDE insertar los cuadros extra).
    const datosEstadisticasFase3 = construirDatosEstadisticasV2(RUTA_PRUEBA, ruta.distanciaTotalKm);
    const trayectoria = construirTrayectoriaV2(ruta, paramsFase3, FPS_FASE3, datosEstadisticasFase3.indiceVelMax);
    log(`[v2-fase3] trayectoria: ${trayectoria.length} frames a ${FPS_FASE3}fps (duracionTotal=${duracionTotalV2(paramsFase3).toFixed(2)}s)`);

    // Presupuesto/ventana efectiva calculados con el tamaño PLANEADO de la
    // grilla ancha de Fase 2 (antes de fetchear nada) -- la cobertura
    // extra de abajo (Fase 3) es un AGREGADO al set final a fetchear, no
    // debe retroalimentar esta cuenta: si lo hiciera, un puñado de tiles
    // anchos extra podría mover la ventana efectiva y la segmentación Z17,
    // algo que este cambio explícitamente no debe tocar.
    const presupuestoZ17Bytes = calcularPresupuestoZ17Bytes(
      PRESUPUESTO_TOTAL_BYTES_DEFECTO,
      clavesAnchaFase2.size * BYTES_POR_TILE,
      CONCURRENCIA,
    );
    log(
      `[v2-fase3] presupuestoTotalMB=${(PRESUPUESTO_TOTAL_BYTES_DEFECTO / 1_048_576).toFixed(0)} presupuestoZ17MB=${(presupuestoZ17Bytes / 1_048_576).toFixed(2)} fraccionMaxUnFrame=${FRACCION_MAX_UN_FRAME_DEFECTO}`,
    );

    let ventanaEfectiva;
    try {
      ventanaEfectiva = determinarVentanaEfectivaZ17(trayectoria, presupuestoZ17Bytes, FRACCION_MAX_UN_FRAME_DEFECTO);
    } catch (e) {
      log(`[v2-fase3] ERROR: ${(e as Error).message}`);
      setPlanificandoFase3(false);
      return;
    }
    const escalaEntradaReal = trayectoria[ventanaEfectiva.frameEntrada]?.camara.escala ?? 0;
    const escalaSalidaReal = trayectoria[ventanaEfectiva.frameSalida]?.camara.escala ?? 0;
    const escalaViableZ17Real = Math.max(escalaEntradaReal, escalaSalidaReal);
    log(
      `[v2-fase3] escalaViableZ17 analítico(semilla)=${ventanaEfectiva.escalaViableZ17Analitico.toFixed(4)} ` +
        `real(discreta)=${escalaViableZ17Real.toFixed(4)} -- frameEntrada=${ventanaEfectiva.frameEntrada} (escala=${escalaEntradaReal.toFixed(4)}) ` +
        `frameSalida=${ventanaEfectiva.frameSalida} (escala=${escalaSalidaReal.toFixed(4)})`,
    );
    const anchoDeseado = ventanaEfectiva.escalaInferiorEfectiva * 2;
    const ventanaComprimida = anchoDeseado > ESCALA_SEGUIMIENTO + 1e-9;
    log(
      `[v2-fase3] ventanaEfectiva escalaInferior=${ventanaEfectiva.escalaInferiorEfectiva.toFixed(4)} escalaSuperior=${ventanaEfectiva.escalaSuperiorEfectiva.toFixed(4)} ` +
        `(ESCALA_SEGUIMIENTO=${ESCALA_SEGUIMIENTO}) ventanaComprimida=${ventanaComprimida}`,
    );

    // Frames donde Z17 quedó apagado ESPECÍFICAMENTE por presupuesto (no
    // porque Fase 2 ya lo hubiera apagado con su propia ventana real) --
    // escala > ventana.escalaInferior real (Fase 2 mostraría algo de Z17)
    // pero <= escalaInferiorEfectiva (Fase 3 lo apaga por memoria).
    const framesApagadosPorPresupuesto = trayectoria.filter(
      (f) => f.camara.escala > ventana.escalaInferior && f.camara.escala <= ventanaEfectiva.escalaInferiorEfectiva,
    );
    // No necesariamente contiguos -- puede haber una franja en la entrada
    // (acercamiento) y otra separada en la salida (alejamiento).
    log(
      `[v2-fase3] framesApagadosPorPresupuesto=${framesApagadosPorPresupuesto.length}` +
        (framesApagadosPorPresupuesto.length > 0
          ? ` (indices: ${framesApagadosPorPresupuesto.map((f) => f.indice).join(",")})`
          : ""),
    );

    // Chequeo de monotonicidad: exactamente UNA transición apagado->encendido
    // y UNA encendido->apagado en todo el video (nunca Z17->ANCHA->Z17).
    let transiciones = 0;
    let anteriorOn = false;
    for (const frame of trayectoria) {
      const on = pesoZ17Efectivo(frame.camara.escala, ventanaEfectiva) > 0;
      if (on !== anteriorOn) transiciones++;
      anteriorOn = on;
    }
    log(`[v2-fase3] transicionesOnOff=${transiciones} (esperado 2; si Z17 nunca se activa, 0)`);

    // Cobertura ancha derivada directamente de la trayectoria real (Fase 3)
    // -- complementa la de Fase 2 (no la reemplaza), agregando los tiles
    // que la muestra fija de 60 pasos de Fase 2 puede saltarse en rutas
    // largas/lentas. La unión es lo que se fetchea; construirCoberturaGrillaAnchaV2
    // sigue calculándose igual que siempre.
    const coberturaAnchaFase3 = construirCoberturaGrillaAnchaFase3(trayectoria, ventanaEfectiva, ventana.factorAncho);
    const clavesAnchaFinal = new Set([...clavesAnchaFase2, ...coberturaAnchaFase3]);
    const extraFase3 = [...coberturaAnchaFase3].filter((t) => !clavesAnchaFase2.has(t)).length;
    log(
      `[v2-fase3] coberturaAncha: fase2=${clavesAnchaFase2.size} fase3=${coberturaAnchaFase3.size} extraFase3=${extraFase3} final=${clavesAnchaFinal.size}`,
    );

    const segmentos = planificarSegmentosZ17(trayectoria, ventanaEfectiva, presupuestoZ17Bytes);
    const tilesZ17UnicosTotal = new Set<string>();
    for (const s of segmentos) for (const t of s.tiles) tilesZ17UnicosTotal.add(t);
    log(`[v2-fase3] segmentos=${segmentos.length} tilesZ17UnicosTotal=${tilesZ17UnicosTotal.size}`);
    let excesoPresupuesto = false;
    segmentos.forEach((s, idx) => {
      const memSegMB = (s.tiles.size * BYTES_POR_TILE) / 1_048_576;
      if (s.tiles.size * BYTES_POR_TILE > presupuestoZ17Bytes) excesoPresupuesto = true;
      log(
        `[v2-fase3]   segmento ${idx}: frames ${s.frameInicio}-${s.frameFin} (${s.frameFin - s.frameInicio + 1} cuadros) tilesZ17=${s.tiles.size} memZ17MB=${memSegMB.toFixed(2)}`,
      );
    });
    log(`[v2-fase3] algúnSegmentoExcedePresupuesto=${excesoPresupuesto}`);
    // Corte del timer de planificación ACÁ -- todo lo de arriba es cómputo
    // puro (sin red); lo de abajo (grilla ancha + segmentos Z17) sí
    // fetchea de verdad, cae bajo "preparación".
    const tPlanificacionMs = performance.now() - tInicio;
    log(`[v2-fase3] tiempoPlanificacionMs=${tPlanificacionMs.toFixed(0)}`);
    const tPrepInicio = performance.now();

    const contAncha = crearContadoresTilesHibridos();
    const tilesAncha = await prepararTilesHibridos(clavesAnchaFinal, grillaAncha.zoom, CONCURRENCIA, contAncha);
    const memGrillaAnchaBytes = tilesAncha.size * BYTES_POR_TILE;
    log(
      `[v2-fase3] grillaAncha tiles=${tilesAncha.size}/${clavesAnchaFinal.size} memoriaMB=${(memGrillaAnchaBytes / 1_048_576).toFixed(2)} fallos(sat/etq)=${contAncha.falloSatelite}/${contAncha.falloEtiquetas}`,
    );

    // Preparar cada segmento secuencialmente: liberar lo que ya no sirve
    // ANTES de fetchear lo nuevo (acota el pico de memoria), conservar los
    // tiles compartidos con el segmento anterior sin re-pedirlos.
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas) {
      canvas.width = ANCHO_VIDEO;
      canvas.height = ALTO_VIDEO;
    }

    const tilesZ17Residentes = new Map<string, ImageBitmap>();
    let totalFaltantes = 0;
    let totalFramesVerificados = 0;
    let picoMemoriaBytes = memGrillaAnchaBytes;

    for (let s = 0; s < segmentos.length; s++) {
      const anteriorTiles = s > 0 ? segmentos[s - 1].tiles : new Set<string>();
      const actualTiles = segmentos[s].tiles;
      const aLiberar = [...anteriorTiles].filter((t) => !actualTiles.has(t));
      const aFetchear = [...actualTiles].filter((t) => !anteriorTiles.has(t));

      for (const t of aLiberar) {
        tilesZ17Residentes.get(t)?.close();
        tilesZ17Residentes.delete(t);
      }

      const contZ17 = crearContadoresTilesHibridos();
      const nuevos = await prepararTilesHibridos(new Set(aFetchear), ZOOM_SEGUIMIENTO, CONCURRENCIA, contZ17);
      for (const [k, v] of nuevos) tilesZ17Residentes.set(k, v);

      const memoriaActual = memGrillaAnchaBytes + tilesZ17Residentes.size * BYTES_POR_TILE;
      picoMemoriaBytes = Math.max(picoMemoriaBytes, memoriaActual);

      log(
        `[v2-fase3] segmento ${s} preparado: compartidos=${anteriorTiles.size - aLiberar.length} liberados=${aLiberar.length} nuevos=${nuevos.size} residentesZ17=${tilesZ17Residentes.size} memoriaMB=${(memoriaActual / 1_048_576).toFixed(2)} fallos=${contZ17.falloSatelite}/${contZ17.falloEtiquetas}`,
      );

      if (ctx) {
        for (let i = segmentos[s].frameInicio; i <= segmentos[s].frameFin; i++) {
          const frame = trayectoria[i];
          const pesoEf = pesoZ17Efectivo(frame.camara.escala, ventanaEfectiva);
          ctx.fillStyle = "#000";
          ctx.fillRect(0, 0, ANCHO_VIDEO, ALTO_VIDEO);
          const camaraAncha = { x: frame.camara.cx * ventana.factorAncho, y: frame.camara.cy * ventana.factorAncho };
          const escalaCropAncha = frame.camara.escala / ventana.factorAncho;
          const resAncha = dibujarTilesHibridos(ctx, tilesAncha, camaraAncha, escalaCropAncha, ANCHO_VIDEO, ALTO_VIDEO, 1);
          let resZ17 = { tilesVisibles: 0, tilesFaltantes: 0 };
          if (pesoEf > 0) {
            resZ17 = dibujarTilesHibridos(
              ctx,
              tilesZ17Residentes,
              { x: frame.camara.cx, y: frame.camara.cy },
              frame.camara.escala,
              ANCHO_VIDEO,
              ALTO_VIDEO,
              pesoEf,
            );
          }
          totalFaltantes += resAncha.tilesFaltantes + resZ17.tilesFaltantes;
          totalFramesVerificados++;
          if (resAncha.tilesFaltantes > 0 || resZ17.tilesFaltantes > 0) {
            log(
              `[v2-fase3-faltantes] frame=${i} fase=${frame.fase} anchaFaltantes=${resAncha.tilesFaltantes} z17Faltantes=${resZ17.tilesFaltantes}`,
            );
          }
        }
      }
    }

    const tPrepMs = performance.now() - tPrepInicio;
    const tTotalMs = performance.now() - tInicio;
    log(
      `[v2-fase3] VERIFICACION: ${totalFramesVerificados}/${trayectoria.length} frames dibujados, tilesFaltantes total=${totalFaltantes}`,
    );
    log(
      `[v2-fase3] memoriaPico=${(picoMemoriaBytes / 1_048_576).toFixed(2)}MB (objetivo ${(PRESUPUESTO_TOTAL_BYTES_DEFECTO / 1_048_576).toFixed(0)}MB)`,
    );
    log(
      `[v2-fase3] tiempoPreparacionVerificacionMs=${tPrepMs.toFixed(0)} tiempoTotalMs=${tTotalMs.toFixed(0)} (planificación=${tPlanificacionMs.toFixed(0)})`,
    );

    for (const bitmap of tilesZ17Residentes.values()) bitmap.close();
    setPlanificandoFase3(false);
  }

  // V2 -- Fase 4: grabación real con MediaRecorder sobre la trayectoria y
  // segmentación de Fase 3 (sin tocarlas). Repite la misma construcción de
  // planificación que planificarFase3 (grilla ancha, trayectoria, ventana
  // efectiva, segmentos) en vez de compartir código con ella, a propósito
  // -- para no arriesgar tocar el comportamiento ya verificado de Fase 3
  // al integrar la grabación.
  async function grabarFase4() {
    // Primerísima línea a propósito -- si esto no se ve reflejado en
    // pantalla (contador de toques), el toque no llegó al handler; si se
    // ve pero no aparece nada más después, entró y falló en otro lado.
    setTapsFase4((n) => n + 1);
    setGrabandoFase4(true);
    setLogs([]);
    setVideoUrlFase4(null);
    log("--- Fase 4: grabación real con MediaRecorder ---");
    const rutaGps =
      rutaFase4 === "corta" ? RUTA_PRUEBA_CORTA : rutaFase4 === "larga" ? RUTA_PRUEBA_LARGA : RUTA_PRUEBA;
    log(`[v2-fase4] rutaSeleccionada=${rutaFase4}`);

    const grillaAncha = elegirGrillaAncha(rutaGps, ANCHO_VIDEO, ALTO_VIDEO);
    const ruta = construirRutaCoreografiaV2(rutaGps, grillaAncha);
    const ventana = calcularVentanaCrossfade(grillaAncha.zoom);
    const duracionSeguimientoAuto = calcularDuracionSeguimientoV2(ruta.distanciaTotalKm);
    const paramsFase3 = { ...parametros(), duracionSeguimientoSeg: duracionSeguimientoAuto };
    log(
      `[v2-fase4] zoomAncho=${grillaAncha.zoom} distanciaTotalKm=${ruta.distanciaTotalKm.toFixed(3)} duracionSeguimientoSeg=${duracionSeguimientoAuto.toFixed(2)}`,
    );

    const datosEstadisticas = construirDatosEstadisticasV2(rutaGps, ruta.distanciaTotalKm);

    // Único punto donde se geocodifica algo nuevo -- el nombre de calle del
    // punto real de velocidad máxima, igual que hará generarVideoRecorridoV2.ts
    // en producción. Las 3 etiquetas de sector NO se geocodifican acá (ver
    // SECTORES_RUTA_PRUEBA, ya "resueltas" como vendrían de MisRutasPanel.tsx).
    const indiceVelMax = datosEstadisticas.indiceVelMax;
    const puntoVelMaxGps = indiceVelMax >= 0 ? rutaGps[indiceVelMax] : null;
    const nombreCalleVelMax = puntoVelMaxGps ? await reverseGeocodificarEspecifico(puntoVelMaxGps.lat, puntoVelMaxGps.lon) : null;
    log(`[v2-fase4] indiceVelMax=${indiceVelMax} nombreCalleVelMax=${nombreCalleVelMax ?? "null (fallback VELOCIDAD MÁXIMA)"}`);

    const coberturaAnchaFase2 = construirCoberturaGrillaAnchaV2(ruta, ventana, paramsFase3, ventana.factorAncho);
    const clavesAnchaFase2 = new Set([...grillaAncha.claves, ...coberturaAnchaFase2]);

    const trayectoria = construirTrayectoriaV2(ruta, paramsFase3, FPS_FASE3, indiceVelMax);
    log(
      `[v2-fase4] trayectoria: ${trayectoria.length} frames a ${FPS_FASE3}fps (duracionTotal=${duracionTotalV2(paramsFase3).toFixed(2)}s)`,
    );

    const presupuestoZ17Bytes = calcularPresupuestoZ17Bytes(
      PRESUPUESTO_TOTAL_BYTES_DEFECTO,
      clavesAnchaFase2.size * BYTES_POR_TILE,
      CONCURRENCIA,
    );

    let ventanaEfectiva;
    try {
      ventanaEfectiva = determinarVentanaEfectivaZ17(trayectoria, presupuestoZ17Bytes, FRACCION_MAX_UN_FRAME_DEFECTO);
    } catch (e) {
      log(`[v2-fase4] ERROR: ${(e as Error).message}`);
      setGrabandoFase4(false);
      return;
    }
    log(
      `[v2-fase4] ventanaEfectiva escalaInferior=${ventanaEfectiva.escalaInferiorEfectiva.toFixed(4)} escalaSuperior=${ventanaEfectiva.escalaSuperiorEfectiva.toFixed(4)}`,
    );

    const coberturaAnchaFase3 = construirCoberturaGrillaAnchaFase3(trayectoria, ventanaEfectiva, ventana.factorAncho);
    const clavesAnchaFinal = new Set([...clavesAnchaFase2, ...coberturaAnchaFase3]);

    const segmentos = planificarSegmentosZ17(trayectoria, ventanaEfectiva, presupuestoZ17Bytes);
    log(`[v2-fase4] segmentos=${segmentos.length}`);
    segmentos.forEach((s, idx) => {
      log(`[v2-fase4]   segmento ${idx}: frames ${s.frameInicio}-${s.frameFin} tilesZ17=${s.tiles.size}`);
    });

    const canvas = canvasRef.current;
    if (!canvas) {
      log("[v2-fase4] ERROR: no hay canvas disponible.");
      setGrabandoFase4(false);
      return;
    }

    try {
      const resultado = await grabarVideoV2(
        {
          ventana,
          ventanaEfectiva,
          trayectoria,
          segmentos,
          clavesAnchaFinal,
          zoomAncho: grillaAncha.zoom,
          fps: FPS_FASE3,
          canvas,
          ruta,
          params: paramsFase3,
          datosEstadisticas,
          sectoresRuta: SECTORES_RUTA_PRUEBA,
          nombreCalleVelMax,
          fotosRutaUrls: FOTOS_RUTA_PRUEBA_URLS,
          fotoCierreUrl: FOTO_CIERRE_PRUEBA_URL,
          ciudad: CIUDAD_PRUEBA,
          musicaUrl: conMusicaFase4 ? MUSICA_PRUEBA_URL : undefined,
          musicaInicioSeg: MUSICA_PRUEBA_INICIO_SEG,
        },
        log,
      );
      log(`[v2-fase4] Blob listo: bytes=${resultado.blob.size} mimeType=${resultado.mimeType}`);
      log(
        `[v2-fase4] duracionLogicaSeg=${resultado.duracionLogicaSeg.toFixed(2)} tiempoTotalMs=${resultado.tiempoTotalMs.toFixed(0)} ` +
          `tiempoPausadoTotalMs=${resultado.tiempoPausadoTotalMs.toFixed(0)} stallsLoopPrincipal=${resultado.stallsLoopPrincipal} ` +
          `stallsCierre=${resultado.stallsCierre} stallsTotales=${resultado.stallsTotales}`,
      );

      const url = URL.createObjectURL(resultado.blob);
      setVideoUrlFase4(url);

      const video = videoRef.current;
      if (video) {
        video.src = url;
        await new Promise<void>((resolve) => {
          video.onloadedmetadata = () => resolve();
          video.onerror = () => resolve();
        });
        let duracionArchivoSeg = video.duration;
        if (!isFinite(duracionArchivoSeg)) {
          // Quirk conocido de Chrome con blobs grabados por MediaRecorder:
          // la duración no queda escrita en el contenedor -- forzar un
          // seek al final hace que el navegador la recalcule de verdad.
          await new Promise<void>((resolve) => {
            video.onseeked = () => resolve();
            video.currentTime = 1e9;
          });
          duracionArchivoSeg = video.duration;
          video.currentTime = 0;
        }
        const diffMs = (duracionArchivoSeg - resultado.duracionLogicaSeg) * 1000;
        log(
          `[v2-fase4] duracionArchivoSeg=${isFinite(duracionArchivoSeg) ? duracionArchivoSeg.toFixed(3) : "N/A"} diffMs=${isFinite(diffMs) ? diffMs.toFixed(0) : "N/A"}`,
        );
      }
    } catch (e) {
      log(`[v2-fase4] ABORT: ${(e as Error).message}`);
    }

    setGrabandoFase4(false);
  }

  // DIAGNÓSTICO TEMPORAL -- carga UN tile híbrido Z17 real (el mismo punto
  // de partida de la ruta seleccionada) directamente con cargarTileHibrido
  // (la misma función que usan Fase 2/3/4, sin bifurcación de código) y lo
  // dibuja grande en el canvas, ANTES de tocar grabarVideoV2 para nada --
  // separa "el bitmap ya viene sin etiquetas" de "se pierden después".
  async function verificarTileHibrido() {
    setDiagTileEstado("cargando...");
    const rutaGps =
      rutaFase4 === "corta" ? RUTA_PRUEBA_CORTA : rutaFase4 === "larga" ? RUTA_PRUEBA_LARGA : RUTA_PRUEBA;
    const grillaAncha = elegirGrillaAncha(rutaGps, ANCHO_VIDEO, ALTO_VIDEO);
    const ruta = construirRutaCoreografiaV2(rutaGps, grillaAncha);
    const punto = ruta.puntosZ17[0];
    const tx = Math.floor(punto.x / TAM_TILE);
    const ty = Math.floor(punto.y / TAM_TILE);

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) {
      setDiagTileEstado("ERROR: no hay canvas");
      return;
    }
    canvas.width = ANCHO_VIDEO;
    canvas.height = ALTO_VIDEO;

    const contadores = crearContadoresTilesHibridos();
    const bitmap = await cargarTileHibrido(ZOOM_SEGUIMIENTO, tx, ty, contadores);
    if (!bitmap) {
      const msg = `SIN BITMAP -- falloSatelite=${contadores.falloSatelite} (tile z=${ZOOM_SEGUIMIENTO} tx=${tx} ty=${ty})`;
      setDiagTileEstado(msg);
      log(`[v2-diag-tile] ${msg}`);
      return;
    }

    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, ANCHO_VIDEO, ALTO_VIDEO);
    // Dibujado grande (3x, 768x768) para que las etiquetas -- si están --
    // se vean con claridad en una captura de pantalla.
    const escalaDiag = 3;
    ctx.drawImage(bitmap, 0, 0, TAM_TILE, TAM_TILE, 0, 0, TAM_TILE * escalaDiag, TAM_TILE * escalaDiag);
    ctx.fillStyle = "#39ff6a";
    ctx.font = "20px monospace";
    ctx.fillText(`tile z=${ZOOM_SEGUIMIENTO} tx=${tx} ty=${ty} escalaDiag=${escalaDiag}x`, 16, TAM_TILE * escalaDiag + 30);

    const msg = `bitmap cargado -- falloSatelite=${contadores.falloSatelite} falloEtiquetas=${contadores.falloEtiquetas} (tile z=${ZOOM_SEGUIMIENTO} tx=${tx} ty=${ty})`;
    setDiagTileEstado(msg);
    log(`[v2-diag-tile] ${msg}`);
  }

  function dibujarCuadro(
    ruta: RutaCoreografiaV2,
    ventana: VentanaCrossfade,
    params: ParametrosCoreografiaV2,
    t: number,
    modo: "incremental" | "resimular" = "resimular",
  ) {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    canvas.width = ANCHO_VIDEO;
    canvas.height = ALTO_VIDEO;

    const resultado = calcularFaseYCamaraV2(ruta, params, t, estadoSeguimientoRef.current, modo);
    setFaseActual(resultado.fase);

    if (ultimaFaseRef.current && ultimaFaseRef.current !== resultado.fase) {
      log(`[v2-fase] ${ultimaFaseRef.current} -> ${resultado.fase} en t=${t.toFixed(2)}s`);
    }
    ultimaFaseRef.current = resultado.fase;

    const { camara } = resultado;
    const peso = pesoZ17DesdeEscala(camara.escala, ventana);

    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, ANCHO_VIDEO, ALTO_VIDEO);

    const camaraAncha = { x: camara.cx * ventana.factorAncho, y: camara.cy * ventana.factorAncho };
    const escalaCropAncha = camara.escala / ventana.factorAncho;
    const resAncha = dibujarTilesHibridos(ctx, tilesAnchaRef.current, camaraAncha, escalaCropAncha, ANCHO_VIDEO, ALTO_VIDEO, 1);

    let resZ17 = { tilesVisibles: 0, tilesFaltantes: 0 };
    if (peso > 0) {
      resZ17 = dibujarTilesHibridos(
        ctx,
        tilesZ17Ref.current,
        { x: camara.cx, y: camara.cy },
        camara.escala,
        ANCHO_VIDEO,
        ALTO_VIDEO,
        peso,
      );
    }

    // Fase 5: trazado progresivo + marcador + marca vel. máxima +
    // estadísticas -- misma capa que grabacionV2.ts, evaluable acá sin
    // generar un video cada vez. Reemplaza el trazo de ruta completa fijo
    // que usaba este preview antes de Fase 5 (ese era solo un diagnóstico
    // de Fase 2, redundante con el trazado real de acá).
    // pausaVelMax siempre null acá -- este scrubber recalcula un único
    // instante puntual (calcularFaseYCamaraV2, "resimular"), nunca recorre
    // el array de trayectoria[] real donde vive la pausa (ver
    // construirTrayectoriaV2 en trayectoriaV2.ts); para ver la pausa hay
    // que usar Fase 4 (grabar), que sí usa esa trayectoria real.
    const frameScrub = { indice: 0, tiempoSeg: t, fase: resultado.fase, camara, pausaVelMax: null };
    if (datosEstadisticasRef.current) {
      dibujarOverlayFase5(ctx, frameScrub, ruta, params, datosEstadisticasRef.current);
    }
    // Fase 6A: fotos durante el recorrido -- misma capa que grabacionV2.ts,
    // evaluable acá sin generar un video cada vez. Dibujada DESPUÉS de
    // Fase 5 (mismo orden ya fijo: tiles -> Fase 5 -> Fase 6).
    dibujarFotosRutaV2(ctx, frameScrub, ruta, params, fotosRutaRef.current);
    if (datosEstadisticasRef.current) {
      dibujarEtiquetaVelMaxFinalV2(ctx, frameScrub, ruta, datosEstadisticasRef.current);
      dibujarEtiquetasPanoramicaV2(ctx, etiquetasPanoramicaRef.current, alphaEtiquetasPanoramicaV2(frameScrub, params));
    }

    // Cruz en el centro (marca camara.cx/cy siempre).
    ctx.strokeStyle = "#ff2d2d";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(ANCHO_VIDEO / 2 - 20, ALTO_VIDEO / 2);
    ctx.lineTo(ANCHO_VIDEO / 2 + 20, ALTO_VIDEO / 2);
    ctx.moveTo(ANCHO_VIDEO / 2, ALTO_VIDEO / 2 - 20);
    ctx.lineTo(ANCHO_VIDEO / 2, ALTO_VIDEO / 2 + 20);
    ctx.stroke();

    // Diagnóstico de Fase 2 -- NUNCA debe aparecer en el canvas grabado ni
    // en el resultado final; acá en el preview queda detrás de un toggle
    // "modo debug" (apagado por defecto), en vez de dibujarse siempre.
    if (modoDebug) {
      ctx.fillStyle = "#39ff6a";
      ctx.font = "20px monospace";
      const lineas = [
        `fase=${resultado.fase} t=${t.toFixed(2)}s${resultado.fraccionTrazo !== null ? ` fraccionTrazo=${resultado.fraccionTrazo.toFixed(3)}` : ""}`,
        `cx=${camara.cx.toFixed(1)} cy=${camara.cy.toFixed(1)} escala=${camara.escala.toFixed(5)}`,
        `pesoZ17=${peso.toFixed(3)}`,
        `ancha: visibles=${resAncha.tilesVisibles} faltantes=${resAncha.tilesFaltantes}`,
        `z17: visibles=${resZ17.tilesVisibles} faltantes=${resZ17.tilesFaltantes}`,
      ];
      lineas.forEach((linea, i) => ctx.fillText(linea, 16, 178 + i * 26));
    }

    if (resAncha.tilesFaltantes > 0 || resZ17.tilesFaltantes > 0) {
      log(`[v2-faltantes] t=${t.toFixed(2)}s fase=${resultado.fase} anchaFaltantes=${resAncha.tilesFaltantes} z17Faltantes=${resZ17.tilesFaltantes}`);
    }
  }

  function tick(tsMs: number) {
    const ruta = rutaRef.current;
    const ventana = ventanaRef.current;
    if (!ruta || !ventana) return;
    if (ultimoTickMsRef.current === 0) ultimoTickMsRef.current = tsMs;
    const deltaSeg = ((tsMs - ultimoTickMsRef.current) / 1000) * velocidad;
    ultimoTickMsRef.current = tsMs;

    const params = parametros();
    const duracionTotal = duracionTotalV2(params);
    let nuevoTiempo = tiempoSeg + deltaSeg;
    if (nuevoTiempo >= duracionTotal) {
      nuevoTiempo = duracionTotal;
      setReproduciendo(false);
    }
    setTiempoSeg(nuevoTiempo);
    dibujarCuadro(ruta, ventana, params, nuevoTiempo, "incremental");

    if (nuevoTiempo < duracionTotal) {
      animFrameRef.current = requestAnimationFrame(tick);
    }
  }

  function alternarReproduccion() {
    if (reproduciendo) {
      if (animFrameRef.current !== null) cancelAnimationFrame(animFrameRef.current);
      setReproduciendo(false);
      return;
    }
    if (!rutaRef.current) return;
    // Al reanudar, reconstruye el estado recursivo de seguimiento hasta el
    // tiempo actual -- para que, si el tiempo actual cae dentro de la fase
    // de seguimiento (por ejemplo tras usar el scrubber), la recursión
    // continúe de forma consistente en vez de arrancar de cero.
    const params = parametros();
    const tBC = params.duracionPanoramicaInicialSeg + params.duracionPaneoAcercamientoSeg;
    const tD = tBC + params.duracionSeguimientoSeg;
    if (tiempoSeg > tBC && tiempoSeg < tD) {
      const fraccionTrazo = (tiempoSeg - tBC) / (tD - tBC);
      const { estado } = resimularEstadoCompleto(rutaRef.current, fraccionTrazo, Math.max(30, Math.round(fraccionTrazo * 240)));
      estadoSeguimientoRef.current = estado;
    } else {
      estadoSeguimientoRef.current = crearEstadoRecursivoV2();
    }
    ultimoTickMsRef.current = 0;
    setReproduciendo(true);
    animFrameRef.current = requestAnimationFrame(tick);
  }

  function alMoverScrubber(valor: number) {
    if (reproduciendo) alternarReproduccion(); // pausa
    setTiempoSeg(valor);
    const ruta = rutaRef.current;
    const ventana = ventanaRef.current;
    if (ruta && ventana) dibujarCuadro(ruta, ventana, parametros(), valor, "resimular");
  }

  const duracionTotal = duracionTotalV2(parametros());

  // Estilo explícito de botón -- ver comentario junto al JSX que lo usa
  // (Tailwind Preflight deja un <button> sin esto invisible/como texto).
  const estiloBoton = {
    padding: "10px 16px",
    fontSize: 14,
    background: "#2d2d2d",
    color: "#eee",
    border: "1px solid #666",
    borderRadius: 6,
    cursor: "pointer",
  };

  return (
    <div style={{ padding: 16, fontFamily: "monospace", color: "#eee", background: "#111", minHeight: "100vh" }}>
      <h1 style={{ fontSize: 16 }}>V2 Fase 2: coreografía de cámara (sin MediaRecorder)</h1>
      <p style={{ fontSize: 12, opacity: 0.8 }}>
        Diagnóstico temporal -- no toca V1. Panorámica → paneo → acercamiento → seguimiento → alejamiento → paneo final →
        panorámica final, una sola cámara Z17.
      </p>

      {/* Estilos explícitos (background/border/color/cursor) a propósito --
          Tailwind Preflight (globals.css hace `@import "tailwindcss"`)
          resetea la apariencia nativa de <button> a transparente/sin
          borde; sin esto, en un celular real un <button> con solo
          padding/fontSize se ve indistinguible de texto plano (causa real
          confirmada de "el botón parece texto normal" reportado desde
          Android). */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <button onClick={prepararTodo} disabled={preparando} style={estiloBoton}>
          {preparando ? "Preparando..." : "Preparar tiles"}
        </button>
        <button onClick={alternarReproduccion} disabled={!rutaRef.current} style={estiloBoton}>
          {reproduciendo ? "Pausar" : "Reproducir"}
        </button>
        <button onClick={planificarFase3} disabled={planificandoFase3} style={estiloBoton}>
          {planificandoFase3 ? "Planificando Fase 3..." : "Fase 3: planificar y verificar segmentos (sin grabar)"}
        </button>
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, fontSize: 12 }}>
        <input type="checkbox" checked={modoDebug} onChange={(e) => setModoDebug(e.target.checked)} />
        Modo debug (texto verde de diagnóstico Fase 2 sobre el mapa -- nunca aparece en el video grabado)
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, fontSize: 12 }}>
        <input type="checkbox" checked={conMusicaFase4} onChange={(e) => setConMusicaFase4(e.target.checked)} />
        Fase 6B: incluir música de prueba ({MUSICA_PRUEBA_URL}) en la grabación de Fase 4
      </label>

      <div
        style={{
          marginTop: 12,
          padding: 12,
          border: "2px solid #6cf",
          borderRadius: 6,
          background: "#0d2230",
        }}
      >
        <button onClick={grabarFase4} disabled={grabandoFase4} style={{ ...estiloBoton, background: "#2a6f97", fontSize: 16 }}>
          {grabandoFase4 ? "Grabando Fase 4..." : "Fase 4: grabar (MediaRecorder)"}
        </button>
        <div style={{ marginTop: 8, fontSize: 12 }}>
          Toques detectados en este botón: <strong>{tapsFase4}</strong>
          {" -- "}si este número no sube al tocar, el toque no está llegando al botón (revisar tamaño/superposición); si
          sube pero no aparece nada más abajo, entró y falló en otro lado.
        </div>
        <div style={{ marginTop: 8, display: "flex", gap: 16, fontSize: 12 }}>
          <label>
            <input type="radio" name="rutaFase4" checked={rutaFase4 === "corta"} onChange={() => setRutaFase4("corta")} />{" "}
            ruta corta (~2.15km)
          </label>
          <label>
            <input
              type="radio"
              name="rutaFase4"
              checked={rutaFase4 === "referencia"}
              onChange={() => setRutaFase4("referencia")}
            />{" "}
            ruta referencia (~4km)
          </label>
          <label>
            <input type="radio" name="rutaFase4" checked={rutaFase4 === "larga"} onChange={() => setRutaFase4("larga")} />{" "}
            ruta larga (~24km, 3 segmentos)
          </label>
        </div>
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px dashed #567" }}>
          <button onClick={verificarTileHibrido} style={{ ...estiloBoton, background: "#5a3d0d" }}>
            DIAG: verificar tile híbrido (¿tiene etiquetas?)
          </button>
          <div style={{ marginTop: 6, fontSize: 12 }}>Estado: {diagTileEstado}</div>
        </div>
      </div>

      <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 8, fontSize: 12 }}>
        <label>
          Panorámica inicial (s)
          <input type="number" step={0.1} value={duracionA} onChange={(e) => setDuracionA(Number(e.target.value))} style={{ width: "100%" }} />
        </label>
        <label>
          Paneo+acercamiento (s)
          <input type="number" step={0.1} value={duracionBC} onChange={(e) => setDuracionBC(Number(e.target.value))} style={{ width: "100%" }} />
        </label>
        <label>
          Seguimiento (s)
          <input type="number" step={0.1} value={duracionD} onChange={(e) => setDuracionD(Number(e.target.value))} style={{ width: "100%" }} />
        </label>
        <label>
          Alejamiento+paneo (s)
          <input type="number" step={0.1} value={duracionEF} onChange={(e) => setDuracionEF(Number(e.target.value))} style={{ width: "100%" }} />
        </label>
        <label>
          Panorámica final (s)
          <input type="number" step={0.1} value={duracionG} onChange={(e) => setDuracionG(Number(e.target.value))} style={{ width: "100%" }} />
        </label>
        <label>
          Fin paneo (fracción)
          <input
            type="number"
            step={0.05}
            min={0.05}
            max={0.95}
            value={finPaneoFraccion}
            onChange={(e) => setFinPaneoFraccion(Number(e.target.value))}
            style={{ width: "100%" }}
          />
        </label>
        <label>
          Inicio zoom (fracción)
          <input
            type="number"
            step={0.05}
            min={0.05}
            max={0.95}
            value={inicioZoomFraccion}
            onChange={(e) => setInicioZoomFraccion(Number(e.target.value))}
            style={{ width: "100%" }}
          />
        </label>
        <label>
          Velocidad
          <input type="number" step={0.1} min={0.1} max={4} value={velocidad} onChange={(e) => setVelocidad(Number(e.target.value))} style={{ width: "100%" }} />
        </label>
      </div>

      <div style={{ marginTop: 8 }}>
        <label style={{ fontSize: 12 }}>
          Scrubber ({tiempoSeg.toFixed(2)}s / {duracionTotal.toFixed(2)}s) -- fase: {faseActual ?? "-"}
        </label>
        <input
          type="range"
          min={0}
          max={duracionTotal || 1}
          step={0.01}
          value={tiempoSeg}
          onChange={(e) => alMoverScrubber(Number(e.target.value))}
          style={{ width: "100%" }}
        />
      </div>

      <canvas ref={canvasRef} style={{ width: 360, height: 640, border: "1px solid #555", marginTop: 12 }} />

      <div style={{ marginTop: 12, display: videoUrlFase4 ? "block" : "none" }}>
        <p style={{ fontSize: 12, opacity: 0.8 }}>Resultado de Fase 4 (MediaRecorder):</p>
        {/* Montado siempre (oculto vía CSS, no vía desmontaje condicional)
            -- para que videoRef.current ya exista cuando grabarFase4()
            necesita asignarle el src, sin depender de esperar un render de
            React después de setVideoUrlFase4(). */}
        <video ref={videoRef} controls style={{ width: 360, border: "1px solid #555" }} />
        <div>
          {videoUrlFase4 && (
            <a href={videoUrlFase4} download="fase4-prueba.webm" style={{ fontSize: 12, color: "#6cf" }}>
              descargar
            </a>
          )}
        </div>
      </div>

      <pre style={{ fontSize: 11, whiteSpace: "pre-wrap", marginTop: 12, maxHeight: 300, overflow: "auto" }}>{logs.join("\n")}</pre>
    </div>
  );
}
