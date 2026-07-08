export type Rol = "usuario" | "admin" | "visitante";

export interface Sesion {
  id: number | null; // null para Visitante (no pasa por el backend)
  nombre: string;
  rol: Rol;
  token: string | null;
  expiraEn: number; // timestamp epoch ms
}

const CLAVE_SESION = "legion-roller:sesion";
export const DIAS_VIGENCIA_SESION = 30;

// Rutas ocultas para el rol Visitante (ver sección 3 de la especificación: Mapa y Perfil ocultos;
// Chat depende de Perfil, así que también queda oculto)
export const RUTAS_RESTRINGIDAS_VISITANTE = ["/mapa", "/perfil", "/chat"];

export function rutaInicialParaRol(rol: Rol): string {
  return rol === "visitante" ? "/comunidad" : "/mapa";
}

export function guardarSesion(datos: {
  id: number | null;
  nombre: string;
  rol: Rol;
  token: string | null;
}): Sesion {
  const sesion: Sesion = {
    ...datos,
    expiraEn: Date.now() + DIAS_VIGENCIA_SESION * 24 * 60 * 60 * 1000,
  };
  localStorage.setItem(CLAVE_SESION, JSON.stringify(sesion));
  return sesion;
}

export function leerSesionGuardada(): Sesion | null {
  if (typeof window === "undefined") return null;
  const crudo = localStorage.getItem(CLAVE_SESION);
  if (!crudo) return null;

  try {
    const sesion = JSON.parse(crudo) as Sesion;
    if (sesion.expiraEn < Date.now()) {
      localStorage.removeItem(CLAVE_SESION);
      return null;
    }
    return sesion;
  } catch {
    localStorage.removeItem(CLAVE_SESION);
    return null;
  }
}

export function cerrarSesion() {
  localStorage.removeItem(CLAVE_SESION);
}
