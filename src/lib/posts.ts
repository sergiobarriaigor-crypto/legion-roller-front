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
  titulo: string;
  resena: string;
  ubicacion: string | null;
  fotoUrl: string | null;
  createdAt: string;
  reaccionesCount: number;
  comentarios: Comentario[];
}
