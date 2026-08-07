import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.legionroller.app',
  appName: 'Legión Roller',
  webDir: 'www',
  // La app nativa no incluye una copia estática del sitio -- carga
  // directamente el sitio real ya desplegado en Vercel. Así el equipo
  // sigue desplegando cambios de la forma de siempre (git push a los
  // remotos backend/front) sin un paso de "recompilar la app" aparte.
  server: {
    url: 'https://legion-roller-front.vercel.app',
    cleartext: false,
  },
};

export default config;
