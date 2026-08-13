import { useEffect, useState } from "react";
import { distanciaHaversineKm } from "@/lib/geo";
import { reverseGeocodificarConCache, reverseGeocodificarEspecifico } from "@/lib/geocodificacion";

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

// Reemplaza el resultado de sectorMasCercano (que solo ordena estos mismos 6
// puntos fijos por cercanía, aunque el más cercano esté a varios km de
// distancia real) por el nombre real del lugar vía reverseGeocodificar
// (Nominatim). Devuelve sectorMasCercano de entrada mientras responde la red
// o si Nominatim falla, así el usuario siempre ve algo y nunca un espacio en
// blanco.
export function useNombreLugar(lat: number, lon: number): string {
  const [nombre, setNombre] = useState(() => sectorMasCercano(lat, lon));

  useEffect(() => {
    let cancelado = false;
    reverseGeocodificarConCache(lat, lon).then((real) => {
      if (!cancelado && real) setNombre(real);
    });
    return () => {
      cancelado = true;
    };
  }, [lat, lon]);

  return nombre;
}

// Variante para las etiquetas de lugar del video del recorrido (ver
// tarjetaRecorrido.ts): a diferencia de useNombreLugar, NO cae a un nombre
// de respaldo -- devuelve null mientras no haya resultado o si Nominatim
// solo resolvió hasta el nivel de ciudad (un "Puerto Montt" solo no aporta
// nada ahí, la app ya está enfocada en esa ciudad).
export function useNombreLugarEspecifico(lat: number, lon: number): string | null {
  const [nombre, setNombre] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    reverseGeocodificarEspecifico(lat, lon).then((real) => {
      if (!cancelado) setNombre(real);
    });
    return () => {
      cancelado = true;
    };
  }, [lat, lon]);

  return nombre;
}
