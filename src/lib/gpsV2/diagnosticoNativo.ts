// GPS V2 -- instrumentación diagnóstica (auditoría ruta 103). Envuelve
// DiagnosticoProveedorPlugin.java (plugin Capacitor LOCAL de esta app, ver
// frontend/android/app/src/main/java/com/legionroller/app/) -- consultas
// puntuales sobre callbacks nativos onLocationResult()/
// onLocationAvailability() y sobre pause/resume de MainActivity. NUNCA
// streaming, NUNCA una suscripción de ubicación nueva -- ver diseño
// acordado.
//
// Deliberadamente separado de disponibilidadUbicacion.ts
// (systemLocationEnabled, LocationManager.MODE_CHANGED_ACTION): esto es
// providerAvailability, una señal distinta de Android
// (FusedLocationProviderClient.onLocationAvailability()) -- no deben
// mezclarse.
import { Capacitor, registerPlugin } from "@capacitor/core";
import type { DiagnosticoNativoV2 } from "./tipos";

interface DiagnosticoProveedorPlugin {
  obtenerDiagnosticoNativo(): Promise<DiagnosticoNativoV2>;
  resetDiagnosticoNativo(): Promise<void>;
  detenerHeartbeat(): Promise<void>;
}

const DiagnosticoProveedor = registerPlugin<DiagnosticoProveedorPlugin>("DiagnosticoProveedor");

const DIAGNOSTICO_VACIO: DiagnosticoNativoV2 = {
  total: 0,
  ultimoTimestamp: -1,
  maxIntervaloSeg: 0,
  huecosNativos: [],
  eventosDisponibilidadProveedor: [],
  eventosPauseResumeActivity: [],
  watchersActivos: 0,
  maxWatchersSimultaneos: 0,
  eventosWatchers: [],
  foregroundIntentos: 0,
  foregroundExitos: 0,
  foregroundErrores: [],
  threadsRequestUpdates: [],
  totalHeartbeats: 0,
  ultimoHeartbeatTimestamp: -1,
  maxIntervaloHeartbeatSeg: 0,
  huecosHeartbeat: [],
};

// Solo tiene efecto real en la app nativa Android -- en web no existe
// ninguna de estas señales; se devuelve un snapshot vacío sin romper nada
// (mismo criterio que disponibilidadUbicacion.ts).
export async function obtenerDiagnosticoNativo(): Promise<DiagnosticoNativoV2> {
  if (!Capacitor.isNativePlatform()) return DIAGNOSTICO_VACIO;
  try {
    return await DiagnosticoProveedor.obtenerDiagnosticoNativo();
  } catch {
    return DIAGNOSTICO_VACIO;
  }
}

// Debe completarse (awaited) ANTES de que pueda crearse el watcher real
// (BackgroundGeolocation.addWatcher) -- único caller legítimo:
// iniciarSesionDiagnosticoNativoV2() en gpsV2/index.ts, awaited a su vez
// desde grabacionGps.ts antes de iniciar el watcher. Nunca fire-and-forget:
// la garantía de orden depende de que el caller haga await de esto.
export async function resetDiagnosticoNativo(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await DiagnosticoProveedor.resetDiagnosticoNativo();
  } catch {
    // Si el reset falla (plugin no disponible por algún motivo), no debe
    // bloquear el arranque de la grabación real -- esto es instrumentación
    // diagnóstica, nunca puede impedir que V1/V2 funcionen.
  }
}

// Heartbeat (auditoría ruta 107, ver DiagnosticoHeartbeat.java) -- debe
// llamarse al terminar de verdad la grabación (detenerGrabacionGps), para
// que el heartbeat no siga tickeando y contamine la próxima ruta. El
// arranque no tiene una función propia acá: va incluido en
// resetDiagnosticoNativo() de arriba, en el mismo momento en que ya se
// resetea el resto de la sesión diagnóstica.
export async function detenerHeartbeatNativo(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await DiagnosticoProveedor.detenerHeartbeat();
  } catch {
    // Mismo criterio que arriba -- nunca debe bloquear el cierre real de la
    // grabación.
  }
}
