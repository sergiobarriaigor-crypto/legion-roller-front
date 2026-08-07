import { Capacitor, registerPlugin } from "@capacitor/core";
import type { BackgroundGeolocationPlugin } from "@capacitor-community/background-geolocation";

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
export interface PosicionSimple {
  lat: number;
  lon: number;
  accuracy: number;
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

    BackgroundGeolocation.addWatcher(
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
          });
        }
      },
    )
      .then((id) => {
        if (cancelado) {
          BackgroundGeolocation.removeWatcher({ id });
        } else {
          idObservador = id;
        }
      })
      .catch(() => onError());

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
      });
    },
    () => onError(),
    { enableHighAccuracy: true, maximumAge: 5000 },
  );

  return () => navigator.geolocation.clearWatch(watchId);
}
