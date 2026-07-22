import { apiGet, apiPost } from "./api";

export const TIPOS_PUBLICACION = [
  "comunicado",
  "rodada",
  "evento",
  "resumen",
  "alerta",
  "estado_rutas",
  "anuncio",
  "consejo",
] as const;

export type TipoPublicacion = (typeof TIPOS_PUBLICACION)[number];

export const ETIQUETA_TIPO: Record<TipoPublicacion, string> = {
  comunicado: "Comunicado oficial",
  rodada: "Rodada programada",
  evento: "Evento y actividad",
  resumen: "Resumen con fotografías",
  alerta: "Alerta de seguridad",
  estado_rutas: "Estado de rutas",
  anuncio: "Anuncio y celebración",
  consejo: "Consejo educativo",
};

export const TIPOS_FINALIZACION = [
  "punto_llegada",
  "distancia_minima",
  "ida_vuelta",
  "cierre_manual",
] as const;

export type TipoFinalizacion = (typeof TIPOS_FINALIZACION)[number];

export const ETIQUETA_FINALIZACION: Record<TipoFinalizacion, string> = {
  punto_llegada: "Llegar a un punto de llegada",
  distancia_minima: "Recorrer una distancia mínima",
  ida_vuelta: "Ida y vuelta al punto de inicio",
  cierre_manual: "Cierre manual (el Admin la marca finalizada)",
};

export const TIPOS_ASISTENCIA_EVENTO = [
  "gps_puntual",
  "codigo",
  "cierre_manual",
  "autoconfirmacion",
] as const;

export type TipoAsistenciaEvento = (typeof TIPOS_ASISTENCIA_EVENTO)[number];

export const ETIQUETA_ASISTENCIA_EVENTO: Record<TipoAsistenciaEvento, string> = {
  gps_puntual: "Check-in por GPS (estar en el lugar)",
  codigo: "Código de asistencia",
  cierre_manual: "Cierre manual (el Admin pasa lista)",
  autoconfirmacion: "Autoconfirmación (botón simple)",
};

export interface Publicacion {
  id: number;
  tipo: string;
  titulo: string;
  texto: string;
  fecha: string | null;
  hora: string | null;
  puntoEncuentro: string | null;
  puntoLat: number | null;
  puntoLon: number | null;
  tipoFinalizacion: string | null;
  puntoFinLat: number | null;
  puntoFinLon: number | null;
  distanciaMinimaKm: number | null;
  cerrada: boolean;
  tipoAsistenciaEvento: string | null;
  codigoAsistencia: string | null;
  rsvp: boolean;
  duracionHoras: number | null;
  activaEnMapa: boolean;
  fotos: string[];
  createdAt: string;
  rsvpCounts: { yes: number; maybe: number; no: number };
}

export interface AsistenciaEventoDetalle {
  miembroId: number;
  miembroNombre: string;
  estado: string;
  asistio: boolean;
}

export function misAsistenciasEvento(token: string) {
  return apiGet<Record<number, boolean>>("/publicaciones/mis-asistencias-evento", token);
}

export function confirmarAsistenciaEvento(
  publicacionId: number,
  body: { lat?: number; lon?: number; codigo?: string },
  token: string,
) {
  return apiPost(`/publicaciones/${publicacionId}/confirmar-asistencia`, body, token);
}

export function listarAsistenciaEvento(publicacionId: number, token: string) {
  return apiGet<AsistenciaEventoDetalle[]>(
    `/publicaciones/${publicacionId}/asistencia-evento`,
    token,
  );
}

export function alternarAsistenciaEvento(
  publicacionId: number,
  miembroId: number,
  token: string,
) {
  return apiPost<{ asistio: boolean }>(
    `/publicaciones/${publicacionId}/asistencia-evento/${miembroId}`,
    {},
    token,
  );
}
