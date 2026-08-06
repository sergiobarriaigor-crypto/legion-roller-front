// HTML de los marcadores del Mapa, compartido entre el renderizado Leaflet
// (MapaView.tsx, envuelto en L.divIcon) y el modo 3D (Mapa3D.tsx, MapLibre,
// que solo necesita un elemento HTML plano) -- son strings de HTML sin nada
// específico de ninguna de las dos librerías, así que viven en un módulo
// aparte para no duplicarlos ni crear una dependencia circular entre ambos
// componentes.

export function escapeHtml(texto: string) {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Colores neón por modo: verde = en ruta, rojo = solo patinando ahora.
export const GLOW_POR_MODO: Record<string, { anillo: string; sombra: string }> = {
  ruta: { anillo: "#39FF14", sombra: "rgba(57, 255, 20, 0.85)" },
  patinando: { anillo: "#FF3131", sombra: "rgba(255, 49, 49, 0.85)" },
};

export function htmlPuntoSimple(color: string) {
  return `<div style="width:16px;height:16px;border-radius:9999px;background:${color};border:2px solid #171008;box-shadow:0 0 0 2px rgba(201,154,61,0.55);"></div>`;
}

// Punto de partida de una rodada/evento (mismo dorado que el selector de mapa
// del Admin), visible en el Mapa solo para quien respondió "Voy"/"Tal vez".
export const HTML_PUNTO_PARTIDA =
  '<div style="width:22px;height:22px;border-radius:9999px;background:#e7c168;border:2px solid #171008;box-shadow:0 0 8px 2px rgba(231,193,104,0.85);"></div>';

export const TAM_AVATAR = 40;

// Avatar circular (foto o inicial) con burbuja de estado opcional y un borde
// con brillo (glow) según el modo del miembro.
export function htmlIconoAvatar({
  fotoUrl,
  nombre,
  estado,
  modo,
  masPersonas,
}: {
  fotoUrl: string | null;
  nombre: string;
  estado?: string | null;
  modo: string;
  masPersonas?: number;
}) {
  const TAM = TAM_AVATAR;
  const { anillo, sombra } = GLOW_POR_MODO[modo] ?? GLOW_POR_MODO.patinando;
  const inicial = escapeHtml((nombre.charAt(0) || "?").toUpperCase());
  const contenido = fotoUrl
    ? `<img src="${escapeHtml(fotoUrl)}" style="width:100%;height:100%;object-fit:cover;" />`
    : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-weight:600;color:#171008;">${inicial}</div>`;

  const burbuja = estado
    ? `<div style="position:absolute;bottom:${TAM + 6}px;left:50%;transform:translateX(-50%);max-width:110px;background:#171008;color:#f2ead8;font-size:10px;line-height:1.25;padding:4px 8px;border-radius:10px;text-align:center;box-shadow:0 1px 4px rgba(0,0,0,0.4);">${escapeHtml(estado)}</div>`
    : "";

  // Insignia "+N": cuando este marcador representa a varios patinadores
  // agrupados por estar en el mismo punto, en vez de quedar todos
  // superpuestos e inidentificables se ve uno solo con este contador.
  const insignia = masPersonas
    ? `<div style="position:absolute;right:-4px;bottom:-4px;min-width:18px;height:18px;padding:0 3px;border-radius:9999px;background:#171008;border:1.5px solid #c99a3d;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#e7c168;">+${masPersonas}</div>`
    : "";

  return `
    <div style="position:relative;width:${TAM}px;height:${TAM}px;">
      ${burbuja}
      <div style="width:${TAM}px;height:${TAM}px;border-radius:9999px;background:#e7c168;border:2px solid ${anillo};box-shadow:0 0 8px 2px ${sombra},0 0 3px 1px ${sombra};overflow:hidden;">
        ${contenido}
      </div>
      ${insignia}
    </div>
  `;
}
