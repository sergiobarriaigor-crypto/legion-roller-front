import { apiGet } from "@/lib/api";

export interface HoraClima {
  hora: string;
  temperatura: number;
  icono: string;
  probabilidadLluvia: number;
  vientoVelocidad: number;
}

export interface DiaClima {
  fecha: string;
  tempMax: number;
  tempMin: number;
  icono: string;
  descripcion: string;
  probabilidadLluvia: number;
}

export type SemaforoClima = "bueno" | "precaucion" | "no_recomendado";

export interface ClimaDetalle {
  lat: number;
  lon: number;
  temperatura: number;
  sensacionTermica: number;
  icono: string;
  descripcion: string;
  probabilidadLluvia: number;
  vientoVelocidad: number;
  vientoDireccion: string;
  semaforo: SemaforoClima;
  proximasHoras: HoraClima[];
  proximosDias: DiaClima[];
  historialDias: DiaClima[];
  actualizadoEn: string;
}

export function obtenerClima(lat: number, lon: number, token: string | null) {
  return apiGet<ClimaDetalle>(`/clima?lat=${lat}&lon=${lon}`, token);
}
