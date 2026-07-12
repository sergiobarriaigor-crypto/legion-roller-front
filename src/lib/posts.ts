export interface Comentario {
  id: number;
  autorNombre: string;
  texto: string;
  createdAt: string;
}

export interface Post {
  id: number;
  autorId: number;
  autorNombre: string;
  autorFotoUrl: string | null;
  titulo: string;
  resena: string;
  ubicacion: string | null;
  tipo: "foto" | "video";
  fotos: string[];
  videoUrl: string | null;
  createdAt: string;
  diasRestantes: number;
  reaccionesCount: number;
  comentarios: Comentario[];
}
