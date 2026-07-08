export const MOTIVOS_EMERGENCIA = ["caida", "salud", "seguridad", "otro"] as const;
export type MotivoEmergencia = (typeof MOTIVOS_EMERGENCIA)[number];

export const ETIQUETA_MOTIVO: Record<MotivoEmergencia, string> = {
  caida: "Caída",
  salud: "Problema de salud",
  seguridad: "Problema de seguridad",
  otro: "Otro",
};

export interface EmergenciaActiva {
  id: number;
  miembroId: number;
  nombre: string;
  motivo: string;
  requiereAmbulancia: boolean;
  createdAt: string;
  lat: number | null;
  lon: number | null;
}

export interface MiEmergencia {
  id: number;
  miembroId: number;
  motivo: string;
  requiereAmbulancia: boolean;
  activa: boolean;
  createdAt: string;
  resueltaAt: string | null;
}
