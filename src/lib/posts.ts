import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";

export interface Post {
  id: number;
  autorId: number;
  autorNombre: string;
  autorFotoUrl: string | null;
  titulo: string;
  resena: string;
  ubicacion: string | null;
  tipo: "foto" | "video";
  fotos: string[];
  videoUrl: string | null;
  createdAt: string;
  diasRestantes: number;
  reaccionesCount: number;
  comentariosCount: number;
}

export interface ReaccionPostDetalle {
  miembroId: number;
  nombre: string;
  fotoUrl: string | null;
  createdAt: string;
}

export interface ComentarioPostDetalle {
  id: number;
  miembroId: number;
  nombre: string;
  fotoUrl: string | null;
  texto: string;
  respuestaAId: number | null;
  reaccionesCount: number;
  miReaccion: boolean;
  createdAt: string;
}

// Notificación para la campana: alguien respondió uno de mis comentarios, o
// dejó un comentario raíz en mi post (misma metodología que Historias).
export interface RespuestaPostSinLeer {
  id: number;
  postId: number;
  autorNombre: string;
  autorFotoUrl: string | null;
  texto: string;
  createdAt: string;
  esRespuesta: boolean;
}

// Notificación agrupada para la campana: N personas le dieron "Me gusta" al
// mismo post — se agrupan para no listar una fila por persona.
export interface ReaccionPostAgrupadaSinLeer {
  postId: number;
  total: number;
  primeros: { nombre: string; fotoUrl: string | null }[];
  createdAt: string;
}

export function listarComentariosPost(postId: number, token: string | null) {
  return apiGet<ComentarioPostDetalle[]>(`/posts/${postId}/comentarios`, token);
}

export function crearComentarioPost(
  postId: number,
  texto: string,
  respuestaAId: number | undefined,
  token: string | null,
) {
  return apiPost<ComentarioPostDetalle>(
    `/posts/${postId}/comentarios`,
    { texto, respuestaAId },
    token,
  );
}

// Puede eliminarlo el autor del comentario, el dueño del post, o un admin.
export function eliminarComentarioPost(postId: number, comentarioId: number, token: string | null) {
  return apiDelete<{ mensaje: string }>(`/posts/${postId}/comentarios/${comentarioId}`, token);
}

// Corazón sobre un comentario puntual — no genera notificación de campana.
export function reaccionarComentarioPost(comentarioId: number, token: string | null) {
  return apiPost<{ reaccionesCount: number; miReaccion: boolean }>(
    `/posts/comentarios/${comentarioId}/reaccion`,
    {},
    token,
  );
}

// Visible para cualquiera, como "a quién le gustó" en Historias.
export function listarReaccionesPost(postId: number, token: string | null) {
  return apiGet<ReaccionPostDetalle[]>(`/posts/${postId}/reacciones`, token);
}

export function listarRespuestasSinLeerPost(token: string | null) {
  return apiGet<RespuestaPostSinLeer[]>("/posts/notificaciones/respuestas", token);
}

// No hace falta una función para "marcar leída" agrupada: abrir la pestaña de
// reacciones del panel (mismo deep-link) ya las marca leídas de una, vía
// `GET /posts/:id/reacciones` (ver `reaccionesDe` en el backend).
export function listarReaccionesAgrupadasSinLeerPost(token: string | null) {
  return apiGet<ReaccionPostAgrupadaSinLeer[]>("/posts/notificaciones/reacciones", token);
}

export function marcarRespuestaLeidaPost(comentarioId: number, token: string | null) {
  return apiPatch<{ leida: boolean }>(
    `/posts/notificaciones/respuestas/${comentarioId}/leida`,
    {},
    token,
  );
}

// Comparte el post puertas adentro de la app (hasta 5 destinatarios por vez).
export function compartirPostAUsuarios(
  postId: number,
  destinatarioIds: number[],
  token: string | null,
) {
  return apiPost<{ compartidoCon: number }>(`/posts/${postId}/compartir`, { destinatarioIds }, token);
}
