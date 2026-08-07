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
  // Requisito documentado de @capacitor-community/background-geolocation:
  // sin esto, Android corta las actualizaciones de ubicación en segundo
  // plano a los 5 minutos, justo el problema que este plugin busca resolver.
  android: {
    useLegacyBridge: true,
  },
};

export default config;
