// Fase 1 de la corrección de producción (auditoría ruta 107/108, ver
// GrabacionWakeLock.java) -- WakeLock parcial sostenido exclusivamente
// durante una grabación GPS activa, para evitar que el sistema/OEM
// suspenda la CPU (y con ella el HandlerThread "CapacitorPlugins", que usa
// tanto el watcher real como el heartbeat diagnóstico) mientras la app está
// en segundo plano. No mantiene la pantalla encendida.
//
// Deliberadamente separado de disponibilidadUbicacion.ts y
// diagnosticoNativo.ts: esto no es una señal, es un recurso del sistema que
// se adquiere/libera -- misma separación de responsabilidades ya usada en
// todo este módulo.
import { Capacitor, registerPlugin } from "@capacitor/core";

interface GrabacionRecursosPlugin {
  adquirirWakeLock(): Promise<void>;
  liberarWakeLock(): Promise<void>;
}

const GrabacionRecursos = registerPlugin<GrabacionRecursosPlugin>("GrabacionRecursos");

// Solo tiene efecto real en la app nativa Android -- en web no existe un
// equivalente, no-op. Único caller legítimo: iniciarGrabacionGps() en
// grabacionGps.ts, ANTES de crear el watcher real. Nunca debe poder
// bloquear ni impedir que el watcher real se cree: el WakeLock es una
// mitigación, nunca un requisito para que GPS V1/V2 funcionen.
export async function adquirirWakeLockNativo(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await GrabacionRecursos.adquirirWakeLock();
  } catch {
    // Si adquirir falla, la grabación sigue igual -- ver comentario arriba.
  }
}

// Debe llamarse al terminar de verdad la grabación (detenerGrabacionGps),
// para no dejar el WakeLock sostenido más allá de la ruta real.
export async function liberarWakeLockNativo(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await GrabacionRecursos.liberarWakeLock();
  } catch {
    // Mismo criterio que arriba -- nunca debe bloquear el cierre real de la
    // grabación.
  }
}
