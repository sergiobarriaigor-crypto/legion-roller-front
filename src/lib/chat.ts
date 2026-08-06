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

export type TipoAdjuntoMensaje =
  | "foto"
  | "ubicacion"
  | "ruta"
  | "video"
  | "archivo"
  | "audio"
  | "encuesta";

export interface RespuestaCitada {
  texto: string;
  autorNombre: string;
}

export interface ReaccionMensaje {
  miembroId: number;
  emoji: string;
}

// Encuesta: solo en el chat grupal, la pregunta es el propio texto del
// mensaje. miVotoOpcionId es null si el usuario actual todavía no votó.
// votantes/totalMiembros son visibles para cualquiera del grupal (encuesta
// no anónima, mismo criterio que WhatsApp/Telegram).
export interface VotanteEncuesta {
  id: number;
  nombre: string;
  fotoUrl: string | null;
}

export interface OpcionEncuesta {
  id: number;
  texto: string;
  votos: number;
  votantes: VotanteEncuesta[];
}

export interface EncuestaMensaje {
  id: number;
  anonima: boolean;
  opciones: OpcionEncuesta[];
  totalVotos: number;
  totalMiembros: number;
  miVotoOpcionId: number | null;
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
  adjuntoArchivoNombre: string | null;
  adjuntoArchivoTamanoKb: number | null;
  adjuntoAudioDuracionSeg: number | null;
  fijado: boolean;
  encuesta: EncuestaMensaje | null;
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

export interface EventoFijado {
  mensajeId: number;
  sala: string;
  fijado: boolean;
}

export interface EventoEncuesta {
  mensajeId: number;
  sala: string;
  opciones: OpcionEncuesta[];
  totalVotos: number;
  totalMiembros: number;
}

export interface MiembroSimple {
  id: number;
  nombre: string;
  fotoUrl?: string | null;
  // Ajuste: "legion" | "comunidad" | null — usado para agrupar visualmente
  // el selector de invitados del calendario (ver SelectorInvitadosActividad).
  categoria?: string | null;
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
  adjuntoArchivoNombre?: string;
  adjuntoArchivoTamanoKb?: number;
  adjuntoAudioDuracionSeg?: number;
}

export function enviarMensaje(sala: string, body: EnviarMensajeBody, token: string | null) {
  return apiPost<MensajeChat>(`/chat/mensajes/${sala}`, body, token);
}

export function marcarLeido(sala: string, token: string | null) {
  return apiPost<{ ok: true }>(`/chat/mensajes/${sala}/marcar-leido`, {}, token);
}

export function obtenerSilenciado(sala: string, token: string | null) {
  return apiGet<{ silenciado: boolean }>(`/chat/mensajes/${sala}/silenciar`, token);
}

export function actualizarSilenciado(sala: string, silenciado: boolean, token: string | null) {
  return apiPost<{ ok: true; silenciado: boolean }>(
    `/chat/mensajes/${sala}/silenciar`,
    { silenciado },
    token,
  );
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

// Mensaje fijado: en el grupal hasta 5, solo el admin global; en un DM hasta
// 1, cualquiera de los 2 participantes.
export interface MensajeFijado {
  id: number;
  texto: string;
  autorNombre: string;
  autorFotoUrl: string | null;
  createdAt: string;
  adjuntoTipo: TipoAdjuntoMensaje | null;
}

export function mensajesFijados(sala: string, token: string | null) {
  return apiGet<MensajeFijado[]>(`/chat/mensajes/${sala}/fijados`, token);
}

export function fijarMensaje(mensajeId: number, token: string | null) {
  return apiPost<{ fijado: boolean }>(`/chat/mensajes/${mensajeId}/fijar`, {}, token);
}

// Álbum: adjuntos ya enviados en la sala, agrupados por tipo (foto/video/archivo).
export interface AdjuntoAlbum {
  id: number;
  url: string | null;
  nombre: string | null;
  tamanoKb: number | null;
  createdAt: string;
  autorNombre: string;
}

export function adjuntosDeSala(
  sala: string,
  tipo: "foto" | "video" | "archivo",
  token: string | null,
) {
  return apiGet<AdjuntoAlbum[]>(`/chat/mensajes/${sala}/adjuntos?tipo=${tipo}`, token);
}

// Encuestas: solo disponibles en el chat grupal (validado en el backend).
// `anonima` la fija el autor al crearla y no cambia después.
export function crearEncuesta(
  sala: string,
  pregunta: string,
  opciones: string[],
  anonima: boolean,
  token: string | null,
) {
  return apiPost<MensajeChat>(
    `/chat/mensajes/${sala}/encuesta`,
    { pregunta, opciones, anonima },
    token,
  );
}

export function votarEncuesta(
  mensajeId: number,
  opcionId: number,
  token: string | null,
) {
  return apiPost<EncuestaMensaje>(
    `/chat/encuestas/${mensajeId}/votar`,
    { opcionId },
    token,
  );
}
