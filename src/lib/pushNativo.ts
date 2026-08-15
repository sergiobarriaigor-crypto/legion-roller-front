import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { apiPost, apiDelete } from "./api";

// Contraparte nativa de lib/push.ts (Web Push/VAPID). En la app Android
// empaquetada con Capacitor no existe Service Worker ni PushManager -- el
// registro pasa por Firebase Cloud Messaging vía @capacitor/push-notifications,
// que entrega el token FCM del dispositivo por el evento "registration". En
// la web esto no hace nada (Capacitor.isNativePlatform() es false), sigue
// usando lib/push.ts como siempre.
const CLAVE_ULTIMO_TOKEN = "legion-roller-token-push-nativo";

// Canal de Android usado por el backend (ver CANAL_ALERTAS en
// notificaciones-push.service.ts -- debe coincidir con este id). Un canal
// nuevo (no el que crea Capacitor/FCM por defecto) porque una vez que
// Android crea un canal, su importancia ya no se puede subir por código
// en dispositivos donde ya existía -- solo el usuario puede cambiarla a
// mano. Con importance 5 (máxima) y visibility 1 (pública) la notificación
// aparece emergente (heads-up) y con el contenido visible en la pantalla
// de bloqueo, no solo en la barra de notificaciones.
const CANAL_ALERTAS = "legion_alertas";

async function crearCanalAlertas(): Promise<void> {
  await PushNotifications.createChannel({
    id: CANAL_ALERTAS,
    name: "Alertas de Legión",
    description: "Mensajes, rodadas y novedades importantes",
    importance: 5,
    visibility: 1,
    vibration: true,
    lights: true,
  });
}

export function estaSuscritoNativo(): boolean {
  return Capacitor.isNativePlatform() && localStorage.getItem(CLAVE_ULTIMO_TOKEN) !== null;
}

export async function suscribirPushNativo(token: string | null): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;

  const permiso = await PushNotifications.requestPermissions();
  console.log("[push-nativo] permiso:", permiso.receive);
  if (permiso.receive !== "granted") return false;

  await crearCanalAlertas();

  // Si esta función ya se llamó antes en esta misma sesión de la app (p.
  // ej. el usuario tocó la campanita más de una vez), hay que sacar los
  // oyentes viejos antes de agregar los nuevos -- si no, cada "registration"
  // futuro dispara todos los oyentes acumulados a la vez.
  await PushNotifications.removeAllListeners();

  return new Promise((resolve) => {
    PushNotifications.addListener("registration", async (resultado) => {
      console.log("[push-nativo] token FCM recibido:", resultado.value.slice(0, 12) + "...");
      localStorage.setItem(CLAVE_ULTIMO_TOKEN, resultado.value);
      try {
        await apiPost("/notificaciones-push/token-nativo", { token: resultado.value }, token);
        console.log("[push-nativo] token enviado al backend OK");
      } catch (e) {
        console.error("[push-nativo] fallo enviando token al backend:", e);
      }
      resolve(true);
    });
    PushNotifications.addListener("registrationError", (error) => {
      console.error("[push-nativo] registrationError:", JSON.stringify(error));
      resolve(false);
    });
    console.log("[push-nativo] llamando PushNotifications.register()");
    PushNotifications.register();
  });
}

export async function desuscribirPushNativo(token: string | null): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const ultimoToken = localStorage.getItem(CLAVE_ULTIMO_TOKEN);
  await PushNotifications.unregister();
  if (ultimoToken) {
    localStorage.removeItem(CLAVE_ULTIMO_TOKEN);
    await apiDelete(`/notificaciones-push/token-nativo?token=${encodeURIComponent(ultimoToken)}`, token);
  }
}
