import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";

export interface AnuncioEmprendedor {
  id: number;
  texto: string;
  createdAt: string;
}

export interface Emprendedor {
  id: number;
  miembroId: number;
  nombreDuenio: string;
  nombreNegocio: string;
  rubro: string;
  descripcion: string;
  contacto: string;
  ubicacion: string | null;
  instagram: string | null;
  facebook: string | null;
  tiktok: string | null;
  fotos: string[];
  aprobado: boolean;
  solicitadoAt: string;
  reaccionesCount: number;
  resenasCount: number;
  anuncios: AnuncioEmprendedor[];
}

export interface ResenaEmprendedorDetalle {
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

// Notificación para la campana: alguien respondió una de mis reseñas, o dejó
// una reseña raíz en mi ficha (misma metodología que Post/Historias).
export interface RespuestaEmprendedorSinLeer {
  id: number;
  emprendedorId: number;
  autorNombre: string;
  autorFotoUrl: string | null;
  texto: string;
  createdAt: string;
  esRespuesta: boolean;
}

export function listarResenas(emprendedorId: number, token: string | null) {
  return apiGet<ResenaEmprendedorDetalle[]>(`/emprendedores/${emprendedorId}/resenas`, token);
}

export function crearResena(
  emprendedorId: number,
  texto: string,
  respuestaAId: number | undefined,
  token: string | null,
) {
  return apiPost<ResenaEmprendedorDetalle>(
    `/emprendedores/${emprendedorId}/resenas`,
    { texto, respuestaAId },
    token,
  );
}

// Puede eliminarla el autor de la reseña, el dueño de la ficha, o un admin.
export function eliminarResena(emprendedorId: number, resenaId: number, token: string | null) {
  return apiDelete<{ mensaje: string }>(`/emprendedores/${emprendedorId}/resenas/${resenaId}`, token);
}

// Corazón sobre una reseña puntual — no genera notificación de campana.
export function reaccionarResena(resenaId: number, token: string | null) {
  return apiPost<{ reaccionesCount: number; miReaccion: boolean }>(
    `/emprendedores/resenas/${resenaId}/reaccion`,
    {},
    token,
  );
}

export function listarRespuestasSinLeerImpulsa(token: string | null) {
  return apiGet<RespuestaEmprendedorSinLeer[]>("/emprendedores/notificaciones/respuestas", token);
}

export function marcarRespuestaLeidaImpulsa(resenaId: number, token: string | null) {
  return apiPatch<{ leida: boolean }>(
    `/emprendedores/notificaciones/respuestas/${resenaId}/leida`,
    {},
    token,
  );
}

// Comparte la ficha puertas adentro de la app (hasta 5 destinatarios por vez).
export function compartirEmprendedorAUsuarios(
  emprendedorId: number,
  destinatarioIds: number[],
  token: string | null,
) {
  return apiPost<{ compartidoCon: number }>(
    `/emprendedores/${emprendedorId}/compartir`,
    { destinatarioIds },
    token,
  );
}
