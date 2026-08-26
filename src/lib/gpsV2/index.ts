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

const pipeline = crearPipelineV2();
let activoV2 = false;
let modoActualV2: "patinando" | "ruta" | null = null;
let mapeadoActualV2 = false;
let fixesRecibidosV2 = 0;
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
  const estadoAntes = pipeline.obtenerEstado();
  const resultado = pipeline.procesarFix(aFixCrudoV2(pos));
  if (resultado.tipo === "confiable") {
    callbackPosicionConfiable?.(resultado.punto);
  }
  const estadoDespues = pipeline.obtenerEstado();
  if (estadoDespues !== estadoAntes) {
    callbackEstado?.(estadoDespues);
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
