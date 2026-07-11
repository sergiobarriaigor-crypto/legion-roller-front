import { io, type Socket } from "socket.io-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

let socket: Socket | null = null;

// Un solo socket por sesión de navegador, autenticado con el mismo JWT que ya
// usa el resto de la app. Hoy solo lo usan los mensajes/reacciones flotantes
// de Historias (efímeros: no hay persistencia, solo retransmisión en vivo).
export function obtenerSocket(token: string): Socket {
  if (socket && socket.connected) return socket;
  if (socket) socket.disconnect();
  socket = io(API_URL, { auth: { token }, transports: ["websocket"] });
  return socket;
}
