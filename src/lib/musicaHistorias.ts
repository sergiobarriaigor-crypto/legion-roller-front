// Catálogo propio de música para historias — pistas royalty-free alojadas
// como archivos estáticos en /public/musica (no contenido subido por el
// usuario, por eso no pasan por /uploads). Ver public/musica/README.md para
// cómo agregar pistas nuevas.
export type GeneroMusica = "fiesta" | "rock" | "techno" | "romantica" | "cumbia";

export const GENEROS_MUSICA: { id: GeneroMusica; nombre: string }[] = [
  { id: "fiesta", nombre: "Fiesta" },
  { id: "rock", nombre: "Rock" },
  { id: "techno", nombre: "Techno" },
  { id: "romantica", nombre: "Románticas" },
  { id: "cumbia", nombre: "Cumbia" },
];

export interface CancionHistoria {
  id: string;
  nombre: string;
  genero: GeneroMusica;
  archivo: string; // ruta relativa dentro de /public, ej. "/musica/fiesta/01-nombre.mp3"
}

// Se completa con las pistas reales una vez que estén en public/musica/<genero>/
// — ver instrucciones en public/musica/README.md.
export const CANCIONES_HISTORIA: CancionHistoria[] = [];
