// V2 -- Fase 3: trayectoria de cámara precomputada, frame por frame.
//
// No modifica camaraV2.ts -- consume calcularFaseYCamaraV2 exactamente como
// ya lo hace el loop en vivo de /debug-video-v2 (modo "incremental", un solo
// EstadoRecursivoSeguimientoV2 mutado en orden creciente). La diferencia es
// que acá se corre UNA vez, completo, antes de tocar cualquier cosa de red o
// de MediaRecorder -- el resultado (`FrameV2[]`) pasa a ser la única fuente
// de verdad tanto para planificar qué tiles hacen falta como para dibujar
// cada cuadro durante la grabación real (Fase 3, siguiente etapa). Pausar/
// reanudar MediaRecorder nunca vuelve a tocar la cámara: el cuadro `i` es
// siempre `trayectoria[i]`, sin importar cuántas pausas hubo antes.
import {
  calcularFaseYCamaraV2,
  crearEstadoRecursivoV2,
  duracionTotalV2,
  type EstadoCamaraV2,
  type FaseV2,
  type ParametrosCoreografiaV2,
  type RutaCoreografiaV2,
} from "./camaraV2";

export interface FrameV2 {
  indice: number;
  tiempoSeg: number;
  fase: FaseV2;
  camara: EstadoCamaraV2;
  // Segundos transcurridos desde que arrancó la pausa de velocidad máxima
  // EN ESTE CUADRO (0 en el primer cuadro congelado), o null si este
  // cuadro no forma parte de esa pausa. Ver DURACION_PAUSA_VELMAX_SEG más
  // abajo -- es el único campo nuevo de FrameV2, pensado exclusivamente
  // para que overlayFase6.ts pueda animar la entrada (fade+scale) de la
  // etiqueta sin recalcular nada de tiempo/distancia: durante la pausa,
  // tiempoSeg/fase/camara quedan IDÉNTICOS en todos los cuadros repetidos
  // (ver más abajo), así que ningún otro consumidor (trazado, marcador,
  // estadísticas, fotos, cámara) necesita saber que la pausa existe.
  pausaVelMax: number | null;
}

// Duración real (segundos de reloj, no "tiempoSeg" lógico) de la pausa al
// alcanzar la velocidad máxima -- se logra insertando este mismo cuadro
// repetido `Math.round(DURACION_PAUSA_VELMAX_SEG*fps)` veces en el array ya
// precomputado, nunca deteniendo MediaRecorder ni la música (esas siguen
// su propio reloj real sin cambios). Como los cuadros repetidos comparten
// tiempoSeg/fase/camara con el cuadro que los originó, el resto del motor
// (cámara, trazado, marcador, fotos, estadísticas, Z17/segmentación) los
// trata exactamente igual que un instante inmóvil cualquiera -- cero
// cambios en camaraV2.ts/segmentacionZ17.ts/overlayFase5.ts (salvo la
// etiqueta nueva).
export const DURACION_PAUSA_VELMAX_SEG = 1.3;

export function construirTrayectoriaV2(
  ruta: RutaCoreografiaV2,
  params: ParametrosCoreografiaV2,
  fps: number,
  indiceVelMax?: number,
): FrameV2[] {
  const totalFrames = Math.max(1, Math.round(duracionTotalV2(params) * fps));
  const estado = crearEstadoRecursivoV2();
  const frames: FrameV2[] = [];

  // Fracción de trazado (0..1, relativa SOLO al tramo de seguimiento) en la
  // que ocurre el evento real de velocidad máxima -- si no hay un tramo
  // confiable (indiceVelMax ausente/-1) o cae exactamente en el arranque o
  // el final del trazado (no tiene sentido "pausar" un extremo), la pausa
  // queda desactivada sin romper nada (mismo criterio que puntoVelMax en
  // versiones anteriores de esta coreografía).
  let fraccionPausa = -1;
  if (indiceVelMax !== undefined && indiceVelMax >= 0 && indiceVelMax < ruta.distanciaAcumuladaKm.length && ruta.distanciaTotalKm > 0) {
    const f = ruta.distanciaAcumuladaKm[indiceVelMax] / ruta.distanciaTotalKm;
    if (f > 0 && f < 1) fraccionPausa = f;
  }
  const framesPausa = fraccionPausa >= 0 ? Math.round(DURACION_PAUSA_VELMAX_SEG * fps) : 0;
  let pausaInsertada = false;

  let indice = 0;
  for (let i = 0; i < totalFrames; i++) {
    const tiempoSeg = i / fps;
    const resultado = calcularFaseYCamaraV2(ruta, params, tiempoSeg, estado, "incremental");
    frames.push({ indice: indice++, tiempoSeg, fase: resultado.fase, camara: resultado.camara, pausaVelMax: null });

    if (
      !pausaInsertada &&
      framesPausa > 0 &&
      resultado.fase === "seguimiento" &&
      (resultado.fraccionTrazo ?? -1) >= fraccionPausa
    ) {
      for (let p = 0; p < framesPausa; p++) {
        frames.push({
          indice: indice++,
          tiempoSeg,
          fase: resultado.fase,
          camara: resultado.camara,
          pausaVelMax: p / fps,
        });
      }
      pausaInsertada = true;
    }
  }
  return frames;
}
