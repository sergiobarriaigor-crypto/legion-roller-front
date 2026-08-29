// Envuelve DisponibilidadUbicacionPlugin.java (plugin Capacitor LOCAL de esta
// app, ver frontend/android/app/src/main/java/com/legionroller/app/) -- la
// señal real e independiente de cualquier watcher de que Android encendió o
// apagó Ubicación (LocationManager.MODE_CHANGED_ACTION), que motivó este
// módulo (ver diagnóstico ruta 102: el plugin de background-geolocation NO
// propaga esto a JS, así que el watcher real seguía entregando fixes en
// caché/derivados con Ubicación apagada).
//
// Deliberadamente NO decide nada por su cuenta -- solo informa. Quien decide
// qué hacer con el cambio de disponibilidad es GPS V2
// (informarDisponibilidadUbicacionV2 en gpsV2/index.ts), llamado por
// grabacionGps.ts, único dueño del ciclo de vida de esta suscripción (igual
// que ya es dueño del watcher real).
import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";

interface DisponibilidadUbicacionPlugin {
  estaDisponible(): Promise<{ disponible: boolean }>;
  addListener(
    eventName: "cambioDisponibilidad",
    listenerFunc: (datos: { disponible: boolean }) => void,
  ): Promise<PluginListenerHandle>;
}

const DisponibilidadUbicacion = registerPlugin<DisponibilidadUbicacionPlugin>("DisponibilidadUbicacion");

export type DetenerSuscripcionDisponibilidad = () => void;

// Solo tiene efecto real en la app nativa Android -- en web no existe una
// señal de sistema equivalente, así que ahí `onCambio` nunca se llama y se
// devuelve un "detener" vacío. GPS V2 sigue funcionando exactamente igual
// que hoy en web (fuenteUbicacionDisponibleV2 nunca se toca).
export function suscribirDisponibilidadUbicacion(
  onCambio: (disponible: boolean) => void,
): DetenerSuscripcionDisponibilidad {
  if (!Capacitor.isNativePlatform()) {
    return () => {};
  }

  let cancelado = false;
  let handle: PluginListenerHandle | null = null;

  (async () => {
    // Estado actual al momento de suscribirse -- cubre el caso borde de que
    // Ubicación ya estuviera apagada ANTES de arrancar la grabación (sin
    // esto, GPS V2 nunca se enteraría hasta el próximo cambio real, que
    // podría no llegar nunca si el usuario no vuelve a tocar el switch).
    try {
      const estadoInicial = await DisponibilidadUbicacion.estaDisponible();
      if (!cancelado) onCambio(estadoInicial.disponible);
    } catch {
      // Si falla la consulta inicial, no bloquea nada -- el próximo cambio
      // real de estado (si llega) lo corrige mediante el listener de abajo.
    }

    try {
      const h = await DisponibilidadUbicacion.addListener("cambioDisponibilidad", (datos) => {
        onCambio(datos.disponible);
      });
      if (cancelado) {
        h.remove();
      } else {
        handle = h;
      }
    } catch {
      // Sin listener nativo no hay forma de detectar cambios -- GPS V2 sigue
      // funcionando en modo normal, simplemente sin esta protección extra.
    }
  })();

  return () => {
    cancelado = true;
    if (handle) handle.remove();
  };
}
