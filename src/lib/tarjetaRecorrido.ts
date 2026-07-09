import type { PuntoGps } from "./geo";

export interface DatosTarjetaRecorrido {
  puntos: PuntoGps[];
  distanciaKm: number;
  duracionSeg: number;
  velocidadPromedio: number;
  velocidadMaxima: number;
  fecha: string;
  sector: string;
  titulo?: string;
  comentario?: string;
}

const ANCHO = 800;
const ALTO = 1000;
const PADDING = 60;
const MAPA_ALTO = 420;
const MAPA_Y = 190;

function escapeXml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function construirSvg(datos: DatosTarjetaRecorrido, logoDataUrl: string | null): string {
  const { puntos } = datos;
  const mapaAncho = ANCHO - PADDING * 2;

  const lats = puntos.map((p) => p.lat);
  const lons = puntos.map((p) => p.lon);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const rangoLat = maxLat - minLat || 0.0001;
  const rangoLon = maxLon - minLon || 0.0001;

  // Deja un margen dentro del recuadro del mapa para que el trazo no toque los bordes.
  const margenInterno = 40;
  const x = (lon: number) =>
    PADDING + margenInterno + ((lon - minLon) / rangoLon) * (mapaAncho - margenInterno * 2);
  const y = (lat: number) =>
    MAPA_Y + margenInterno + ((maxLat - lat) / rangoLat) * (MAPA_ALTO - margenInterno * 2);

  const inicio = puntos[0];
  const fin = puntos[puntos.length - 1];
  const trazo = puntos.map((p) => `${x(p.lon)},${y(p.lat)}`).join(" ");

  const stats = [
    { valor: `${datos.distanciaKm.toFixed(2)} km`, etiqueta: "DISTANCIA" },
    { valor: `${Math.round(datos.duracionSeg / 60)} min`, etiqueta: "TIEMPO TOTAL" },
    { valor: `${Math.round(datos.velocidadPromedio)} km/h`, etiqueta: "VEL. PROMEDIO" },
    { valor: `${Math.round(datos.velocidadMaxima)} km/h`, etiqueta: "VEL. MÁXIMA" },
  ];

  const anchoStat = mapaAncho / stats.length;
  const statsY = MAPA_Y + MAPA_ALTO + 70;

  const statsSvg = stats
    .map((s, i) => {
      const cx = PADDING + anchoStat * i + anchoStat / 2;
      return `
        <text x="${cx}" y="${statsY}" text-anchor="middle" font-family="Arial, sans-serif" font-size="34" font-weight="700" fill="#e7c168">${escapeXml(s.valor)}</text>
        <text x="${cx}" y="${statsY + 28}" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" letter-spacing="1" fill="#b8ada0">${escapeXml(s.etiqueta)}</text>
      `;
    })
    .join("");

  const tituloSvg = datos.titulo
    ? `<text x="${ANCHO / 2}" y="${statsY + 90}" text-anchor="middle" font-family="Arial, sans-serif" font-size="30" font-weight="700" fill="#f2ead8">${escapeXml(datos.titulo)}</text>`
    : "";

  const comentarioSvg = datos.comentario
    ? `<text x="${ANCHO / 2}" y="${statsY + (datos.titulo ? 130 : 95)}" text-anchor="middle" font-family="Arial, sans-serif" font-size="22" fill="#b8ada0">${escapeXml(datos.comentario)}</text>`
    : "";

  const TAM_LOGO = 90;
  const marcaSvg = logoDataUrl
    ? `<image href="${logoDataUrl}" x="${ANCHO / 2 - TAM_LOGO / 2}" y="18" width="${TAM_LOGO}" height="${TAM_LOGO}" />`
    : `<text x="${ANCHO / 2}" y="72" text-anchor="middle" font-family="Arial, sans-serif" font-size="42" font-weight="800" fill="#e7c168" letter-spacing="2">LEGIÓN ROLLER</text>`;
  const fechaY = logoDataUrl ? TAM_LOGO + 45 : 125;

  return `
    <svg width="${ANCHO}" height="${ALTO}" viewBox="0 0 ${ANCHO} ${ALTO}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${ANCHO}" height="${ALTO}" fill="#171008" />
      ${marcaSvg}
      <text x="${ANCHO / 2}" y="${fechaY}" text-anchor="middle" font-family="Arial, sans-serif" font-size="22" fill="#b8ada0">${escapeXml(datos.fecha)} · ${escapeXml(datos.sector)}</text>
      <rect x="${PADDING}" y="${MAPA_Y}" width="${mapaAncho}" height="${MAPA_ALTO}" rx="20" fill="#241a10" stroke="#3a2c1a" stroke-width="2" />
      <polyline points="${trazo}" fill="none" stroke="#C99A3D" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" />
      <circle cx="${x(inicio.lon)}" cy="${y(inicio.lat)}" r="11" fill="#5fae4e" stroke="#171008" stroke-width="3" />
      <circle cx="${x(fin.lon)}" cy="${y(fin.lat)}" r="11" fill="#d8342f" stroke="#171008" stroke-width="3" />
      ${statsSvg}
      ${tituloSvg}
      ${comentarioSvg}
    </svg>
  `;
}

function cargarLogoDataUrl(): Promise<string | null> {
  return fetch("/logo-legion-roller-mini.png")
    .then((res) => (res.ok ? res.blob() : Promise.reject(new Error("logo no encontrado"))))
    .then(
      (blob) =>
        new Promise<string | null>((resolve) => {
          const lector = new FileReader();
          lector.onload = () => resolve(typeof lector.result === "string" ? lector.result : null);
          lector.onerror = () => resolve(null);
          lector.readAsDataURL(blob);
        }),
    )
    .catch(() => null);
}

// Genera la tarjeta visual del recorrido (mapa vectorial + estadísticas + logo)
// como PNG, dibujando un SVG en un canvas — así se evita el problema clásico de
// "canvas tainted by cross-origin data" que ocurriría si intentáramos capturar
// tiles reales de OpenStreetMap con html2canvas.
export async function generarTarjetaRecorrido(datos: DatosTarjetaRecorrido): Promise<Blob> {
  const logoDataUrl = await cargarLogoDataUrl();
  const svg = construirSvg(datos, logoDataUrl);
  const svgDataUrl = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = ANCHO;
      canvas.height = ALTO;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("No se pudo generar la imagen"));
        return;
      }
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("No se pudo generar la imagen"));
      }, "image/png");
    };
    img.onerror = () => reject(new Error("No se pudo generar la imagen"));
    img.src = svgDataUrl;
  });
}
