import { apiGet, apiPost } from "./api";

// Mismas 3 categorías que puede crear cualquier miembro (no solo el Admin) —
// "rodada"/"evento" también aparecen en el calendario, pero esos vienen del
// muro de Comunidad (Publicacion + RSVP), no se crean desde acá.
export const CATEGORIAS_ACTIVIDAD = ["entrenamiento", "reunion", "patinada_libre"] as const;
export type CategoriaActividad = (typeof CATEGORIAS_ACTIVIDAD)[number];

export const ETIQUETA_CATEGORIA: Record<string, string> = {
  rodada: "Rodada oficial",
  evento: "Evento",
  entrenamiento: "Entrenamiento",
  reunion: "Reunión",
  patinada_libre: "Patinada libre",
  cumpleanos: "Cumpleaños",
  feriado: "Feriado nacional",
};

// Un color fijo por categoría — igual en toda la app (puntos del calendario,
// tarjetas de detalle, etc.). "cancelada" pisa este color con gris/rojo.
export const COLOR_CATEGORIA: Record<string, string> = {
  rodada: "#e7c168",
  evento: "#f2ead8",
  entrenamiento: "#5fae4e",
  reunion: "#9b7fd4",
  patinada_libre: "#4a9de0",
  cumpleanos: "#e07fa8",
  feriado: "#d9574a",
};

export const MINUTOS_AVISO_CREADOR_VALIDOS = [30, 60, 120] as const;

export interface ItemCalendario {
  origen: "publicacion" | "actividad" | "cumpleanos" | "feriado";
  id: number;
  categoria: string;
  titulo: string;
  descripcion: string | null;
  fecha: string;
  hora: string | null;
  puntoEncuentro: string | null;
  fotoUrl: string | null;
  cancelada: boolean;
  esCreador: boolean;
}

export interface InvitacionPendiente {
  id: number;
  actividadId: number;
  categoria: string;
  titulo: string;
  fecha: string;
  hora: string | null;
  creadorNombre: string;
}

export interface CrearActividadInput {
  categoria: CategoriaActividad;
  titulo: string;
  descripcion?: string;
  fecha: string;
  hora?: string;
  puntoEncuentro?: string;
  puntoLat?: number;
  puntoLon?: number;
  fotoUrl?: string;
  musicaId?: string;
  minutosAvisoCreador?: number;
  invitadosIds: number[];
}

export function listarMesCalendario(
  anio: number,
  mes: number,
  token: string | null,
): Promise<ItemCalendario[]> {
  return apiGet<ItemCalendario[]>(`/calendario/mes?anio=${anio}&mes=${mes}`, token);
}

export function misInvitacionesPendientes(token: string | null): Promise<InvitacionPendiente[]> {
  return apiGet<InvitacionPendiente[]>("/calendario/pendientes", token);
}

export function crearActividad(datos: CrearActividadInput, token: string | null) {
  return apiPost("/calendario/actividades", datos, token);
}

export function responderInvitacion(
  actividadId: number,
  estado: "aceptada" | "rechazada",
  token: string | null,
) {
  return apiPost(`/calendario/actividades/${actividadId}/invitacion`, { estado }, token);
}

export function cancelarActividad(actividadId: number, token: string | null) {
  return apiPost(`/calendario/actividades/${actividadId}/cancelar`, {}, token);
}
