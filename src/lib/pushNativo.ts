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

export function estaSuscritoNativo(): boolean {
  return Capacitor.isNativePlatform() && localStorage.getItem(CLAVE_ULTIMO_TOKEN) !== null;
}

export async function suscribirPushNativo(token: string | null): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;

  const permiso = await PushNotifications.requestPermissions();
  console.log("[push-nativo] permiso:", permiso.receive);
  if (permiso.receive !== "granted") return false;

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
