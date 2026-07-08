export const TIPOS_PUBLICACION = [
  "comunicado",
  "rodada",
  "evento",
  "resumen",
  "alerta",
  "estado_rutas",
  "anuncio",
  "consejo",
] as const;

export type TipoPublicacion = (typeof TIPOS_PUBLICACION)[number];

export const ETIQUETA_TIPO: Record<TipoPublicacion, string> = {
  comunicado: "Comunicado oficial",
  rodada: "Rodada programada",
  evento: "Evento y actividad",
  resumen: "Resumen con fotografías",
  alerta: "Alerta de seguridad",
  estado_rutas: "Estado de rutas",
  anuncio: "Anuncio y celebración",
  consejo: "Consejo educativo",
};

export interface Publicacion {
  id: number;
  tipo: string;
  titulo: string;
  texto: string;
  fecha: string | null;
  hora: string | null;
  puntoEncuentro: string | null;
  rsvp: boolean;
  duracionHoras: number | null;
  activaEnMapa: boolean;
  fotos: string[];
  createdAt: string;
  rsvpCounts: { yes: number; maybe: number; no: number };
}
