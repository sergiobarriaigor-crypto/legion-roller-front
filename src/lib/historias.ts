import { apiDelete, apiGet, apiPost } from "@/lib/api";

export interface Historia {
  id: number;
  tipo: "foto" | "video";
  mediaUrl: string;
  texto: string | null;
  textoEstilo: string | null;
  ubicacion: string | null;
  mencionadoId: number | null;
  mencionadoNombre: string | null;
  mencionX: number | null;
  mencionY: number | null;
  mencionSinVer: boolean;
  reaccionesCount: number;
  miReaccion: boolean;
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

export interface CrearHistoriaInput {
  tipo: "foto" | "video";
  mediaUrl: string;
  texto?: string;
  textoEstilo?: string;
  ubicacion?: string;
  mencionadoId?: number;
  mencionX?: number;
  mencionY?: number;
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

// Solo el autor puede consultarla (el backend responde 403 si no lo es).
export function listarReaccionesHistoria(id: number, token: string | null) {
  return apiGet<ReaccionHistoriaDetalle[]>(`/historias/${id}/reacciones`, token);
}
