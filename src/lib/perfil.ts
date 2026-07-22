import { apiDelete, apiGet, apiPost } from "@/lib/api";

export interface StatsPerfil {
  kmOficiales: number;
  kmTotales: number;
  numRutas: number;
  asistencias: number;
  eventos: number;
  horasPatinadas: number;
}

export interface EstadoPerfil {
  texto: string;
  setAt: string;
}

export interface Reconocimiento {
  id: number;
  deNombre: string;
  deFotoUrl: string | null;
  texto: string;
  createdAt: string;
  leida: boolean;
}

export interface MiPerfil {
  id: number;
  nombre: string;
  ciudad: string | null;
  rol: string;
  fotoUrl: string | null;
  stats: StatsPerfil;
  mejorDistanciaRuta: number;
  tecnicas: string[];
  estado: EstadoPerfil | null;
  reconocimientos: Reconocimiento[];
}

// Vista de solo lectura de OTRO miembro (botón "Ver perfil" desde el chat) —
// mismo subconjunto que ya devuelve GET /perfil/:id, sin reconocimientos ni
// publicaciones (esas son solo parte de "mi" perfil).
export interface PerfilPublico {
  id: number;
  nombre: string;
  ciudad: string | null;
  rol: string;
  fotoUrl: string | null;
  stats: StatsPerfil;
  mejorDistanciaRuta: number;
  tecnicas: string[];
  estado: EstadoPerfil | null;
}

export function perfilPublico(miembroId: number, token: string | null) {
  return apiGet<PerfilPublico>(`/perfil/${miembroId}`, token);
}

// Hitos de "Distancias Alcanzadas" (sección 9 del PDF): no son acumulativos,
// cada uno se desbloquea solo si el usuario completó esa distancia en una
// única ruta/sesión (mejorDistanciaRuta, ver backend/perfil.service.ts).
export const HITOS_DISTANCIA_KM = [5, 10, 20, 40, 60, 70, 100, 150, 200];

// Técnicas dominadas, organizadas por categoría (sección 9 del PDF). Reemplaza
// la lista plana original de 4 técnicas fijas — el backend solo valida que la
// clave elegida esté en este catálogo (aplanado), no conoce las categorías.
export interface CategoriaTecnicas {
  categoria: string;
  tecnicas: { clave: string; etiqueta: string }[];
}

export const CATALOGO_TECNICAS: CategoriaTecnicas[] = [
  {
    categoria: "Frenos",
    tecnicas: [
      { clave: "cuna", etiqueta: "Cuña" },
      { clave: "t", etiqueta: "T" },
      { clave: "soul", etiqueta: "Soul" },
      { clave: "power_slide", etiqueta: "Power Slide" },
      { clave: "magic_slide", etiqueta: "Magic" },
      { clave: "parallel_slide", etiqueta: "Parallel" },
      { clave: "contra", etiqueta: "Contra Pared o Muro" },
    ],
  },
  {
    categoria: "Saltos",
    tecnicas: [
      { clave: "salto_frente", etiqueta: "Salto de Frente" },
      { clave: "180", etiqueta: "180°" },
      { clave: "fakie_180", etiqueta: "Fakie 180°" },
      { clave: "360", etiqueta: "360°" },
    ],
  },
  {
    categoria: "Patinaje en Fakie",
    tecnicas: [
      { clave: "fakie_plano", etiqueta: "Fakie en plano" },
      { clave: "downhill_fakie", etiqueta: "Downhill Fakie" },
    ],
  },
];

// Galería de fotos del perfil (hasta 6), cada una con su propio "me gusta" —
// mismo patrón que Post.
export interface FotoGaleria {
  id: number;
  url: string;
  createdAt: string;
  reaccionesCount: number;
  miReaccion: boolean;
}

export function listarGaleria(miembroId: number, token: string | null) {
  return apiGet<FotoGaleria[]>(`/perfil/${miembroId}/galeria`, token);
}

export function subirFotoGaleria(url: string, token: string | null) {
  return apiPost<FotoGaleria>("/perfil/galeria", { url }, token);
}

export function eliminarFotoGaleria(fotoId: number, token: string | null) {
  return apiDelete<{ mensaje: string }>(`/perfil/galeria/${fotoId}`, token);
}

export function reaccionarFotoGaleria(fotoId: number, token: string | null) {
  return apiPost<{ reaccionesCount: number; miReaccion: boolean }>(
    `/perfil/galeria/${fotoId}/reaccion`,
    {},
    token,
  );
}
