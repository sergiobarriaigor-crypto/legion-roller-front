export interface ResenaEmprendedor {
  id: number;
  autorNombre: string;
  texto: string;
  createdAt: string;
}

export interface AnuncioEmprendedor {
  id: number;
  texto: string;
  createdAt: string;
}

export interface Emprendedor {
  id: number;
  miembroId: number;
  nombreDuenio: string;
  nombreNegocio: string;
  rubro: string;
  descripcion: string;
  contacto: string;
  ubicacion: string | null;
  instagram: string | null;
  facebook: string | null;
  tiktok: string | null;
  aprobado: boolean;
  solicitadoAt: string;
  reaccionesCount: number;
  resenas: ResenaEmprendedor[];
  anuncios: AnuncioEmprendedor[];
}
