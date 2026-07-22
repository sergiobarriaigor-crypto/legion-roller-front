import { apiGet, apiPost, apiDelete } from "@/lib/api";

export interface UltimoMensaje {
  autorNombre: string;
  texto: string;
  createdAt: string;
}

export interface ResumenSala {
  sala: string;
  ultimoMensaje: UltimoMensaje | null;
  noLeidos: number;
}

export interface ConversacionIndividual extends ResumenSala {
  otroMiembroId: number;
  otroNombre: string;
  otroFotoUrl: string | null;
  otroEnLinea: boolean;
}

export interface Conversaciones {
  grupal: ResumenSala;
  individuales: ConversacionIndividual[];
}

export type TipoAdjuntoMensaje = "foto" | "ubicacion" | "ruta";

export interface RespuestaCitada {
  texto: string;
  autorNombre: string;
}

export interface ReaccionMensaje {
  miembroId: number;
  emoji: string;
}

export interface MensajeChat {
  id: number;
  sala: string;
  autorId: number;
  autorNombre: string;
  autorFotoUrl: string | null;
  texto: string;
  referenciaTipo: string | null;
  referenciaId: number | null;
  createdAt: string;
  respuestaAId: number | null;
  respuestaA: RespuestaCitada | null;
  reenviado: boolean;
  adjuntoTipo: TipoAdjuntoMensaje | null;
  adjuntoUrl: string | null;
  adjuntoUbicacionNombre: string | null;
  adjuntoUbicacionLat: number | null;
  adjuntoUbicacionLon: number | null;
  adjuntoRutaDistanciaKm: number | null;
  adjuntoRutaDuracionSeg: number | null;
  adjuntoRutaPuntos: string | null;
  reacciones: ReaccionMensaje[];
}

// Estado combinado para el encabezado del chat 1 a 1 (GET /chat/estado/:id).
export interface EstadoMiembro {
  patinando: "patinando" | "ruta" | null;
  enLinea: boolean;
  ultimaConexion: string | null;
}

// Payloads de los eventos de socket (ver chat.gateway.ts en el backend).
export interface EventoPresencia {
  miembroId: number;
  enLinea: boolean;
  ultimaConexion: string | null;
}

export interface EventoEscribiendo {
  sala: string;
  miembroId: number;
  nombre: string;
  escribiendo: boolean;
}

export interface EventoLectura {
  sala: string;
  miembroId: number;
  hasta: string;
}

export interface EventoReaccion {
  mensajeId: number;
  sala: string;
  miembroId: number;
  emoji: string | null;
}

export interface EventoMensajeEliminado {
  mensajeId: number;
  sala: string;
}

export interface MiembroSimple {
  id: number;
  nombre: string;
  fotoUrl?: string | null;
}

// Notificación para la campana: alguien me compartió un post o una ficha de
// emprendedor por chat y todavía no vi ese mensaje.
export interface CompartidoSinLeer {
  mensajeId: number;
  sala: string;
  tipo: "post" | "emprendedor";
  referenciaId: number;
  autorNombre: string;
  autorFotoUrl: string | null;
  createdAt: string;
}

export function salaIndividual(id1: number, id2: number): string {
  const [a, b] = [id1, id2].sort((x, y) => x - y);
  return `dm-${a}-${b}`;
}

export function listarCompartidosSinLeer(token: string | null) {
  return apiGet<CompartidoSinLeer[]>("/chat/notificaciones/compartidos", token);
}

export function listarMensajes(sala: string, token: string | null) {
  return apiGet<MensajeChat[]>(`/chat/mensajes/${sala}`, token);
}

export interface EnviarMensajeBody {
  texto?: string;
  referenciaTipo?: string;
  referenciaId?: number;
  respuestaAId?: number;
  adjuntoTipo?: TipoAdjuntoMensaje;
  adjuntoUrl?: string;
  adjuntoUbicacionNombre?: string;
  adjuntoUbicacionLat?: number;
  adjuntoUbicacionLon?: number;
  adjuntoRutaDistanciaKm?: number;
  adjuntoRutaDuracionSeg?: number;
  adjuntoRutaPuntos?: string;
}

export function enviarMensaje(sala: string, body: EnviarMensajeBody, token: string | null) {
  return apiPost<MensajeChat>(`/chat/mensajes/${sala}`, body, token);
}

export function marcarLeido(sala: string, token: string | null) {
  return apiPost<{ ok: true }>(`/chat/mensajes/${sala}/marcar-leido`, {}, token);
}

export function eliminarMensaje(
  mensajeId: number,
  modo: "todos" | "mi",
  token: string | null,
) {
  return apiDelete<{ ok: true }>(`/chat/mensajes/${mensajeId}?modo=${modo}`, token);
}

export function reaccionarMensaje(mensajeId: number, emoji: string, token: string | null) {
  return apiPost<{ emoji: string | null }>(`/chat/mensajes/${mensajeId}/reaccion`, { emoji }, token);
}

export function reenviarMensaje(
  mensajeId: number,
  destinatarioIds: number[],
  token: string | null,
) {
  return apiPost<{ reenviadoA: number }>(
    `/chat/mensajes/${mensajeId}/reenviar`,
    { destinatarioIds },
    token,
  );
}

export function estadoDeMiembro(miembroId: number, token: string | null) {
  return apiGet<EstadoMiembro>(`/chat/estado/${miembroId}`, token);
}

export interface CursorLectura {
  miembroId: number;
  leidoHasta: string;
  entregadoHasta: string | null;
}

export function lecturaDeSala(sala: string, token: string | null) {
  return apiGet<CursorLectura[]>(`/chat/lectura/${sala}`, token);
}
