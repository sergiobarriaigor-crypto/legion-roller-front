// Catálogo propio de música para historias — pistas royalty-free alojadas
// como archivos estáticos en /public/musica (no contenido subido por el
// usuario, por eso no pasan por /uploads). Ver public/musica/README.md para
// cómo agregar pistas nuevas.
export type GeneroMusica = "fiesta" | "rock" | "dance" | "romantica" | "legion";

export const GENEROS_MUSICA: { id: GeneroMusica; nombre: string }[] = [
  { id: "fiesta", nombre: "Fiesta" },
  { id: "rock", nombre: "Rock" },
  { id: "dance", nombre: "Dance" },
  { id: "romantica", nombre: "Románticas" },
  { id: "legion", nombre: "Legión" },
];

export interface CancionHistoria {
  id: string;
  nombre: string;
  genero: GeneroMusica;
  archivo: string; // ruta relativa dentro de /public, ej. "/musica/fiesta/01-nombre.mp3"
}

// Se completa con las pistas reales una vez que estén en public/musica/<genero>/
// — ver instrucciones en public/musica/README.md.
export const CANCIONES_HISTORIA: CancionHistoria[] = [
  { id: "rock-01", nombre: "Motivation", genero: "rock", archivo: "/musica/rock/01-motivation.mp3" },
  { id: "rock-02", nombre: "Upbeat Rock", genero: "rock", archivo: "/musica/rock/02-upbeat-rock.mp3" },
  { id: "rock-03", nombre: "Rock Music", genero: "rock", archivo: "/musica/rock/03-rock-music.mp3" },
  { id: "rock-04", nombre: "Sport Power Action", genero: "rock", archivo: "/musica/rock/04-sport-power-action.mp3" },
  { id: "rock-05", nombre: "Sport Trailer", genero: "rock", archivo: "/musica/rock/05-sport-trailer.mp3" },
  { id: "rock-06", nombre: "Action Rock", genero: "rock", archivo: "/musica/rock/06-action-rock.mp3" },
  { id: "rock-07", nombre: "Rock Instrumental 1", genero: "rock", archivo: "/musica/rock/07-rock-instrumental-1.mp3" },
  { id: "rock-08", nombre: "Rock Instrumental 2", genero: "rock", archivo: "/musica/rock/08-rock-instrumental-2.mp3" },
  { id: "rock-09", nombre: "Rock Fun", genero: "rock", archivo: "/musica/rock/09-rock-fun.mp3" },
  { id: "rock-10", nombre: "Rock Anthem", genero: "rock", archivo: "/musica/rock/10-rock-anthem.mp3" },

  { id: "dance-01", nombre: "Summer Dance Party", genero: "dance", archivo: "/musica/dance/01-summer-dance-party.mp3" },
  { id: "dance-02", nombre: "Festival Party", genero: "dance", archivo: "/musica/dance/02-festival-party.mp3" },
  { id: "dance-03", nombre: "Club Party", genero: "dance", archivo: "/musica/dance/03-club-party.mp3" },
  { id: "dance-04", nombre: "Party", genero: "dance", archivo: "/musica/dance/04-party.mp3" },
  { id: "dance-05", nombre: "Dance Party", genero: "dance", archivo: "/musica/dance/05-dance-party.mp3" },
  { id: "dance-06", nombre: "Rave House Techno", genero: "dance", archivo: "/musica/dance/06-rave-house-techno.mp3" },
  { id: "dance-07", nombre: "Dance Night", genero: "dance", archivo: "/musica/dance/07-dance-night.mp3" },

  { id: "fiesta-01", nombre: "Country Happy", genero: "fiesta", archivo: "/musica/fiesta/01-country-happy.mp3" },
  { id: "fiesta-02", nombre: "Zumba Fiesta", genero: "fiesta", archivo: "/musica/fiesta/02-zumba-fiesta.mp3" },
  { id: "fiesta-03", nombre: "Fiesta de Verano en Cuba", genero: "fiesta", archivo: "/musica/fiesta/03-fiesta-de-verano-en-cuba.mp3" },
  { id: "fiesta-04", nombre: "Fiesta del Sol", genero: "fiesta", archivo: "/musica/fiesta/04-fiesta-del-sol.mp3" },
  { id: "fiesta-05", nombre: "Fiesta Vibrante", genero: "fiesta", archivo: "/musica/fiesta/05-fiesta-vibrante.mp3" },
  { id: "fiesta-06", nombre: "Happy Holiday", genero: "fiesta", archivo: "/musica/fiesta/06-happy-holiday.mp3" },
  { id: "fiesta-07", nombre: "Salsa Party", genero: "fiesta", archivo: "/musica/fiesta/07-salsa-party.mp3" },
  { id: "fiesta-08", nombre: "Salsa Latina", genero: "fiesta", archivo: "/musica/fiesta/08-salsa-latina.mp3" },
  { id: "fiesta-09", nombre: "Carnival Trumpet", genero: "fiesta", archivo: "/musica/fiesta/09-carnival-trumpet.mp3" },

  { id: "romantica-01", nombre: "Piano Romántico", genero: "romantica", archivo: "/musica/romantica/01-piano-romantico.mp3" },
  { id: "romantica-02", nombre: "Angels by My Side", genero: "romantica", archivo: "/musica/romantica/02-angels-by-my-side.mp3" },
  { id: "romantica-03", nombre: "Love of the Sun", genero: "romantica", archivo: "/musica/romantica/03-love-of-the-sun.mp3" },
  { id: "romantica-04", nombre: "Sweet", genero: "romantica", archivo: "/musica/romantica/04-sweet.mp3" },
  { id: "romantica-05", nombre: "Piano Music", genero: "romantica", archivo: "/musica/romantica/05-piano-music.mp3" },

  { id: "legion-01", nombre: "Legión Roller", genero: "legion", archivo: "/musica/legion/01-legion-roller.mp3" },
  { id: "legion-02", nombre: "Legión Roller A", genero: "legion", archivo: "/musica/legion/02-legion-roller-a.mp3" },
  { id: "legion-03", nombre: "Legión Roller B", genero: "legion", archivo: "/musica/legion/03-legion-roller-b.mp3" },
  { id: "legion-04", nombre: "Experiencia", genero: "legion", archivo: "/musica/legion/04-experiencia.mp3" },
  { id: "legion-05", nombre: "Primer Día", genero: "legion", archivo: "/musica/legion/05-primer-dia.mp3" },
  { id: "legion-06", nombre: "Rodar", genero: "legion", archivo: "/musica/legion/06-rodar.mp3" },
];
