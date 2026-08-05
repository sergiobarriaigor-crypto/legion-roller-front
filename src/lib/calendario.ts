import { apiDelete, apiGet, apiPatch, apiPost } from "./api";

// Categorías que puede crear cualquier miembro (no solo el Admin) —
// "rodada"/"evento" también aparecen en el calendario, pero esos vienen del
// muro de Comunidad (Publicacion + RSVP), no se crean desde acá.
export const CATEGORIAS_ACTIVIDAD = [
  "reunion",
  "patinada_libre",
  "entrenamiento",
  "otros",
] as const;
export type CategoriaActividad = (typeof CATEGORIAS_ACTIVIDAD)[number];

export const ETIQUETA_CATEGORIA: Record<string, string> = {
  rodada: "Rodada oficial",
  evento: "Evento",
  entrenamiento: "Entrenamiento",
  reunion: "Reunión",
  patinada_libre: "Patinada libre",
  otros: "Otros",
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
  otros: "#8a95a5",
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
  motivoCancelacion: string | null;
  esCreador: boolean;
}

export interface InvitacionPendiente {
  id: number;
  actividadId: number;
  categoria: string;
  titulo: string;
  fecha: string;
  hora: string | null;
  fotoUrl: string | null;
  creadorNombre: string;
}

export interface CrearActividadInput {
  categoria: CategoriaActividad;
  titulo: string;
  descripcion?: string;
  fecha: string;
  hora: string;
  puntoEncuentro?: string;
  puntoLat?: number;
  puntoLon?: number;
  fotoUrl?: string;
  musicaId?: string;
  minutosAvisoCreador: number;
  invitadosIds?: number[];
}

// Igual a CrearActividadInput pero todo opcional — el formulario de edición
// solo reenvía lo que el usuario cambió.
export type ActualizarActividadInput = Partial<CrearActividadInput>;

export interface ActividadDetalle {
  id: number;
  categoria: string;
  titulo: string;
  descripcion: string | null;
  fecha: string;
  hora: string | null;
  puntoEncuentro: string | null;
  puntoLat: number | null;
  puntoLon: number | null;
  fotoUrl: string | null;
  musicaId: string | null;
  minutosAvisoCreador: number | null;
  cancelada: boolean;
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

export function cancelarActividad(
  actividadId: number,
  motivo: string | undefined,
  token: string | null,
) {
  return apiPost(`/calendario/actividades/${actividadId}/cancelar`, { motivo }, token);
}

export function eliminarActividad(actividadId: number, token: string | null) {
  return apiDelete(`/calendario/actividades/${actividadId}`, token);
}

export function obtenerActividad(
  actividadId: number,
  token: string | null,
): Promise<ActividadDetalle> {
  return apiGet<ActividadDetalle>(`/calendario/actividades/${actividadId}`, token);
}

export function editarActividad(
  actividadId: number,
  datos: ActualizarActividadInput,
  token: string | null,
) {
  return apiPatch(`/calendario/actividades/${actividadId}`, datos, token);
}
