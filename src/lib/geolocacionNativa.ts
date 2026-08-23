import { Capacitor, registerPlugin } from "@capacitor/core";
import type { BackgroundGeolocationPlugin } from "@capacitor-community/background-geolocation";
import { PushNotifications } from "@capacitor/push-notifications";
import { Geolocation } from "@capacitor/geolocation";

// El paquete no exporta un objeto JS armado (solo tipos + código nativo
// Android/iOS) -- se registra a mano como indica su propia documentación.
// Se hace en el módulo (no dentro de la función) para no repetir el
// registro en cada llamado a iniciarSeguimientoUbicacion.
const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>("BackgroundGeolocation");

// Envuelve el seguimiento de ubicación para que funcione igual en la web
// (PWA, navegador normal) y en la app nativa empaquetada con Capacitor:
// - Web: sigue usando navigator.geolocation.watchPosition tal cual como
//   siempre -- ningún cambio de comportamiento para los usuarios actuales.
// - App nativa: usa @capacitor-community/background-geolocation, que sigue
//   entregando posiciones aunque la pantalla esté bloqueada (mediante un
//   servicio en primer plano con notificación persistente), resolviendo la
//   limitación conocida de la versión web.
// DIAGNÓSTICO TEMPORAL (auditoría GPS V2) -- time/speed/simulated se agregan
// acá para que grabacionGps.ts pueda loguearlos, SIN cambiar en nada la
// aceptación/guardado de puntos todavía (eso sigue usando solo lat/lon/
// accuracy, exactamente como hoy). `time` es la hora REAL en que el fix se
// produjo (epoch ms) -- antes se descartaba acá mismo y grabacionGps.ts
// sellaba Date.now() en su lugar. `speed` es la velocidad que calcula el
// propio chip GPS (m/s), no la nuestra por distancia/tiempo. `simulated`
// (solo tiene sentido en nativo -- BackgroundGeolocation.Location.simulated)
// es null en los caminos que no lo exponen (web, obtenerPosicionActual),
// nunca se inventa un valor.
export interface PosicionSimple {
  lat: number;
  lon: number;
  accuracy: number;
  time: number | null;
  speed: number | null;
  simulated: boolean | null;
}

export type DetenerSeguimiento = () => void;

// Mismo mensaje que ve el usuario en la notificación persistente de Android
// mientras el seguimiento está activo (obligatorio para el servicio en
// primer plano) -- se explica qué está pasando en vez de un texto genérico.
const TITULO_NOTIFICACION = "Legión Roller";
const MENSAJE_NOTIFICACION = "Registrando tu ubicación mientras patinás";

export function iniciarSeguimientoUbicacion(
  onPosicion: (p: PosicionSimple) => void,
  onError: () => void,
): DetenerSeguimiento {
  if (Capacitor.isNativePlatform()) {
    let idObservador: string | null = null;
    let cancelado = false;

    (async () => {
      // Android 13+ exige el permiso POST_NOTIFICATIONS aparte del de
      // ubicación para poder MOSTRAR la notificación persistente del
      // servicio en primer plano -- el plugin de background-geolocation la
      // declara en su manifiesto pero no la pide en tiempo de ejecución (es
      // responsabilidad de la app). Sin este pedido, el GPS en segundo
      // plano sigue funcionando pero la notificación queda invisible sin
      // ningún aviso de por qué (confirmado: ACCESS_FINE_LOCATION
      // concedido, POST_NOTIFICATIONS no). Se pide acá para no depender de
      // que el usuario haya tocado antes la campana de push.
      try {
        await PushNotifications.requestPermissions();
      } catch {
        // Si falla, no bloquea el seguimiento -- en el peor caso la
        // notificación no se ve pero el GPS sigue andando igual.
      }

      try {
        const id = await BackgroundGeolocation.addWatcher(
          {
            backgroundTitle: TITULO_NOTIFICACION,
            backgroundMessage: MENSAJE_NOTIFICACION,
            requestPermissions: true,
            distanceFilter: 0,
          },
          (posicion, error) => {
            if (error) {
              onError();
              return;
            }
            if (posicion) {
              onPosicion({
                lat: posicion.latitude,
                lon: posicion.longitude,
                accuracy: posicion.accuracy,
                time: posicion.time,
                speed: posicion.speed,
                simulated: posicion.simulated,
              });
            }
          },
        );
        if (cancelado) {
          BackgroundGeolocation.removeWatcher({ id });
        } else {
          idObservador = id;
        }
      } catch {
        onError();
      }
    })();

    return () => {
      cancelado = true;
      if (idObservador) BackgroundGeolocation.removeWatcher({ id: idObservador });
    };
  }

  if (!navigator.geolocation) {
    onError();
    return () => {};
  }

  const watchId = navigator.geolocation.watchPosition(
    (pos) => {
      onPosicion({
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        accuracy: pos.coords.accuracy ?? 0,
        time: pos.timestamp,
        speed: pos.coords.speed,
        // La Geolocation API del navegador no expone ningún equivalente a
        // "simulated"/mock provider -- null, no se inventa.
        simulated: null,
      });
    },
    () => onError(),
    { enableHighAccuracy: true, maximumAge: 5000 },
  );

  return () => navigator.geolocation.clearWatch(watchId);
}

// Posición puntual (no seguimiento continuo), usada al entrar al Mapa para
// centrar la cámara y al validar cercanía a una rodada antes de activar
// "Estoy en Ruta". En la app nativa, `navigator.geolocation.getCurrentPosition`
// depende del prompt de permisos propio del WebView (`onGeolocationPermissionsShowPrompt`),
// que en la práctica resultó poco confiable ahí -- se quedaba pidiendo la
// ubicación sin resolver nunca ni éxito ni error, ignorando el `timeout`.
// @capacitor/geolocation usa el proveedor de ubicación nativo de Android
// directo (ya estaba instalado como dependencia de background-geolocation
// pero sin usarse), evitando ese puente. En la web sigue exactamente igual
// que antes.
export async function obtenerPosicionActual(opciones?: {
  enableHighAccuracy?: boolean;
  timeout?: number;
}): Promise<PosicionSimple> {
  const enableHighAccuracy = opciones?.enableHighAccuracy ?? false;
  const timeout = opciones?.timeout ?? 10000;

  if (Capacitor.isNativePlatform()) {
    const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy, timeout });
    // @capacitor/geolocation no expone "simulated" (eso es propio de
    // BackgroundGeolocation.Location) -- null, no se inventa.
    return {
      lat: pos.coords.latitude,
      lon: pos.coords.longitude,
      accuracy: pos.coords.accuracy ?? 0,
      time: pos.timestamp,
      speed: pos.coords.speed,
      simulated: null,
    };
  }

  if (!navigator.geolocation) {
    throw new Error("Geolocalización no soportada");
  }
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracy: pos.coords.accuracy ?? 0,
          time: pos.timestamp,
          speed: pos.coords.speed,
          simulated: null,
        }),
      (err) => reject(err),
      { enableHighAccuracy, timeout },
    );
  });
}
