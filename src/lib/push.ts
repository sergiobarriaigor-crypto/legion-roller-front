import { apiPost, apiDelete } from "./api";

// Push directo a los propios dispositivos suscritos — para avisos que deben
// llegar aunque el celular tenga la pantalla apagada/esté en el bolsillo (el
// modal dentro de la app no sirve de nada si no la estás mirando).
export function notificarme(
  token: string | null,
  payload: { titulo: string; cuerpo: string; url?: string },
) {
  return apiPost("/notificaciones-push/notificarme", payload, token);
}

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

// La Push API pide la clave pública VAPID como Uint8Array (base64 URL-safe),
// no hay forma de pasarla como string directo a `applicationServerKey`.
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function pushDisponible(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export async function registrarServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!pushDisponible()) return null;
  return navigator.serviceWorker.register("/sw.js");
}

export async function estaSuscrito(): Promise<boolean> {
  if (!pushDisponible()) return false;
  const registro = await navigator.serviceWorker.getRegistration();
  if (!registro) return false;
  const suscripcion = await registro.pushManager.getSubscription();
  return suscripcion !== null;
}

export async function suscribirPush(token: string): Promise<boolean> {
  if (!pushDisponible()) return false;

  const permiso = await Notification.requestPermission();
  if (permiso !== "granted") return false;

  const registro = await registrarServiceWorker();
  if (!registro) return false;

  const suscripcion = await registro.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
  });

  const json = suscripcion.toJSON();
  await apiPost(
    "/notificaciones-push/suscripcion",
    { endpoint: json.endpoint, keys: json.keys },
    token,
  );
  return true;
}

export async function desuscribirPush(token: string): Promise<void> {
  if (!pushDisponible()) return;
  const registro = await navigator.serviceWorker.getRegistration();
  const suscripcion = await registro?.pushManager.getSubscription();
  if (!suscripcion) return;

  const endpoint = suscripcion.endpoint;
  await suscripcion.unsubscribe();
  await apiDelete(`/notificaciones-push/suscripcion?endpoint=${encodeURIComponent(endpoint)}`, token);
}
