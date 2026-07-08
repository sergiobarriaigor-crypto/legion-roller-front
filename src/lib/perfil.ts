export interface StatsPerfil {
  kmOficiales: number;
  kmTotales: number;
  numRutas: number;
  asistencias: number;
  eventos: number;
  horasPatinadas: number;
}

export interface TecnicasPerfil {
  t: boolean;
  soul: boolean;
  maggi: boolean;
  parallel: boolean;
}

export interface EstadoPerfil {
  texto: string;
  setAt: string;
}

export interface Reconocimiento {
  id: number;
  deNombre: string;
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
  tecnicas: TecnicasPerfil;
  estado: EstadoPerfil | null;
  reconocimientos: Reconocimiento[];
}

export const ETIQUETA_TECNICA: Record<keyof TecnicasPerfil, string> = {
  t: "T",
  soul: "Soul",
  maggi: "Maggi",
  parallel: "Parallel",
};
