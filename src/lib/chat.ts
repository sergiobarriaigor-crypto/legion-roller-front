export interface UltimoMensaje {
  autorNombre: string;
  texto: string;
  createdAt: string;
}

export interface ResumenSala {
  sala: string;
  ultimoMensaje: UltimoMensaje | null;
  noLeidos: number;
}

export interface ConversacionIndividual extends ResumenSala {
  otroMiembroId: number;
  otroNombre: string;
}

export interface Conversaciones {
  grupal: ResumenSala;
  individuales: ConversacionIndividual[];
}

export interface MensajeChat {
  id: number;
  autorId: number;
  autorNombre: string;
  texto: string;
  referenciaTipo: string | null;
  referenciaId: number | null;
  createdAt: string;
}

export interface MiembroSimple {
  id: number;
  nombre: string;
}

export function salaIndividual(id1: number, id2: number): string {
  const [a, b] = [id1, id2].sort((x, y) => x - y);
  return `dm-${a}-${b}`;
}
