import { apiDelete, apiGet, apiPost } from "@/lib/api";

// Mención de un integrante sobre la imagen — hasta MAX_MENCIONES_POR_HISTORIA
// (5) por historia, cada una con su propia posición y escala (arrastrable y
// pellizcable, igual dinámica que el texto pero sin rotación).
export interface MencionEnHistoria {
  miembroId: number;
  nombre: string;
  fotoUrl: string | null;
  x: number;
  y: number;
  escala: number;
  aceptada: boolean | null;
}

export const MAX_MENCIONES_POR_HISTORIA = 5;

// Distinto de un comentario: un Eco queda FIJO sobre la imagen para
// cualquiera que abra la historia (no solo quien la vea en vivo), sin hilo
// de respuestas ni reacciones propias.
export interface EcoEnHistoria {
  id: number;
  miembroId: number;
  nombre: string;
  fotoUrl: string | null;
  texto: string;
  createdAt: string;
}

export interface Historia {
  id: number;
  // Autor real (distinto del dueño del grupo cuando `compartida` es true).
  autorId: number;
  autorNombre: string;
  autorFotoUrl: string | null;
  // true cuando esta historia aparece bajo el avatar de alguien que la
  // acepto por ser mencionado — no la creó, solo aceptó que se re-agrupe
  // también bajo su nombre.
  compartida: boolean;
  tipo: "foto" | "video";
  mediaUrl: string;
  texto: string | null;
  textoEstilo: string | null;
  ubicacion: string | null;
  menciones: MencionEnHistoria[];
  mencionSinVer: boolean;
  reaccionesCount: number;
  miReaccion: boolean;
  comentariosCount: number;
  ecos: EcoEnHistoria[];
  createdAt: string;
}

export interface GrupoHistorias {
  autorId: number;
  autorNombre: string;
  autorFotoUrl: string | null;
  vistoCompleto: boolean;
  reaccionesSinLeer: boolean;
  historias: Historia[];
}

export interface ReaccionHistoriaDetalle {
  miembroId: number;
  nombre: string;
  fotoUrl: string | null;
  createdAt: string;
}

export interface ComentarioHistoriaDetalle {
  id: number;
  miembroId: number;
  nombre: string;
  fotoUrl: string | null;
  texto: string;
  respuestaAId: number | null;
  createdAt: string;
}

// Notificación para la campana: alguien respondió uno de mis comentarios, o
// dejó un comentario raíz en mi historia (misma metodología para ambos).
export interface RespuestaSinLeer {
  id: number;
  historiaId: number;
  autorNombre: string;
  autorFotoUrl: string | null;
  texto: string;
  createdAt: string;
  esRespuesta: boolean;
}

// Notificación agrupada para la campana: N personas reaccionaron con el
// corazón a la misma historia — se agrupan para no listar una fila por
// persona. `primeros` trae hasta 2 (las más recientes), con foto.
export interface ReaccionAgrupadaSinLeer {
  historiaId: number;
  total: number;
  primeros: { nombre: string; fotoUrl: string | null }[];
  createdAt: string;
}

export interface MencionInput {
  miembroId: number;
  x: number;
  y: number;
  escala?: number;
}

export interface CrearHistoriaInput {
  tipo: "foto" | "video";
  mediaUrl: string;
  texto?: string;
  textoEstilo?: string;
  ubicacion?: string;
  menciones?: MencionInput[];
}

// Posición/tamaño/rotación/tipografía/color/alineación/fondo del texto sobre
// la imagen — se guarda como JSON opaco en `textoEstilo` (el backend no lo
// interpreta). x/y son fracciones (0..1) del ancho/alto de la imagen, no
// píxeles absolutos, para que se vea igual sin importar el tamaño real de
// pantalla entre el editor y el visor.
export interface EstiloTextoHistoria {
  contenido: string;
  x: number;
  y: number;
  escala: number;
  rotacion: number;
  fuente: string;
  color: string;
  alineacion: "left" | "center" | "right";
  fondo: "ninguno" | "oscuro" | "claro";
}

export function serializarEstiloTexto(estilo: EstiloTextoHistoria): string {
  return JSON.stringify(estilo);
}

export function parsearEstiloTexto(json: string | null | undefined): EstiloTextoHistoria | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as EstiloTextoHistoria;
  } catch {
    return null;
  }
}

export function listarHistorias(token: string | null) {
  return apiGet<GrupoHistorias[]>("/historias", token);
}

export function crearHistoria(dto: CrearHistoriaInput, token: string | null) {
  return apiPost<Historia>("/historias", dto, token);
}

export function marcarVistaHistoria(id: number, token: string | null) {
  return apiPost<{ vista: boolean }>(`/historias/${id}/vista`, {}, token);
}

export function eliminarHistoria(id: number, token: string | null) {
  return apiDelete<{ mensaje: string }>(`/historias/${id}`, token);
}

// El "patín dorado" de Legión Roller, en vez del corazón de Instagram.
export function toggleReaccionHistoria(id: number, token: string | null) {
  return apiPost<{ reaccionesCount: number; miReaccion: boolean }>(
    `/historias/${id}/reaccion`,
    {},
    token,
  );
}

// Visible para cualquiera, como "a quién le gustó" en Posts.
export function listarReaccionesHistoria(id: number, token: string | null) {
  return apiGet<ReaccionHistoriaDetalle[]>(`/historias/${id}/reacciones`, token);
}

// Los mensajes flotantes se guardan además de retransmitirse en vivo — visibles
// para cualquiera, como los comentarios de un Post.
export function listarComentariosHistoria(id: number, token: string | null) {
  return apiGet<ComentarioHistoriaDetalle[]>(`/historias/${id}/comentarios`, token);
}

// Puede eliminarlo el autor del comentario, el dueño de la historia, o un admin.
export function eliminarComentarioHistoria(
  historiaId: number,
  comentarioId: number,
  token: string | null,
) {
  return apiDelete<{ mensaje: string }>(
    `/historias/${historiaId}/comentarios/${comentarioId}`,
    token,
  );
}

// Mismo criterio de permiso que un comentario (autor del eco, dueño de la
// historia, o admin).
export function eliminarEcoHistoria(historiaId: number, ecoId: number, token: string | null) {
  return apiDelete<{ mensaje: string }>(`/historias/${historiaId}/ecos/${ecoId}`, token);
}

// El mencionado decide si la historia también aparece bajo su propio avatar.
export function responderMencionHistoria(id: number, aceptar: boolean, token: string | null) {
  return apiPost<{ mencionAceptada: boolean }>(`/historias/${id}/mencion`, { aceptar }, token);
}

export function listarRespuestasSinLeer(token: string | null) {
  return apiGet<RespuestaSinLeer[]>("/historias/notificaciones/respuestas", token);
}

// No hace falta una función para "marcar leída": abrir la pestaña de
// reacciones del panel (mismo deep-link) ya las marca leídas de una, vía
// `GET /historias/:id/reacciones` (ver `reaccionesDe` en el backend).
export function listarReaccionesAgrupadasSinLeer(token: string | null) {
  return apiGet<ReaccionAgrupadaSinLeer[]>("/historias/notificaciones/reacciones", token);
}

export function marcarRespuestaLeida(comentarioId: number, token: string | null) {
  return apiPost<{ leida: boolean }>(
    `/historias/notificaciones/respuestas/${comentarioId}/leida`,
    {},
    token,
  );
}
