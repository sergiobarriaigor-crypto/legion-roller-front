// Búsqueda real de direcciones/lugares vía Nominatim (OpenStreetMap), acotada
// a Chile — mismo servicio que ya usaba SelectorPuntoMapa.tsx (Admin, para
// coordenadas de rodadas). Este helper es para los selectores de "ubicación"
// como etiqueta de texto (Post/Historia): solo necesitamos un nombre legible,
// no lat/lon.
export interface LugarBuscado {
  nombre: string;
}

// display_name de Nominatim viene con todos los niveles administrativos
// ("Valdivia, Provincia de Valdivia, Los Ríos, Chile") — nos quedamos con los
// primeros para que la etiqueta sea corta y legible.
function acortarNombre(displayName: string): string {
  const partes = displayName.split(",").map((p) => p.trim());
  return partes.slice(0, 3).join(", ");
}

export async function buscarLugares(consulta: string): Promise<LugarBuscado[]> {
  const q = consulta.trim();
  if (!q) return [];
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=8&countrycodes=cl&accept-language=es&q=${encodeURIComponent(q)}`,
    );
    if (!res.ok) return [];
    const data: unknown = await res.json();
    if (!Array.isArray(data)) return [];
    return data.map((r) => ({ nombre: acortarNombre((r as { display_name: string }).display_name) }));
  } catch {
    return [];
  }
}

interface DireccionNominatim {
  road?: string;
  pedestrian?: string;
  neighbourhood?: string;
  suburb?: string;
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
}

// Arma "<calle/barrio>, <ciudad>" a partir del desglose estructurado en vez de
// cortar display_name a ciegas: display_name trae distinta cantidad de
// niveles administrativos según la dirección (a veces la ciudad cae recién
// en la posición 4 o 5), así que tomar "los primeros 3 pedazos" a veces
// dejaba la ciudad afuera. Con el desglose, la ciudad siempre sale si
// Nominatim la tiene.
function nombreConCiudad(address: DireccionNominatim, displayName: string): string {
  const lugar = address.road || address.pedestrian || address.neighbourhood || address.suburb;
  const ciudad = address.city || address.town || address.village || address.municipality;

  if (lugar && ciudad && lugar !== ciudad) return `${lugar}, ${ciudad}`;
  if (ciudad) return ciudad;
  if (lugar) return lugar;
  return acortarNombre(displayName);
}

// Geocodificación inversa: dado un lat/lon real (el GPS del dispositivo),
// devuelve el nombre real del lugar en el que está parado el usuario —
// reemplaza a la vieja lista fija de 6 sectores conocidos, que solo ordenaba
// esos mismos 6 por cercanía en vez de decir de verdad dónde está.
// zoom=16 pide un nivel de detalle de barrio/sector (ni la casa exacta ni
// solo la ciudad); addressdetails=1 trae el desglose que arma nombreConCiudad.
export async function reverseGeocodificar(lat: number, lon: number): Promise<LugarBuscado | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&accept-language=es&zoom=16&addressdetails=1`,
    );
    if (!res.ok) return null;
    const data: unknown = await res.json();
    if (!data || typeof data !== "object" || !("display_name" in data)) return null;
    const { display_name, address } = data as {
      display_name: string;
      address?: DireccionNominatim;
    };
    return { nombre: address ? nombreConCiudad(address, display_name) : acortarNombre(display_name) };
  } catch {
    return null;
  }
}

// Solo el nombre de la ciudad/comuna (sin calle ni barrio) — zoom=10 pide un
// nivel de detalle de ciudad en vez de sector, a diferencia de
// reverseGeocodificar (zoom=16). Lo usa el clima, donde interesa "en qué
// ciudad estoy" y no la dirección exacta.
export async function obtenerCiudad(lat: number, lon: number): Promise<string | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&accept-language=es&zoom=10&addressdetails=1`,
    );
    if (!res.ok) return null;
    const data: unknown = await res.json();
    if (!data || typeof data !== "object" || !("address" in data)) return null;
    const address = (data as { address?: DireccionNominatim }).address;
    return address?.city || address?.town || address?.village || address?.municipality || null;
  } catch {
    return null;
  }
}

// Cache en memoria (dura mientras la pestaña esté abierta) para no golpear
// Nominatim de nuevo por cada patinador activo o cada ruta en la lista, que se
// re-renderizan seguido (el panel de Patinadores Activos re-consulta cada
// 15-20s). Redondear a 3 decimales (~110m) agrupa posiciones que en la
// práctica son el mismo lugar.
const cacheNombreLugar = new Map<string, string>();

function claveCache(lat: number, lon: number): string {
  return `${lat.toFixed(3)},${lon.toFixed(3)}`;
}

export async function reverseGeocodificarConCache(lat: number, lon: number): Promise<string | null> {
  const clave = claveCache(lat, lon);
  const cacheado = cacheNombreLugar.get(clave);
  if (cacheado) return cacheado;

  const resultado = await reverseGeocodificar(lat, lon);
  if (!resultado) return null;
  cacheNombreLugar.set(clave, resultado.nombre);
  return resultado.nombre;
}
