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
const ALTO = 1150;
const PADDING = 50;

// La tarjeta se dibuja con estas medidas "lógicas" (800x1150), pero se
// exporta al doble de resolución física — a 1x se veía pixelada en
// pantallas retina/alta densidad, que son la mayoría de los celulares hoy.
const ESCALA = 2;

const MAPA_X = 90;
const MAPA_Y = 335;
const MAPA_ANCHO = 620;
const MAPA_ALTO = 480;

const CAJA_RECORRIDO_Y = 250;
const CAJA_RECORRIDO_ALTO = 640; // hasta y = 890

const CAJA_STATS_Y = 920;
const CAJA_STATS_ALTO = 180; // hasta y = 1100

const DORADO = "#e7c168";
const DORADO_BORDE = "#c99a3d";
const GRIS_TEXTO = "#b8ada0";
const FONDO_CARD = "#0d0a06";
// Semi-transparente (en vez de sólido) para que la foto de fondo se asome
// también dentro de la caja "RECORRIDO" y de las casillas de estadísticas,
// no solo en los bordes de la tarjeta.
const FONDO_CAJA = "rgba(23,16,8,0.55)";

const TAM_TILE = 256;

function escapeXml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// --- Proyección Web Mercator (la misma que usan los tiles estilo OSM/Carto) ---
function lonAPixelX(lon: number, zoom: number): number {
  return ((lon + 180) / 360) * TAM_TILE * 2 ** zoom;
}
function latAPixelY(lat: number, zoom: number): number {
  const rad = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * TAM_TILE * 2 ** zoom;
}

// Elige el zoom más alto (más detalle) tal que el recorrido completo entre
// dentro del recuadro del mapa, dejando aire alrededor (no pegado a los bordes).
function elegirZoom(minLat: number, maxLat: number, minLon: number, maxLon: number): number {
  const MARGEN = 0.78;
  for (let z = 18; z >= 3; z--) {
    const spanX = lonAPixelX(maxLon, z) - lonAPixelX(minLon, z);
    const spanY = latAPixelY(minLat, z) - latAPixelY(maxLat, z);
    if (spanX <= MAPA_ANCHO * MARGEN && spanY <= MAPA_ALTO * MARGEN) return z;
  }
  return 3;
}

interface TileParaDibujar {
  x: number;
  y: number;
  destX: number;
  destY: number;
}

function calcularTilesNecesarios(centroPxX: number, centroPxY: number, zoom: number): TileParaDibujar[] {
  const maxTile = 2 ** zoom;
  const inicioPxX = centroPxX - MAPA_ANCHO / 2;
  const inicioPxY = centroPxY - MAPA_ALTO / 2;
  const finPxX = centroPxX + MAPA_ANCHO / 2;
  const finPxY = centroPxY + MAPA_ALTO / 2;

  const tileXInicio = Math.floor(inicioPxX / TAM_TILE);
  const tileXFin = Math.floor((finPxX - 1) / TAM_TILE);
  const tileYInicio = Math.floor(inicioPxY / TAM_TILE);
  const tileYFin = Math.floor((finPxY - 1) / TAM_TILE);

  const tiles: TileParaDibujar[] = [];
  for (let ty = tileYInicio; ty <= tileYFin; ty++) {
    for (let tx = tileXInicio; tx <= tileXFin; tx++) {
      const tileXNorm = ((tx % maxTile) + maxTile) % maxTile; // por si el recuadro cruza el antimeridiano
      tiles.push({
        x: tileXNorm,
        y: ty,
        destX: tx * TAM_TILE - inicioPxX,
        destY: ty * TAM_TILE - inicioPxY,
      });
    }
  }
  return tiles;
}

// "@2x" pide la variante de doble resolución del mismo tile (512x512 en vez
// de 256x256 cubriendo la misma zona) — sin esto, el mapa se veía pixelado
// al exportar la tarjeta a resolución retina (ver ESCALA más abajo).
async function cargarTileComoImagen(zoom: number, x: number, y: number): Promise<HTMLImageElement | null> {
  const url = `https://basemaps.cartocdn.com/dark_all/${zoom}/${x}/${y}@2x.png`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const lector = new FileReader();
      lector.onload = () => resolve(lector.result as string);
      lector.onerror = () => reject(new Error("no se pudo leer el tile"));
      lector.readAsDataURL(blob);
    });
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("no se pudo cargar el tile"));
      img.src = dataUrl;
    });
  } catch {
    return null;
  }
}

interface MapaGenerado {
  dataUrl: string;
  zoom: number;
  centroPxX: number;
  centroPxY: number;
}

// Compone el mapa real (tiles oscuros estilo Carto Dark Matter, gratis y sin
// API key) del recuadro del recorrido en un canvas aparte, para insertarlo
// como <image> dentro del SVG principal. Los tiles se piden con fetch() (no
// con <img>), así se pueden convertir a data URL sin "manchar" el canvas
// final con contenido cross-origin. Si no hay conexión o los tiles no
// cargan, devuelve null y el llamador usa un mapa vectorial de respaldo —
// la tarjeta nunca se rompe por esto.
async function generarMapaReal(puntos: PuntoGps[]): Promise<MapaGenerado | null> {
  try {
    const lats = puntos.map((p) => p.lat);
    const lons = puntos.map((p) => p.lon);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);

    const zoom = elegirZoom(minLat, maxLat, minLon, maxLon);
    const centroPxX = lonAPixelX((minLon + maxLon) / 2, zoom);
    const centroPxY = latAPixelY((minLat + maxLat) / 2, zoom);

    const tiles = calcularTilesNecesarios(centroPxX, centroPxY, zoom);
    if (tiles.length === 0 || tiles.length > 30) return null;

    const imagenes = await Promise.all(tiles.map((t) => cargarTileComoImagen(zoom, t.x, t.y)));
    if (imagenes.every((img) => img === null)) return null;

    // El canvas de composición va al doble de tamaño (los tiles @2x ya vienen
    // a esa resolución), para que el mapa se vea nítido en la tarjeta final
    // exportada a resolución retina.
    const canvas = document.createElement("canvas");
    canvas.width = MAPA_ANCHO * ESCALA;
    canvas.height = MAPA_ALTO * ESCALA;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#1a1108";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    tiles.forEach((t, i) => {
      const img = imagenes[i];
      if (img) ctx.drawImage(img, t.destX * ESCALA, t.destY * ESCALA, TAM_TILE * ESCALA, TAM_TILE * ESCALA);
    });

    return { dataUrl: canvas.toDataURL("image/png"), zoom, centroPxX, centroPxY };
  } catch {
    return null;
  }
}

function iconoDistancia(cx: number, y: number): string {
  return `<g transform="translate(${cx - 15}, ${y})"><path d="M15 2c-5 0-9 4-9 9 0 6.5 9 16 9 16s9-9.5 9-16c0-5-4-9-9-9zm0 12.5a3.5 3.5 0 110-7 3.5 3.5 0 010 7z" fill="none" stroke="${DORADO}" stroke-width="1.8"/></g>`;
}
function iconoTiempo(cx: number, y: number): string {
  return `<g transform="translate(${cx - 15}, ${y})"><circle cx="15" cy="15" r="11.5" fill="none" stroke="${DORADO}" stroke-width="1.8"/><path d="M15 8v7l5 3" fill="none" stroke="${DORADO}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></g>`;
}
function iconoVelocidad(cx: number, y: number): string {
  return `<g transform="translate(${cx - 15}, ${y})"><path d="M3 19a12 12 0 0124 0" fill="none" stroke="${DORADO}" stroke-width="1.8" stroke-linecap="round"/><path d="M15 19l5.5-7.5" stroke="${DORADO}" stroke-width="1.8" stroke-linecap="round"/><circle cx="15" cy="19" r="2" fill="${DORADO}"/></g>`;
}
function iconoRayo(cx: number, y: number): string {
  return `<g transform="translate(${cx - 15}, ${y})"><path d="M16.5 1L5 18h7l-1.5 11L23 12h-7l1-11z" fill="${DORADO}"/></g>`;
}

function construirSvg(
  datos: DatosTarjetaRecorrido,
  logoDataUrl: string | null,
  fondoDataUrl: string | null,
  mapa: MapaGenerado | null,
): string {
  const { puntos } = datos;

  const lats = puntos.map((p) => p.lat);
  const lons = puntos.map((p) => p.lon);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const rangoLat = maxLat - minLat || 0.0001;
  const rangoLon = maxLon - minLon || 0.0001;

  // Proyección de cada punto a coordenadas de píxel DENTRO del recuadro del
  // mapa. Si hay mapa real, usa la misma proyección Web Mercator que los
  // tiles (para que el trazo calce con las calles); si no, un mapeo lineal
  // simple del recuadro geográfico como respaldo.
  const margenInterno = 36;
  let x: (lon: number) => number;
  let y: (lat: number) => number;
  if (mapa) {
    x = (lon: number) => MAPA_X + (lonAPixelX(lon, mapa.zoom) - mapa.centroPxX + MAPA_ANCHO / 2);
    y = (lat: number) => MAPA_Y + (latAPixelY(lat, mapa.zoom) - mapa.centroPxY + MAPA_ALTO / 2);
  } else {
    x = (lon: number) =>
      MAPA_X + margenInterno + ((lon - minLon) / rangoLon) * (MAPA_ANCHO - margenInterno * 2);
    y = (lat: number) =>
      MAPA_Y + margenInterno + ((maxLat - lat) / rangoLat) * (MAPA_ALTO - margenInterno * 2);
  }

  const inicio = puntos[0];
  const fin = puntos[puntos.length - 1];
  const trazo = puntos.map((p) => `${x(p.lon)},${y(p.lat)}`).join(" ");

  const mapaFondoSvg = mapa
    ? `<image href="${mapa.dataUrl}" x="${MAPA_X}" y="${MAPA_Y}" width="${MAPA_ANCHO}" height="${MAPA_ALTO}" preserveAspectRatio="none"/>`
    : `<rect x="${MAPA_X}" y="${MAPA_Y}" width="${MAPA_ANCHO}" height="${MAPA_ALTO}" fill="#1a1108"/>`;

  const atribucionSvg = mapa
    ? `<text x="${MAPA_X + MAPA_ANCHO - 8}" y="${MAPA_Y + MAPA_ALTO - 8}" text-anchor="end" font-family="Arial, sans-serif" font-size="9" fill="#8a8177" opacity="0.85">© OpenStreetMap, © CARTO</text>`
    : "";

  const stats = [
    { valor: `${datos.distanciaKm.toFixed(2)} km`, etiqueta: "DISTANCIA", icono: iconoDistancia },
    { valor: `${Math.round(datos.duracionSeg / 60)} min`, etiqueta: "TIEMPO TOTAL", icono: iconoTiempo },
    { valor: `${Math.round(datos.velocidadPromedio)} km/h`, etiqueta: "VEL. PROMEDIO", icono: iconoVelocidad },
    { valor: `${Math.round(datos.velocidadMaxima)} km/h`, etiqueta: "VEL. MÁXIMA", icono: iconoRayo },
  ];

  // Cada estadística en su propia caja con resplandor dorado (al usuario le
  // encantó ese efecto y pidió repetirlo aquí en vez de un solo bloque con
  // simples líneas separadoras).
  const ESPACIO_ENTRE_CAJAS = 14;
  const anchoCaja = (ANCHO - PADDING * 2 - ESPACIO_ENTRE_CAJAS * (stats.length - 1)) / stats.length;
  const iconoY = CAJA_STATS_Y + 26;
  const valorY = CAJA_STATS_Y + 102;
  const etiquetaY = CAJA_STATS_Y + 128;

  const statsSvg = stats
    .map((s, i) => {
      const cajaX = PADDING + i * (anchoCaja + ESPACIO_ENTRE_CAJAS);
      const cx = cajaX + anchoCaja / 2;
      return `
        <rect x="${cajaX}" y="${CAJA_STATS_Y}" width="${anchoCaja}" height="${CAJA_STATS_ALTO}" rx="16" fill="${FONDO_CAJA}" stroke="${DORADO_BORDE}" stroke-width="1.5" opacity="0.9" filter="url(#resplandorDorado)"/>
        <rect x="${cajaX}" y="${CAJA_STATS_Y}" width="${anchoCaja}" height="${CAJA_STATS_ALTO}" rx="16" fill="${FONDO_CAJA}" stroke="${DORADO_BORDE}" stroke-width="1.2"/>
        ${s.icono(cx, iconoY)}
        <text x="${cx}" y="${valorY}" text-anchor="middle" font-family="Arial, sans-serif" font-size="34" font-weight="800" fill="${DORADO}">${escapeXml(s.valor)}</text>
        <text x="${cx}" y="${etiquetaY}" text-anchor="middle" font-family="Arial, sans-serif" font-size="17" font-weight="600" letter-spacing="0.3" fill="${GRIS_TEXTO}">${escapeXml(s.etiqueta)}</text>
      `;
    })
    .join("");

  // El título y el comentario del usuario ya viajan aparte (como texto de la
  // publicación en Post, o como texto del panel nativo al compartir a redes)
  // — a pedido del usuario, ya no se dibujan encima de la imagen misma.

  const TAM_LOGO = 150;
  const LOGO_Y = 32;
  const marcaSvg = logoDataUrl
    ? `<image href="${logoDataUrl}" x="${ANCHO / 2 - TAM_LOGO / 2}" y="${LOGO_Y}" width="${TAM_LOGO}" height="${TAM_LOGO}" />`
    : `<text x="${ANCHO / 2}" y="${LOGO_Y + TAM_LOGO / 2 + 13}" text-anchor="middle" font-family="Arial, sans-serif" font-size="42" font-weight="800" fill="${DORADO}" letter-spacing="2">LEGIÓN ROLLER</text>`;

  return `
    <svg width="${ANCHO * ESCALA}" height="${ALTO * ESCALA}" viewBox="0 0 ${ANCHO} ${ALTO}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="resplandorDorado" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="5" result="blur"/>
          <feMerge>
            <feMergeNode in="blur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>

      <clipPath id="marcoTarjeta">
        <rect width="${ANCHO}" height="${ALTO}" rx="26"/>
      </clipPath>
      <g clip-path="url(#marcoTarjeta)">
        ${
          fondoDataUrl
            ? `<image href="${fondoDataUrl}" x="0" y="0" width="${ANCHO}" height="${ALTO}" preserveAspectRatio="xMidYMax slice"/>
               <rect width="${ANCHO}" height="${ALTO}" fill="${FONDO_CARD}" opacity="0.55"/>`
            : `<rect width="${ANCHO}" height="${ALTO}" fill="${FONDO_CARD}"/>`
        }
      </g>
      <rect x="14" y="14" width="${ANCHO - 28}" height="${ALTO - 28}" rx="26" fill="none" stroke="${DORADO_BORDE}" stroke-width="2" opacity="0.55" filter="url(#resplandorDorado)"/>
      <rect x="14" y="14" width="${ANCHO - 28}" height="${ALTO - 28}" rx="26" fill="none" stroke="${DORADO_BORDE}" stroke-width="1.5"/>

      ${marcaSvg}
      <text x="${ANCHO / 2}" y="218" text-anchor="middle" font-family="Arial, sans-serif" font-size="23" font-weight="600" fill="#f2ead8">${escapeXml(datos.fecha)}<tspan fill="${DORADO}"> · </tspan><tspan fill="${GRIS_TEXTO}" font-weight="400" font-size="19">${escapeXml(datos.sector)}</tspan></text>

      <rect x="${PADDING}" y="${CAJA_RECORRIDO_Y}" width="${ANCHO - PADDING * 2}" height="${CAJA_RECORRIDO_ALTO}" rx="18" fill="${FONDO_CAJA}" stroke="${DORADO_BORDE}" stroke-width="1.5" opacity="0.9" filter="url(#resplandorDorado)"/>
      <rect x="${PADDING}" y="${CAJA_RECORRIDO_Y}" width="${ANCHO - PADDING * 2}" height="${CAJA_RECORRIDO_ALTO}" rx="18" fill="${FONDO_CAJA}" stroke="${DORADO_BORDE}" stroke-width="1.2"/>

      <text x="${ANCHO / 2}" y="${CAJA_RECORRIDO_Y + 40}" text-anchor="middle" font-family="Arial, sans-serif" font-size="20" font-weight="700" letter-spacing="2" fill="${DORADO}">RECORRIDO</text>

      <clipPath id="recorteMapa">
        <rect x="${MAPA_X}" y="${MAPA_Y}" width="${MAPA_ANCHO}" height="${MAPA_ALTO}" rx="14"/>
      </clipPath>
      <g clip-path="url(#recorteMapa)">
        ${mapaFondoSvg}
        <polyline points="${trazo}" fill="none" stroke="${DORADO}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="${x(inicio.lon)}" cy="${y(inicio.lat)}" r="10" fill="#5fae4e" stroke="#0d0a06" stroke-width="3"/>
        <circle cx="${x(fin.lon)}" cy="${y(fin.lat)}" r="10" fill="#d8342f" stroke="#0d0a06" stroke-width="3"/>
        ${atribucionSvg}
      </g>
      <rect x="${MAPA_X}" y="${MAPA_Y}" width="${MAPA_ANCHO}" height="${MAPA_ALTO}" rx="14" fill="none" stroke="${DORADO_BORDE}" stroke-width="1.2" opacity="0.8"/>

      <circle cx="${ANCHO / 2 - 55}" cy="${MAPA_Y + MAPA_ALTO + 35}" r="6" fill="#5fae4e"/>
      <text x="${ANCHO / 2 - 42}" y="${MAPA_Y + MAPA_ALTO + 40}" font-family="Arial, sans-serif" font-size="15" font-weight="600" fill="#f2ead8">INICIO</text>
      <circle cx="${ANCHO / 2 + 20}" cy="${MAPA_Y + MAPA_ALTO + 35}" r="6" fill="#d8342f"/>
      <text x="${ANCHO / 2 + 33}" y="${MAPA_Y + MAPA_ALTO + 40}" font-family="Arial, sans-serif" font-size="15" font-weight="600" fill="#f2ead8">FIN</text>

      ${statsSvg}
    </svg>
  `;
}

// Convierte una imagen propia (misma app, sin problema de CORS) a data URL,
// para poder incrustarla dentro del SVG con <image href="...">. Si falla por
// lo que sea, devuelve null y quien la use cae a su respaldo — nunca rompe
// la generación de la tarjeta.
function cargarImagenComoDataUrl(ruta: string): Promise<string | null> {
  return fetch(ruta)
    .then((res) => (res.ok ? res.blob() : Promise.reject(new Error("no encontrada: " + ruta))))
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

// Genera la tarjeta visual del recorrido (mapa real oscuro + trazo dorado +
// estadísticas + logo) como PNG, dibujando un SVG en un canvas. Los tiles del
// mapa se piden con fetch() (no con <img>), lo que evita el problema clásico
// de "canvas tainted by cross-origin data" que aparecería si se intentaran
// dibujar tiles directamente como imágenes cross-origin sin ese paso.
export async function generarTarjetaRecorrido(datos: DatosTarjetaRecorrido): Promise<Blob> {
  const [logoDataUrl, fondoDataUrl, mapa] = await Promise.all([
    cargarImagenComoDataUrl("/logo-legion-roller-mini.png"),
    cargarImagenComoDataUrl("/fondo-mis-rutas.jpg"),
    generarMapaReal(datos.puntos),
  ]);
  const svg = construirSvg(datos, logoDataUrl, fondoDataUrl, mapa);
  const svgDataUrl = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = ANCHO * ESCALA;
      canvas.height = ALTO * ESCALA;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("No se pudo generar la imagen"));
        return;
      }
      // El propio SVG ya declara width/height al doble de tamaño (con el
      // viewBox lógico sin cambiar), así que el navegador lo rasteriza nítido
      // directamente a esa resolución — no es un simple estirado de una
      // imagen ya rasterizada en baja resolución.
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
