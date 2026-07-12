import { distanciaHaversineKm } from "@/lib/geo";

interface Sector {
  nombre: string;
  lat: number;
  lon: number;
}

// Lista aproximada de sectores conocidos de Puerto Montt / Puerto Varas (sección 1 del PDF).
// Las coordenadas son aproximadas — sirven solo para mostrar un nombre de zona amigable
// en el panel de "Patinadores activos", no para precisión de navegación. Agregar un
// sector nuevo es solo sumar una fila aquí.
const SECTORES: Sector[] = [
  { nombre: "Costanera de Puerto Montt", lat: -41.4717, lon: -72.9424 },
  { nombre: "Pelluco", lat: -41.462, lon: -72.917 },
  { nombre: "Chinquihue", lat: -41.486, lon: -72.972 },
  { nombre: "Alerce", lat: -41.383, lon: -73.02 },
  { nombre: "Costanera de Puerto Varas", lat: -41.319, lon: -72.986 },
  { nombre: "Plaza de Armas, Puerto Varas", lat: -41.318, lon: -72.983 },
];

export function sectorMasCercano(lat: number, lon: number): string {
  let mejor = SECTORES[0];
  let mejorDistancia = Infinity;

  for (const sector of SECTORES) {
    const distancia = distanciaHaversineKm(
      { lat, lon, timestamp: 0 },
      { lat: sector.lat, lon: sector.lon, timestamp: 0 },
    );
    if (distancia < mejorDistancia) {
      mejorDistancia = distancia;
      mejor = sector;
    }
  }

  return mejor.nombre;
}

export interface SectorConDistancia {
  nombre: string;
  distanciaKm: number;
}

// Para el selector de ubicación estilo Instagram de Post: en vez de un solo
// nombre (como sectorMasCercano), la lista completa ordenada de más cerca a
// más lejos — el usuario elige de una lista de "lugares cercanos", no se le
// asigna uno solo en silencio.
export function sectoresPorCercania(lat: number, lon: number): SectorConDistancia[] {
  return SECTORES.map((sector) => ({
    nombre: sector.nombre,
    distanciaKm: distanciaHaversineKm(
      { lat, lon, timestamp: 0 },
      { lat: sector.lat, lon: sector.lon, timestamp: 0 },
    ),
  })).sort((a, b) => a.distanciaKm - b.distanciaKm);
}

// Búsqueda manual por nombre: sin geocoding externo, filtra sobre la misma
// lista conocida de sectores (igual criterio que el resto de la app).
export function buscarSectoresPorNombre(consulta: string): string[] {
  const q = consulta.trim().toLowerCase();
  if (!q) return SECTORES.map((s) => s.nombre);
  return SECTORES.filter((s) => s.nombre.toLowerCase().includes(q)).map((s) => s.nombre);
}
