import { apiDelete, apiGet, apiPost } from "@/lib/api";

export interface Historia {
  id: number;
  tipo: "foto" | "video";
  mediaUrl: string;
  texto: string | null;
  ubicacion: string | null;
  createdAt: string;
}

export interface GrupoHistorias {
  autorId: number;
  autorNombre: string;
  autorFotoUrl: string | null;
  vistoCompleto: boolean;
  historias: Historia[];
}

export interface CrearHistoriaInput {
  tipo: "foto" | "video";
  mediaUrl: string;
  texto?: string;
  ubicacion?: string;
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
