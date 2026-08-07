import { apiGet, apiPost } from "./api";

export interface EstadoFlyover {
  id: number;
  recorridoId: number;
  estado: "pendiente" | "procesando" | "listo" | "error";
  videoUrl: string | null;
  errorMsg: string | null;
  duracionSeg: number | null;
}

export function solicitarFlyover(recorridoId: number, token: string) {
  return apiPost<EstadoFlyover>(`/flyover/${recorridoId}`, {}, token);
}

export function estadoFlyoverPorRecorrido(recorridoId: number, token: string) {
  return apiGet<EstadoFlyover | null>(`/flyover/recorrido/${recorridoId}`, token);
}

export function estadoFlyoverPorId(id: number, token: string) {
  return apiGet<EstadoFlyover>(`/flyover/${id}`, token);
}
