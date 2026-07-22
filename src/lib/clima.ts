import { apiGet } from "@/lib/api";

export interface ClimaCiudad {
  clave: string;
  nombre: string;
  temperatura: number;
  icono: string;
  descripcion: string;
  actualizadoEn: string;
}

export function obtenerClima(token: string | null) {
  return apiGet<ClimaCiudad[]>("/clima", token);
}
