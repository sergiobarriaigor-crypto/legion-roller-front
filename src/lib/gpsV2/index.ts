// GPS V2 -- FASE 1 (modo sombra, sin control real). API pública.
//
// IMPORTANTE (ajuste de arquitectura pedido explícitamente): V2 NO crea su
// propio watcher real. El único watcher GPS activo sigue siendo el de
// grabacionGps.ts (V1) -- este módulo solo expone `alimentarFixCrudoV2`,
// que V1 llama con CADA fix crudo que recibe, además de su propio
// procesamiento (sin alterarlo). Así V1 y V2 procesan exactamente la misma
// secuencia de fixes, sin dos watchers reales compitiendo por el GPS.
import { crearPipelineV2 } from "./pipeline";
import { aFixCrudoV2 } from "./watcher";
import type { PosicionSimple } from "../geolocacionNativa";
import type { DiscontinuidadV2, EstadoGpsV2, PuntoConfiableV2 } from "./tipos";

export type { DiscontinuidadV2, EstadoGpsV2, FixCrudoV2, PuntoConfiableV2, ResultadoProcesarFix } from "./tipos";
export { crearPipelineV2 } from "./pipeline";

export interface EstadoGrabacionGpsV2 {
  modo: "patinando" | "ruta";
  mapeado: boolean;
  puntos: PuntoConfiableV2[];
  estado: EstadoGpsV2;
  discontinuidades: DiscontinuidadV2[];
  // Cuántos fixes crudos le llegaron a V2 en esta grabación -- para poder
  // comparar contra V1 (Fase 2) y confirmar que el reparto desde el único
  // watcher real no pierde ni duplica ninguno.
  fixesRecibidos: number;
}

// FASE 2 -- comparación real V1 vs V2 (ver diseño acordado). A propósito NO
// es un log por-fix (eso fue lo que rompió el envío en la instrumentación
// vieja de V1 -- ver 413 "request entity too large"): solo `puntosConfiables`
// crece con la cantidad de fixes, y eso es del mismo orden que `puntos` de
// V1 (que ya viaja siempre sin problema). Todo lo demás son conteos o listas
// que solo crecen con EVENTOS poco frecuentes (huecos, cambios de
// trayectoria), nunca con cada fix.
export interface ResumenGpsV2 {
  fixesRecibidos: number;
  puntosConfiables: PuntoConfiableV2[];
  discontinuidades: DiscontinuidadV2[];
  entradasRecuperacion: { indiceFix: number; fixTime: number | null }[];
  candidatosPendientes: number;
  rechazados: { motivo: string; cantidad: number }[];
  // Instrumentación adicional (auditoría ruta 100) -- ninguno de los dos
  // cambia ningún criterio/umbral del pipeline, solo lo hacen visible:
  // cuántos fixes se clasificaron "ruido" (antes invisibles en el resumen:
  // fixesRecibidos - puntosConfiables - candidatosPendientes - rechazados
  // ya los incluía por eliminación, pero sin exponerlos directamente) y
  // cuál fue el mayor intervalo real entre dos fixes crudos consecutivos
  // recibidos por V2, medido ANTES de cualquier filtro/estado del pipeline
  // (no espejea `ultimoFixRecibidoTime` de pipeline.ts a propósito: esa
  // variable queda congelada mientras el estado es RECUPERANDO, así que
  // espejearla reproduciría el mismo punto ciego que esto busca cerrar).
  ruido: number;
  maxIntervaloEntreFixesCrudosSeg: number;
}

const pipeline = crearPipelineV2();
let activoV2 = false;
let modoActualV2: "patinando" | "ruta" | null = null;
let mapeadoActualV2 = false;
let fixesRecibidosV2 = 0;
let candidatosPendientesV2 = 0;
let ruidoV2 = 0;
let ultimoFixCrudoTimeV2: number | null = null;
let maxIntervaloEntreFixesCrudosSegV2 = 0;
const entradasRecuperacionV2: { indiceFix: number; fixTime: number | null }[] = [];
const rechazadosV2 = new Map<string, number>();
let callbackPosicionConfiable: ((p: PuntoConfiableV2) => void) | null = null;
let callbackEstado: ((e: EstadoGpsV2) => void) | null = null;

function log(linea: string): void {
  console.log(`[gpsV2] ${linea}`);
}

// Llamado por grabacionGps.ts (V1) con CADA fix crudo que su propio watcher
// real recibe -- ver comentario de arriba. No hace nada si no hay una
// "grabación sombra" V2 activa (ej. si V1 arrancó antes de que este módulo
// se haya inicializado, caso borde que no debería darse en uso normal).
export function alimentarFixCrudoV2(pos: PosicionSimple): void {
  if (!activoV2) return;
  fixesRecibidosV2++;
  const indiceEsteFix = fixesRecibidosV2 - 1;

  // Intervalo real entre fixes crudos -- ANTES de tocar el pipeline (ver
  // comentario en ResumenGpsV2). Si `pos.time` es null no hay con qué medir
  // este fix en particular; no actualiza la referencia ni el máximo, pero
  // tampoco rompe nada (el pipeline lo va a rechazar por su cuenta, sin
  // cambios acá).
  if (pos.time !== null) {
    if (ultimoFixCrudoTimeV2 !== null) {
      const intervaloSeg = (pos.time - ultimoFixCrudoTimeV2) / 1000;
      if (intervaloSeg > maxIntervaloEntreFixesCrudosSegV2) {
        maxIntervaloEntreFixesCrudosSegV2 = intervaloSeg;
      }
    }
    ultimoFixCrudoTimeV2 = pos.time;
  }

  const estadoAntes = pipeline.obtenerEstado();
  const resultado = pipeline.procesarFix(aFixCrudoV2(pos));
  if (resultado.tipo === "confiable") {
    callbackPosicionConfiable?.(resultado.punto);
  } else if (resultado.tipo === "candidato-pendiente") {
    candidatosPendientesV2++;
  } else if (resultado.tipo === "rechazado") {
    rechazadosV2.set(resultado.motivo, (rechazadosV2.get(resultado.motivo) ?? 0) + 1);
  } else if (resultado.tipo === "ruido") {
    ruidoV2++;
  }
  const estadoDespues = pipeline.obtenerEstado();
  if (estadoDespues !== estadoAntes) {
    callbackEstado?.(estadoDespues);
    if (estadoDespues === "RECUPERANDO") {
      entradasRecuperacionV2.push({ indiceFix: indiceEsteFix, fixTime: pos.time });
    }
  }
}

// Idempotente, igual criterio que V1: si ya hay una grabación V2 en curso,
// no reinicia nada.
export function iniciarPipelineV2(modo: "patinando" | "ruta", mapeado: boolean): void {
  if (activoV2) {
    log("iniciarPipelineV2: ya había una grabación V2 en curso -- se reutiliza");
    return;
  }
  modoActualV2 = modo;
  mapeadoActualV2 = mapeado;
  fixesRecibidosV2 = 0;
  candidatosPendientesV2 = 0;
  ruidoV2 = 0;
  ultimoFixCrudoTimeV2 = null;
  maxIntervaloEntreFixesCrudosSegV2 = 0;
  entradasRecuperacionV2.length = 0;
  rechazadosV2.clear();
  pipeline.iniciar();
  activoV2 = true;
  log("pipeline V2 iniciado (Fase 1 -- modo sombra, alimentado por el watcher de V1)");
}

export function detenerPipelineV2(): PuntoConfiableV2[] {
  const finales = pipeline.finalizar();
  activoV2 = false;
  modoActualV2 = null;
  callbackPosicionConfiable = null;
  callbackEstado = null;
  log("pipeline V2 detenido");
  return finales;
}

export function hayGrabacionActivaV2(): boolean {
  return activoV2;
}

export function obtenerGrabacionActivaV2(): EstadoGrabacionGpsV2 | null {
  if (!modoActualV2) return null;
  return {
    modo: modoActualV2,
    mapeado: mapeadoActualV2,
    puntos: pipeline.obtenerPuntosConfiables(),
    estado: pipeline.obtenerEstado(),
    discontinuidades: pipeline.obtenerDiscontinuidades(),
    fixesRecibidos: fixesRecibidosV2,
  };
}

export function registrarCallbackPosicionConfiableV2(cb: ((p: PuntoConfiableV2) => void) | null): void {
  callbackPosicionConfiable = cb;
}

export function registrarCallbackEstadoV2(cb: ((e: EstadoGpsV2) => void) | null): void {
  callbackEstado = cb;
}

// Fase 2 -- arma el resumen de comparación V1 vs V2 a partir de lo acumulado
// durante la grabación. Se llama ANTES de `detenerPipelineV2()` (que borra
// el estado del pipeline), igual que ya se hace hoy con los snapshots de
// `diagnosticoGps`/`diagnosticoFlujo` de V1.
export function obtenerResumenGpsV2(): ResumenGpsV2 {
  return {
    fixesRecibidos: fixesRecibidosV2,
    puntosConfiables: pipeline.obtenerPuntosConfiables(),
    discontinuidades: pipeline.obtenerDiscontinuidades(),
    entradasRecuperacion: [...entradasRecuperacionV2],
    candidatosPendientes: candidatosPendientesV2,
    rechazados: Array.from(rechazadosV2.entries()).map(([motivo, cantidad]) => ({ motivo, cantidad })),
    ruido: ruidoV2,
    maxIntervaloEntreFixesCrudosSeg: maxIntervaloEntreFixesCrudosSegV2,
  };
}
