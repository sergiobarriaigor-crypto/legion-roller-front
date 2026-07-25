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
