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

// Geocodificación inversa: dado un lat/lon real (el GPS del dispositivo),
// devuelve el nombre real del lugar en el que está parado el usuario —
// reemplaza a la vieja lista fija de 6 sectores conocidos, que solo ordenaba
// esos mismos 6 por cercanía en vez de decir de verdad dónde está.
// zoom=16 pide un nivel de detalle de barrio/sector (ni la casa exacta ni
// solo la ciudad).
export async function reverseGeocodificar(lat: number, lon: number): Promise<LugarBuscado | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&accept-language=es&zoom=16`,
    );
    if (!res.ok) return null;
    const data: unknown = await res.json();
    if (!data || typeof data !== "object" || !("display_name" in data)) return null;
    return { nombre: acortarNombre((data as { display_name: string }).display_name) };
  } catch {
    return null;
  }
}
