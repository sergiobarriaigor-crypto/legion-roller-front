import { io, type Socket } from "socket.io-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

let socket: Socket | null = null;
let tokenActual: string | null = null;

// Un solo socket por sesión de navegador, autenticado con el mismo JWT que ya
// usa el resto de la app. Si el token cambia (cambio de cuenta en la misma
// pestaña, ej. Admin -> Camila en las pruebas) hay que reconectar con el
// nuevo JWT — de lo contrario el socket viejo sigue autenticado como el
// usuario anterior indefinidamente, aunque siga "conectado".
//
// Importante: NO se chequea `socket.connected` acá — la conexión de
// socket.io siempre es asíncrona, así que un segundo llamador en el mismo
// ciclo de render vería `connected === false` mientras el primero todavía
// está conectando, y terminaría matando ese socket a medio conectar para
// crear uno nuevo (dos llamadores del mismo componente — useConversacion y
// la página — terminarían con dos sockets distintos, uno de ellos muerto).
// Reusar por token es suficiente: si de verdad se cae, socket.io reconecta solo.
export function obtenerSocket(token: string): Socket {
  if (socket && tokenActual === token) return socket;
  if (socket) socket.disconnect();
  tokenActual = token;
  socket = io(API_URL, { auth: { token }, transports: ["websocket"] });
  return socket;
}
