import { apiGet, apiPost } from "./api";

export type EstiloFlyover = "edificios" | "satelital";

export interface EstadoFlyover {
  id: number;
  recorridoId: number;
  estado: "pendiente" | "procesando" | "listo" | "error";
  videoUrl: string | null;
  errorMsg: string | null;
  duracionSeg: number | null;
  estilo: EstiloFlyover;
}

export function solicitarFlyover(recorridoId: number, token: string, estilo: EstiloFlyover) {
  return apiPost<EstadoFlyover>(`/flyover/${recorridoId}`, { estilo }, token);
}

export function estadoFlyoverPorRecorrido(recorridoId: number, token: string) {
  return apiGet<EstadoFlyover | null>(`/flyover/recorrido/${recorridoId}`, token);
}

export function estadoFlyoverPorId(id: number, token: string) {
  return apiGet<EstadoFlyover>(`/flyover/${id}`, token);
}
