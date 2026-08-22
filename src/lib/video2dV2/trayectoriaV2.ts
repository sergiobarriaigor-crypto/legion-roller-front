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
}

export function construirTrayectoriaV2(
  ruta: RutaCoreografiaV2,
  params: ParametrosCoreografiaV2,
  fps: number,
  puntoVelMax: { x: number; y: number } | null = null,
): FrameV2[] {
  const totalFrames = Math.max(1, Math.round(duracionTotalV2(params) * fps));
  const estado = crearEstadoRecursivoV2();
  const frames: FrameV2[] = [];
  for (let i = 0; i < totalFrames; i++) {
    const tiempoSeg = i / fps;
    const { fase, camara } = calcularFaseYCamaraV2(ruta, params, tiempoSeg, estado, "incremental", puntoVelMax);
    frames.push({ indice: i, tiempoSeg, fase, camara });
  }
  return frames;
}
