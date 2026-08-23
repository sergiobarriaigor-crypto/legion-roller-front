// V2 -- Etapa final: única puerta pública del motor V2 hacia el resto de
// la app. Orquesta exactamente la misma secuencia ya validada en
// /debug-video-v2 (grabarFase4: elegirGrillaAncha -> construirRutaCoreografiaV2
// -> calcularVentanaCrossfade -> calcularDuracionSeguimientoV2 ->
// construirCoberturaGrillaAnchaV2 -> construirTrayectoriaV2 ->
// calcularPresupuestoZ17Bytes -> determinarVentanaEfectivaZ17 ->
// construirCoberturaGrillaAnchaFase3 -> planificarSegmentosZ17 ->
// construirDatosEstadisticasV2 -> grabarVideoV2), con los datos reales del
// recorrido en vez de las rutas/fotos/música de prueba de ese laboratorio.
// El llamador (CompartirRecorridoModal.tsx) no necesita conocer tiles,
// trayectoria, segmentación, cámara ni MediaRecorder -- solo pasa `datos`
// (el mismo DatosTarjetaRecorrido que ya usa V1) y las opciones reales que
// el usuario ya elige hoy (fotos, música). No se importa ni se modifica
// nada de /debug-video-v2 -- ese archivo sigue siendo solo un laboratorio.
import type { DatosTarjetaRecorrido } from "../tarjetaRecorrido";
import { reverseGeocodificarEspecifico } from "../geocodificacion";
import { elegirGrillaAncha } from "./grillaAncha";
import {
  ANCHO_VIDEO,
  ALTO_VIDEO,
  calcularVentanaCrossfade,
  construirRutaCoreografiaV2,
  construirCoberturaGrillaAnchaV2,
  calcularDuracionSeguimientoV2,
  type ParametrosCoreografiaV2,
} from "./camaraV2";
import { construirTrayectoriaV2 } from "./trayectoriaV2";
import {
  BYTES_POR_TILE,
  PRESUPUESTO_TOTAL_BYTES_DEFECTO,
  FRACCION_MAX_UN_FRAME_DEFECTO,
  calcularPresupuestoZ17Bytes,
  determinarVentanaEfectivaZ17,
  construirCoberturaGrillaAnchaFase3,
  planificarSegmentosZ17,
} from "./segmentacionZ17";
import { construirDatosEstadisticasV2 } from "./overlayFase5";
import { grabarVideoV2 } from "./grabacionV2";

const FPS_V2 = 24;
const CONCURRENCIA_V2 = 6;
// Coreografía -- mismos valores por defecto ya validados y congelados en
// /debug-video-v2 (ver camaraV2.ts/grabacionV2.ts, Fases 1-6B). La UI real
// de "Compartir recorrido" no expone (ni debe exponer) ningún control de
// duración/paneo -- eso quedó únicamente en el laboratorio de debug para
// las pruebas de esta integración.
const PARAMS_DEFECTO_V2: Omit<ParametrosCoreografiaV2, "duracionSeguimientoSeg"> = {
  duracionPanoramicaInicialSeg: 0.8,
  duracionPaneoAcercamientoSeg: 3.2,
  duracionAlejamientoPaneoSeg: 3.2,
  // Panorámica final: cámara SIEMPRE fija (sin zoom/paneo) -- dos momentos
  // sin mover la cámara: trazado+calles+velocidad máxima (~2.8s), fundido
  // corto, estadísticas generales (~2.7s). Ver overlayFase5.ts/overlayFase6.ts
  // (FRAC_BEAT_A_FIN/FRAC_FUNDIDO_FIN) para el corte exacto.
  duracionPanoramicaFinalSeg: 5.5,
  finPaneoFraccion: 0.7,
  inicioZoomFraccion: 0.55,
};

export type EtapaVideoRecorridoV2 = "preparando" | "generando" | "finalizando";

export interface OpcionesVideoRecorridoV2 {
  fotoFinalDataUrl?: string;
  fotosPinDataUrl?: string[];
  musicaUrl?: string;
  musicaInicioSeg?: number;
  onEtapa?: (etapa: EtapaVideoRecorridoV2) => void;
}

export interface ResultadoVideoRecorridoV2 {
  blob: Blob;
  mimeType: string;
}

// Única consulta externa nueva de todo este módulo: el nombre de calle/
// sector del punto real de velocidad máxima (geocodificacion.ts no expone
// cancelación propia -- este timeout es solo para no depender de que
// Nominatim responda; la petición igual puede seguir en curso de fondo,
// pero la generación del video nunca espera más que esto). Cualquier falla
// o demora deja `null` -- el llamador ya sabe mostrar "VELOCIDAD MÁXIMA"
// genérico en ese caso (ver overlayFase6.ts).
const TIMEOUT_GEOCODE_VELMAX_MS = 3000;

async function nombreCalleVelMaxConTimeout(lat: number, lon: number): Promise<string | null> {
  try {
    return await Promise.race([
      reverseGeocodificarEspecifico(lat, lon),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), TIMEOUT_GEOCODE_VELMAX_MS)),
    ]);
  } catch {
    return null;
  }
}

export async function generarVideoRecorridoV2(
  datos: DatosTarjetaRecorrido,
  opciones: OpcionesVideoRecorridoV2 = {},
): Promise<ResultadoVideoRecorridoV2> {
  const { fotoFinalDataUrl, fotosPinDataUrl, musicaUrl, musicaInicioSeg, onEtapa } = opciones;

  onEtapa?.("preparando");

  const rutaGps = datos.puntos;
  const grillaAncha = elegirGrillaAncha(rutaGps, ANCHO_VIDEO, ALTO_VIDEO);
  const ruta = construirRutaCoreografiaV2(rutaGps, grillaAncha);
  const ventana = calcularVentanaCrossfade(grillaAncha.zoom);
  const duracionSeguimientoAuto = calcularDuracionSeguimientoV2(ruta.distanciaTotalKm);
  const params: ParametrosCoreografiaV2 = { ...PARAMS_DEFECTO_V2, duracionSeguimientoSeg: duracionSeguimientoAuto };

  const datosEstadisticas = construirDatosEstadisticasV2(rutaGps, ruta.distanciaTotalKm);

  // Único punto donde se geocodifica algo nuevo en todo este módulo: el
  // nombre de calle/sector del punto real de velocidad máxima. Las 3
  // etiquetas de sectoresRuta NO se geocodifican acá -- ya vienen resueltas
  // en `datos` desde MisRutasPanel.tsx. Nunca bloquea ni interrumpe la
  // generación (timeout + try/catch ya resueltos en la función).
  const puntoVelMaxGps = datosEstadisticas.indiceVelMax >= 0 ? rutaGps[datosEstadisticas.indiceVelMax] : null;
  const nombreCalleVelMax = puntoVelMaxGps ? await nombreCalleVelMaxConTimeout(puntoVelMaxGps.lat, puntoVelMaxGps.lon) : null;

  const coberturaAnchaFase2 = construirCoberturaGrillaAnchaV2(ruta, ventana, params, ventana.factorAncho);
  const clavesAnchaFase2 = new Set([...grillaAncha.claves, ...coberturaAnchaFase2]);

  const trayectoria = construirTrayectoriaV2(ruta, params, FPS_V2);

  const presupuestoZ17Bytes = calcularPresupuestoZ17Bytes(
    PRESUPUESTO_TOTAL_BYTES_DEFECTO,
    clavesAnchaFase2.size * BYTES_POR_TILE,
    CONCURRENCIA_V2,
  );

  const ventanaEfectiva = determinarVentanaEfectivaZ17(trayectoria, presupuestoZ17Bytes, FRACCION_MAX_UN_FRAME_DEFECTO);

  const coberturaAnchaFase3 = construirCoberturaGrillaAnchaFase3(trayectoria, ventanaEfectiva, ventana.factorAncho);
  const clavesAnchaFinal = new Set([...clavesAnchaFase2, ...coberturaAnchaFase3]);

  const segmentos = planificarSegmentosZ17(trayectoria, ventanaEfectiva, presupuestoZ17Bytes);

  const canvas = document.createElement("canvas");

  // Progreso simple (Preparando/Generando/Finalizando), inferido desde
  // AFUERA del motor -- sin agregar ningún onProgreso frame-a-frame dentro
  // de grabacionV2.ts (motor congelado). Se apoya en dos líneas de log que
  // el motor YA emite hoy sin cambios: "start() frameActual=0/..." marca el
  // instante real en que arranca la grabación (fin de "preparando"), y
  // cada "resume() confirmado..." marca el fin de una pausa entre
  // segmentos -- cuando ya se vieron tantos resumes como segmentos-1, no
  // queda ningún corte de tiles por delante y el video está por terminar
  // (aproximación razonable de "finalizando", sin depender de un timer). En
  // rutas de un solo segmento (sin pausas) simplemente no hay una etapa
  // "finalizando" separada -- se mantiene "generando" hasta el final.
  let seIniciaronGrabacion = false;
  let resumesVistos = 0;
  const logGrabacion = (linea: string) => {
    if (!seIniciaronGrabacion && linea.startsWith("[v2-grabacion] start() frameActual=0/")) {
      seIniciaronGrabacion = true;
      onEtapa?.("generando");
    }
    if (linea.startsWith("[v2-grabacion] resume() confirmado")) {
      resumesVistos++;
      if (resumesVistos === segmentos.length - 1) onEtapa?.("finalizando");
    }
  };

  const resultado = await grabarVideoV2(
    {
      ventana,
      ventanaEfectiva,
      trayectoria,
      segmentos,
      clavesAnchaFinal,
      zoomAncho: grillaAncha.zoom,
      fps: FPS_V2,
      canvas,
      ruta,
      params,
      datosEstadisticas,
      sectoresRuta: datos.sectoresRuta,
      nombreCalleVelMax,
      fotosRutaUrls: fotosPinDataUrl ?? [],
      fotoCierreUrl: fotoFinalDataUrl,
      ciudad: datos.ciudad,
      musicaUrl,
      musicaInicioSeg,
    },
    logGrabacion,
  );

  return { blob: resultado.blob, mimeType: resultado.mimeType };
}
