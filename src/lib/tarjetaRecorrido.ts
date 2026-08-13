import { distanciaHaversineKm, velocidadMaximaConPunto, type PuntoGps } from "./geo";
import { cargarImagenComoDataUrl } from "./imagenDataUrl";

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

// Posiciones verticales + padding horizontal como un solo objeto -- permite
// que generarTarjetaRecorrido() (imagen fija de Post) use una versión más
// "compacta" sin tocar generarVideoRecorrido(), que sigue usando
// LAYOUT_DEFECTO (los mismos números de siempre). El ancho/alto del mapa
// satelital en sí (MAPA_ANCHO/MAPA_ALTO de arriba) no cambia entre layouts
// -- generarMapaReal() sigue pidiendo los mismos tiles siempre; en el layout
// compacto la imagen resultante se dibuja apenas más baja (~6%), un ajuste
// imperceptible, en vez de volver a calcular zoom/tiles.
interface LayoutTarjeta {
  alto: number;
  padding: number;
  mapaY: number;
  mapaAlto: number;
  cajaRecorridoY: number;
  cajaRecorridoAlto: number;
  cajaStatsY: number;
  cajaStatsAlto: number;
  tamLogo: number;
  logoY: number;
  fechaY: number;
}

const LAYOUT_DEFECTO: LayoutTarjeta = {
  alto: ALTO,
  padding: PADDING,
  mapaY: MAPA_Y,
  mapaAlto: MAPA_ALTO,
  cajaRecorridoY: CAJA_RECORRIDO_Y,
  cajaRecorridoAlto: CAJA_RECORRIDO_ALTO,
  cajaStatsY: CAJA_STATS_Y,
  cajaStatsAlto: CAJA_STATS_ALTO,
  tamLogo: 150,
  logoY: 32,
  fechaY: 218,
};

// Layout usado solo por generarTarjetaRecorrido(): además del margen más
// angosto ya pedido antes, baja la altura total de 1150 a 1000 -- con el
// ancho fijo en 800, eso da una proporción 4:5 (0.8), que es exactamente el
// límite RATIO_MIN que ya usa CarruselFotos.tsx en el feed de Post/Comunidad/
// Impulsa para decidir cuánto recortar una foto vertical. Con 1150 (0.696)
// quedaba por debajo de ese límite y el feed recortaba el logo arriba y las
// estadísticas abajo con object-cover; a 0.8 entra justo, sin recorte.
const LAYOUT_COMPACTO: LayoutTarjeta = {
  alto: 1000,
  padding: 26,
  mapaY: 255,
  mapaAlto: 450,
  cajaRecorridoY: 170,
  cajaRecorridoAlto: 617,
  cajaStatsY: 803,
  cajaStatsAlto: 180,
  tamLogo: 90,
  logoY: 16,
  fechaY: 140,
};

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
// dentro del recuadro del mapa, dejando aire alrededor (no pegado a los
// bordes). anchoDestino/altoDestino parametrizados (en vez de MAPA_ANCHO/
// MAPA_ALTO fijos) para que el mismo cálculo sirva tanto para el recuadro
// chico de la tarjeta como para el video a pantalla completa (ver
// generarMapaReal más abajo).
function elegirZoom(
  minLat: number,
  maxLat: number,
  minLon: number,
  maxLon: number,
  anchoDestino: number,
  altoDestino: number,
): number {
  const MARGEN = 0.78;
  for (let z = 18; z >= 3; z--) {
    const spanX = lonAPixelX(maxLon, z) - lonAPixelX(minLon, z);
    const spanY = latAPixelY(minLat, z) - latAPixelY(maxLat, z);
    if (spanX <= anchoDestino * MARGEN && spanY <= altoDestino * MARGEN) return z;
  }
  return 3;
}

interface TileParaDibujar {
  x: number;
  y: number;
  destX: number;
  destY: number;
}

function calcularTilesNecesarios(
  centroPxX: number,
  centroPxY: number,
  zoom: number,
  anchoDestino: number,
  altoDestino: number,
): TileParaDibujar[] {
  const maxTile = 2 ** zoom;
  const inicioPxX = centroPxX - anchoDestino / 2;
  const inicioPxY = centroPxY - altoDestino / 2;
  const finPxX = centroPxX + anchoDestino / 2;
  const finPxY = centroPxY + altoDestino / 2;

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

// Mismas dos capas satelitales que usa el mapa en vivo (MapaView.tsx): Esri
// World Imagery (la foto satelital en sí) + Reference/World_Boundaries_and_Places
// (calles/nombres transparente encima, para no perder la orientación) — ambas
// gratis y sin API key. A diferencia de Carto, Esri no ofrece una variante
// "@2x" de mayor resolución; el tile de 256px se estira al doble (ESCALA) al
// dibujarlo, se ve un poco menos nítido que antes pero es la misma calidad
// que ya se ve en el mapa satelital dentro de la app.
const TILE_SATELITE_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const TILE_ETIQUETAS_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}";

function urlTile(plantilla: string, zoom: number, x: number, y: number): string {
  return plantilla.replace("{z}", String(zoom)).replace("{y}", String(y)).replace("{x}", String(x));
}

// Timeout explícito: sin esto, un fetch() colgado en una red de celular
// inestable (nunca resuelve ni rechaza) deja pendiente para siempre el
// Promise.all() de generarMapaReal(), trabando la generación de tarjeta o
// video sin ningún mensaje de error ni forma de reintentar.
const TIMEOUT_TILE_MS = 8000;

async function cargarTileComoImagen(url: string): Promise<HTMLImageElement | null> {
  try {
    const controlador = new AbortController();
    const idTimeout = setTimeout(() => controlador.abort(), TIMEOUT_TILE_MS);
    let res: Response;
    try {
      res = await fetch(url, { signal: controlador.signal });
    } finally {
      clearTimeout(idTimeout);
    }
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

// Compone el mapa real (satélite Esri + etiquetas, igual que MapaView.tsx)
// del recuadro del recorrido en un canvas aparte, para insertarlo como
// <image> dentro del SVG principal. Los tiles se piden con fetch() (no con
// <img>), así se pueden convertir a data URL sin "manchar" el canvas final
// con contenido cross-origin. Si no hay conexión o los tiles no cargan,
// devuelve null y el llamador usa un mapa vectorial de respaldo — la
// tarjeta nunca se rompe por esto.
async function generarMapaReal(
  puntos: PuntoGps[],
  anchoDestino: number,
  altoDestino: number,
): Promise<MapaGenerado | null> {
  try {
    const lats = puntos.map((p) => p.lat);
    const lons = puntos.map((p) => p.lon);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);

    const zoom = elegirZoom(minLat, maxLat, minLon, maxLon, anchoDestino, altoDestino);
    const centroPxX = lonAPixelX((minLon + maxLon) / 2, zoom);
    const centroPxY = latAPixelY((minLat + maxLat) / 2, zoom);

    const tiles = calcularTilesNecesarios(centroPxX, centroPxY, zoom, anchoDestino, altoDestino);
    if (tiles.length === 0 || tiles.length > 48) return null;

    const [imagenesBase, imagenesEtiquetas] = await Promise.all([
      Promise.all(tiles.map((t) => cargarTileComoImagen(urlTile(TILE_SATELITE_URL, zoom, t.x, t.y)))),
      Promise.all(tiles.map((t) => cargarTileComoImagen(urlTile(TILE_ETIQUETAS_URL, zoom, t.x, t.y)))),
    ]);
    if (imagenesBase.every((img) => img === null)) return null;

    // El canvas de composición va al doble de tamaño (ESCALA), para que el
    // mapa se vea nítido en la tarjeta final exportada a resolución retina
    // — los tiles satelitales de Esri no tienen variante "@2x" como Carto,
    // así que acá se estiran al dibujarse (misma nitidez que ya se ve en el
    // mapa satelital dentro de la app).
    const canvas = document.createElement("canvas");
    canvas.width = anchoDestino * ESCALA;
    canvas.height = altoDestino * ESCALA;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#1a1108";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    tiles.forEach((t, i) => {
      const base = imagenesBase[i];
      if (base) ctx.drawImage(base, t.destX * ESCALA, t.destY * ESCALA, TAM_TILE * ESCALA, TAM_TILE * ESCALA);
      const etiquetas = imagenesEtiquetas[i];
      if (etiquetas) ctx.drawImage(etiquetas, t.destX * ESCALA, t.destY * ESCALA, TAM_TILE * ESCALA, TAM_TILE * ESCALA);
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

// Estado de un cuadro de la animación del video: qué parte del trazo dibujar
// y qué valores de distancia/tiempo mostrar en ese instante. Si no se pasa
// (o se pasa undefined), construirSvg dibuja la tarjeta completa de siempre
// — así generarTarjetaRecorrido() no cambia en nada.
interface FrameAnimado {
  puntosTrazo: PuntoGps[];
  distanciaKm: number;
  duracionSeg: number;
  posicionActual: PuntoGps | null;
  mostrarFin: boolean;
}

function construirSvg(
  datos: DatosTarjetaRecorrido,
  logoDataUrl: string | null,
  fondoDataUrl: string | null,
  mapa: MapaGenerado | null,
  frame?: FrameAnimado,
  // LAYOUT_DEFECTO para generarVideoRecorrido() (no se le pasa nada, así que
  // sigue exactamente igual); generarTarjetaRecorrido() pasa LAYOUT_COMPACTO.
  layout: LayoutTarjeta = LAYOUT_DEFECTO,
): string {
  const { puntos } = datos;
  const { padding, alto, mapaY, mapaAlto, cajaRecorridoY, cajaRecorridoAlto, cajaStatsY, cajaStatsAlto, tamLogo, logoY, fechaY } = layout;

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
    y = (lat: number) => mapaY + (latAPixelY(lat, mapa.zoom) - mapa.centroPxY + mapaAlto / 2);
  } else {
    x = (lon: number) =>
      MAPA_X + margenInterno + ((lon - minLon) / rangoLon) * (MAPA_ANCHO - margenInterno * 2);
    y = (lat: number) =>
      mapaY + margenInterno + ((maxLat - lat) / rangoLat) * (mapaAlto - margenInterno * 2);
  }

  const inicio = puntos[0];
  const fin = puntos[puntos.length - 1];
  const puntosTrazo = frame?.puntosTrazo ?? puntos;
  const trazo = puntosTrazo.map((p) => `${x(p.lon)},${y(p.lat)}`).join(" ");
  const mostrarFin = frame?.mostrarFin ?? true;
  const posicionActual = frame?.posicionActual ?? null;

  const mapaFondoSvg = mapa
    ? `<image href="${mapa.dataUrl}" x="${MAPA_X}" y="${mapaY}" width="${MAPA_ANCHO}" height="${mapaAlto}" preserveAspectRatio="none"/>`
    : `<rect x="${MAPA_X}" y="${mapaY}" width="${MAPA_ANCHO}" height="${mapaAlto}" fill="#1a1108"/>`;

  const atribucionSvg = mapa
    ? `<text x="${MAPA_X + MAPA_ANCHO - 8}" y="${mapaY + mapaAlto - 8}" text-anchor="end" font-family="Arial, sans-serif" font-size="9" fill="#8a8177" opacity="0.85">© OpenStreetMap, © CARTO</text>`
    : "";

  // Durante la animación del video, distancia y tiempo van subiendo cuadro a
  // cuadro (frame.distanciaKm/duracionSeg); vel. promedio y máxima son
  // propiedades del recorrido completo y no tiene sentido "animarlas", se
  // muestran ya finales desde el primer cuadro.
  const distanciaMostrar = frame?.distanciaKm ?? datos.distanciaKm;
  const duracionMostrar = frame?.duracionSeg ?? datos.duracionSeg;
  const stats = [
    { valor: `${distanciaMostrar.toFixed(2)} km`, etiqueta: "DISTANCIA", icono: iconoDistancia },
    { valor: `${Math.round(duracionMostrar / 60)} min`, etiqueta: "TIEMPO TOTAL", icono: iconoTiempo },
    { valor: `${Math.round(datos.velocidadPromedio)} km/h`, etiqueta: "VEL. PROMEDIO", icono: iconoVelocidad },
    { valor: `${Math.round(datos.velocidadMaxima)} km/h`, etiqueta: "VEL. MÁXIMA", icono: iconoRayo },
  ];

  // Cada estadística en su propia caja con resplandor dorado (al usuario le
  // encantó ese efecto y pidió repetirlo aquí en vez de un solo bloque con
  // simples líneas separadoras).
  const ESPACIO_ENTRE_CAJAS = 14;
  const anchoCaja = (ANCHO - padding * 2 - ESPACIO_ENTRE_CAJAS * (stats.length - 1)) / stats.length;
  const iconoY = cajaStatsY + 26;
  const valorY = cajaStatsY + 102;
  const etiquetaY = cajaStatsY + 128;

  const statsSvg = stats
    .map((s, i) => {
      const cajaX = padding + i * (anchoCaja + ESPACIO_ENTRE_CAJAS);
      const cx = cajaX + anchoCaja / 2;
      return `
        <rect x="${cajaX}" y="${cajaStatsY}" width="${anchoCaja}" height="${cajaStatsAlto}" rx="16" fill="${FONDO_CAJA}" stroke="${DORADO_BORDE}" stroke-width="1.5" opacity="0.9" filter="url(#resplandorDorado)"/>
        <rect x="${cajaX}" y="${cajaStatsY}" width="${anchoCaja}" height="${cajaStatsAlto}" rx="16" fill="${FONDO_CAJA}" stroke="${DORADO_BORDE}" stroke-width="1.2"/>
        ${s.icono(cx, iconoY)}
        <text x="${cx}" y="${valorY}" text-anchor="middle" font-family="Arial, sans-serif" font-size="34" font-weight="800" fill="${DORADO}">${escapeXml(s.valor)}</text>
        <text x="${cx}" y="${etiquetaY}" text-anchor="middle" font-family="Arial, sans-serif" font-size="17" font-weight="600" letter-spacing="0.3" fill="${GRIS_TEXTO}">${escapeXml(s.etiqueta)}</text>
      `;
    })
    .join("");

  // El título y el comentario del usuario ya viajan aparte (como texto de la
  // publicación en Post, o como texto del panel nativo al compartir a redes)
  // — a pedido del usuario, ya no se dibujan encima de la imagen misma.

  const marcaSvg = logoDataUrl
    ? `<image href="${logoDataUrl}" x="${ANCHO / 2 - tamLogo / 2}" y="${logoY}" width="${tamLogo}" height="${tamLogo}" />`
    : `<text x="${ANCHO / 2}" y="${logoY + tamLogo / 2 + 13}" text-anchor="middle" font-family="Arial, sans-serif" font-size="42" font-weight="800" fill="${DORADO}" letter-spacing="2">LEGIÓN ROLLER</text>`;

  return `
    <svg width="${ANCHO * ESCALA}" height="${alto * ESCALA}" viewBox="0 0 ${ANCHO} ${alto}" xmlns="http://www.w3.org/2000/svg">
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
        <rect width="${ANCHO}" height="${alto}" rx="26"/>
      </clipPath>
      <g clip-path="url(#marcoTarjeta)">
        ${
          fondoDataUrl
            ? `<image href="${fondoDataUrl}" x="0" y="0" width="${ANCHO}" height="${alto}" preserveAspectRatio="xMidYMax slice"/>
               <rect width="${ANCHO}" height="${alto}" fill="${FONDO_CARD}" opacity="0.55"/>`
            : `<rect width="${ANCHO}" height="${alto}" fill="${FONDO_CARD}"/>`
        }
      </g>
      <rect x="14" y="14" width="${ANCHO - 28}" height="${alto - 28}" rx="26" fill="none" stroke="${DORADO_BORDE}" stroke-width="2" opacity="0.55" filter="url(#resplandorDorado)"/>
      <rect x="14" y="14" width="${ANCHO - 28}" height="${alto - 28}" rx="26" fill="none" stroke="${DORADO_BORDE}" stroke-width="1.5"/>

      ${marcaSvg}
      <text x="${ANCHO / 2}" y="${fechaY}" text-anchor="middle" font-family="Arial, sans-serif" font-size="23" font-weight="600" fill="#f2ead8">${escapeXml(datos.fecha)}<tspan fill="${DORADO}"> · </tspan><tspan fill="${GRIS_TEXTO}" font-weight="400" font-size="21">${escapeXml(datos.sector)}</tspan></text>

      <rect x="${padding}" y="${cajaRecorridoY}" width="${ANCHO - padding * 2}" height="${cajaRecorridoAlto}" rx="18" fill="${FONDO_CAJA}" stroke="${DORADO_BORDE}" stroke-width="1.5" opacity="0.9" filter="url(#resplandorDorado)"/>
      <rect x="${padding}" y="${cajaRecorridoY}" width="${ANCHO - padding * 2}" height="${cajaRecorridoAlto}" rx="18" fill="${FONDO_CAJA}" stroke="${DORADO_BORDE}" stroke-width="1.2"/>

      <text x="${ANCHO / 2}" y="${cajaRecorridoY + 40}" text-anchor="middle" font-family="Arial, sans-serif" font-size="20" font-weight="700" letter-spacing="2" fill="${DORADO}">RECORRIDO</text>

      <clipPath id="recorteMapa">
        <rect x="${MAPA_X}" y="${mapaY}" width="${MAPA_ANCHO}" height="${mapaAlto}" rx="14"/>
      </clipPath>
      <g clip-path="url(#recorteMapa)">
        ${mapaFondoSvg}
        <polyline points="${trazo}" fill="none" stroke="${DORADO}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="${x(inicio.lon)}" cy="${y(inicio.lat)}" r="10" fill="#5fae4e" stroke="#0d0a06" stroke-width="3"/>
        ${mostrarFin ? `<circle cx="${x(fin.lon)}" cy="${y(fin.lat)}" r="10" fill="#d8342f" stroke="#0d0a06" stroke-width="3"/>` : ""}
        ${posicionActual ? `<circle cx="${x(posicionActual.lon)}" cy="${y(posicionActual.lat)}" r="9" fill="${DORADO}" stroke="#0d0a06" stroke-width="3" filter="url(#resplandorDorado)"/>` : ""}
        ${atribucionSvg}
      </g>
      <rect x="${MAPA_X}" y="${mapaY}" width="${MAPA_ANCHO}" height="${mapaAlto}" rx="14" fill="none" stroke="${DORADO_BORDE}" stroke-width="1.2" opacity="0.8"/>

      <circle cx="${ANCHO / 2 - 68}" cy="${mapaY + mapaAlto + 36}" r="8" fill="#5fae4e"/>
      <text x="${ANCHO / 2 - 51}" y="${mapaY + mapaAlto + 42}" font-family="Arial, sans-serif" font-size="19" font-weight="700" fill="#f2ead8">INICIO</text>
      <circle cx="${ANCHO / 2 + 28}" cy="${mapaY + mapaAlto + 36}" r="8" fill="#d8342f"/>
      <text x="${ANCHO / 2 + 45}" y="${mapaY + mapaAlto + 42}" font-family="Arial, sans-serif" font-size="19" font-weight="700" fill="#f2ead8">FIN</text>

      ${statsSvg}
    </svg>
  `;
}

// Genera la tarjeta visual del recorrido (mapa real oscuro + trazo dorado +
// estadísticas + logo) como PNG, dibujando un SVG en un canvas. Los tiles del
// mapa se piden con fetch() (no con <img>), lo que evita el problema clásico
// de "canvas tainted by cross-origin data" que aparecería si se intentaran
// dibujar tiles directamente como imágenes cross-origin sin ese paso.
export async function generarTarjetaRecorrido(datos: DatosTarjetaRecorrido): Promise<Blob> {
  const [logoDataUrl, fondoDataUrl, mapa] = await Promise.all([
    cargarImagenComoDataUrl("/logo-legion-roller.png"),
    cargarImagenComoDataUrl("/fondo-mis-rutas.jpg"),
    generarMapaReal(datos.puntos, MAPA_ANCHO, MAPA_ALTO),
  ]);
  const svg = construirSvg(datos, logoDataUrl, fondoDataUrl, mapa, undefined, LAYOUT_COMPACTO);
  const svgDataUrl = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = ANCHO * ESCALA;
      canvas.height = LAYOUT_COMPACTO.alto * ESCALA;
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

// Estilo de la foto opcional del video: "final" la muestra a pantalla
// completa en el cuadro de cierre (como una portada); "mapa" la clava como
// un pin circular sobre el mapa, en el punto donde va la ruta (por defecto,
// la mitad del recorrido por distancia) -- se revela recién cuando el trazo
// animado llega a ese punto, igual que la marca de velocidad máxima.
export type EstiloFotoVideo = "final" | "mapa";

export interface OpcionesVideoRecorrido {
  // Duración de la animación (el trazo dibujándose + la cámara alejándose al
  // final) — NO la duración real del recorrido, que puede ser de horas.
  // Pensado para redes sociales, no para ver el paseo en tiempo real. Más
  // larga que antes a propósito: se ve más fluida, no hay apuro por cortarla
  // corta.
  duracionAnimSeg?: number;
  // Cuánto se mantiene congelado el cuadro final (panorámica completa, o la
  // foto de cierre si se eligió "final") antes de cortar el video.
  duracionFinalSeg?: number;
  fps?: number;
  onProgreso?: (fraccion: number) => void;
  // Foto opcional (nunca obligatoria) -- si no se pasa fotoDataUrl, el video
  // sigue igual pero sin ningún paso de foto.
  fotoDataUrl?: string;
  estiloFoto?: EstiloFotoVideo;
}

const DURACION_ANIM_SEG_DEFECTO = 11;
const DURACION_FINAL_SEG_DEFECTO = 3;
const FPS_DEFECTO = 24;

// Tamaño del video rediseñado: vertical 9:16 real (a diferencia de la
// tarjeta 800x1150), porque ya no hay marco de tarjeta -- el mapa ocupa la
// pantalla completa, así que tiene sentido usar la proporción real de un
// video para redes en vez de heredar la proporción de la tarjeta estática.
const ANCHO_VIDEO = 720;
const ALTO_VIDEO = 1280;

// La cámara "persigue" el punto actual con este acercamiento durante el
// dibujado del trazo (estilo Relive), y en el último tramo de la animación
// se aleja hasta volver a 1 (panorámica del recorrido completo). Es un zoom
// óptico sobre la MISMA imagen de mapa ya cargada (no se piden tiles nuevos
// por cuadro) -- barato de calcular, aunque pierde algo de nitidez cuanto
// más cerca, aceptable para un video comprimido.
const ESCALA_CAMARA_CERCANA = 1.35;
// Fracción de duracionAnimSeg en la que el trazo ya terminó de dibujarse y
// arranca el alejamiento final -- el resto (hasta 1) es pura transición de
// cámara, sin más avance de distancia/tiempo.
const FRACCION_TRAZO_COMPLETO = 0.82;

function suavizar(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

function elegirMimeTypeVideo(): string {
  const candidatos = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  for (const candidato of candidatos) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(candidato)) return candidato;
  }
  return "video/webm";
}

// Dado un instante (0 a 1) de la animación, calcula qué parte real del
// trazo ya se recorrió — usando los timestamps reales de los puntos (no solo
// el índice), para que el avance respete los tramos donde se fue más rápido
// o más lento. `distanciaAcumuladaKm[i]` es la distancia recorrida hasta el
// punto i (precalculada una sola vez, no en cada cuadro).
function estadoEnFraccion(
  datos: DatosTarjetaRecorrido,
  distanciaAcumuladaKm: number[],
  fraccion: number,
): FrameAnimado {
  const { puntos } = datos;
  if (fraccion >= 1) {
    return {
      puntosTrazo: puntos,
      distanciaKm: datos.distanciaKm,
      duracionSeg: datos.duracionSeg,
      posicionActual: null,
      mostrarFin: true,
    };
  }

  const inicioTs = puntos[0].timestamp;
  const finTs = puntos[puntos.length - 1].timestamp;
  const tObjetivo = inicioTs + fraccion * (finTs - inicioTs);

  let i = 0;
  while (i < puntos.length - 2 && puntos[i + 1].timestamp <= tObjetivo) i++;
  const actual = puntos[i];
  const siguiente = puntos[i + 1];
  const dtTramoMs = siguiente.timestamp - actual.timestamp;
  const progresoTramo = dtTramoMs > 0 ? Math.min(1, Math.max(0, (tObjetivo - actual.timestamp) / dtTramoMs)) : 0;

  const posicionActual: PuntoGps = {
    lat: actual.lat + (siguiente.lat - actual.lat) * progresoTramo,
    lon: actual.lon + (siguiente.lon - actual.lon) * progresoTramo,
    timestamp: tObjetivo,
  };
  const distTramoKm = distanciaAcumuladaKm[i + 1] - distanciaAcumuladaKm[i];

  return {
    puntosTrazo: [...puntos.slice(0, i + 1), posicionActual],
    distanciaKm: distanciaAcumuladaKm[i] + distTramoKm * progresoTramo,
    duracionSeg: fraccion * datos.duracionSeg,
    posicionActual,
    mostrarFin: false,
  };
}

interface EstadoCamara {
  cx: number;
  cy: number;
  escala: number;
}

// Durante el trazo (fraccionTotal hasta FRACCION_TRAZO_COMPLETO) la cámara
// sigue de cerca el punto actual, con el acercamiento fijo de
// ESCALA_CAMARA_CERCANA. En el tramo final se aleja con una curva suave
// (suavizar(), no lineal, para que se sienta como una desaceleración real de
// cámara) hasta volver a escala 1 centrada en el recorrido completo -- la
// panorámica de cierre.
function estadoCamara(
  fraccionTotal: number,
  focoTrazando: { x: number; y: number },
  focoCentro: { x: number; y: number },
): EstadoCamara {
  if (fraccionTotal <= FRACCION_TRAZO_COMPLETO) {
    return { cx: focoTrazando.x, cy: focoTrazando.y, escala: ESCALA_CAMARA_CERCANA };
  }
  const t = suavizar((fraccionTotal - FRACCION_TRAZO_COMPLETO) / (1 - FRACCION_TRAZO_COMPLETO));
  return {
    cx: focoTrazando.x + (focoCentro.x - focoTrazando.x) * t,
    cy: focoTrazando.y + (focoCentro.y - focoTrazando.y) * t,
    escala: ESCALA_CAMARA_CERCANA + (1 - ESCALA_CAMARA_CERCANA) * t,
  };
}

// Pin circular con la foto del usuario clavado en un punto del mapa (estilo
// Relive/Strava) -- una "gota" dorada con la foto recortada en círculo
// adentro, apoyada justo sobre el punto exacto.
function pinFotoSvg(cx: number, cyPunta: number, radio: number, fotoHref: string, idClip: string): string {
  const cyCentro = cyPunta - radio - 8;
  const anchoBase = radio * 0.6;
  return `
    <path d="M ${cx} ${cyPunta} L ${cx - anchoBase} ${cyCentro + radio * 0.65} A ${radio + 5} ${radio + 5} 0 1 1 ${cx + anchoBase} ${cyCentro + radio * 0.65} Z" fill="#0d0a06" stroke="${DORADO_BORDE}" stroke-width="2.5"/>
    <clipPath id="${idClip}"><circle cx="${cx}" cy="${cyCentro}" r="${radio}"/></clipPath>
    <image href="${fotoHref}" x="${cx - radio}" y="${cyCentro - radio}" width="${radio * 2}" height="${radio * 2}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${idClip})"/>
    <circle cx="${cx}" cy="${cyCentro}" r="${radio}" fill="none" stroke="${DORADO_BORDE}" stroke-width="2.5"/>
  `;
}

interface ConfigVideo {
  puntoVelMax: PuntoGps | null;
  distanciaVelMaxKm: number;
  kmhVelMax: number;
  fotoDataUrl: string | null;
  estiloFoto: EstiloFotoVideo | null;
  puntoFotoMapa: PuntoGps | null;
  distanciaFotoMapaKm: number;
}

// Arma cada cuadro del video rediseñado: mapa a pantalla completa (sin
// marcos ni casillas -- a diferencia de construirSvg(), que sigue siendo
// la tarjeta de siempre para el PNG de Post), contador de distancia/tiempo
// flotando arriba, marca de velocidad máxima que se prende al pasar el
// trazo por ese punto, y el cuadro de cierre (panorámica completa, con o
// sin foto según config.estiloFoto).
function construirSvgVideo(
  datos: DatosTarjetaRecorrido,
  logoDataUrl: string | null,
  mapa: MapaGenerado | null,
  frame: FrameAnimado,
  fraccionTotal: number,
  config: ConfigVideo,
  mostrarFotoFinal: boolean,
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
  const margenInterno = 50;

  let x: (lon: number) => number;
  let y: (lat: number) => number;
  if (mapa) {
    x = (lon: number) => lonAPixelX(lon, mapa.zoom) - mapa.centroPxX + ANCHO_VIDEO / 2;
    y = (lat: number) => latAPixelY(lat, mapa.zoom) - mapa.centroPxY + ALTO_VIDEO / 2;
  } else {
    x = (lon: number) =>
      margenInterno + ((lon - minLon) / rangoLon) * (ANCHO_VIDEO - margenInterno * 2);
    y = (lat: number) =>
      margenInterno + ((maxLat - lat) / rangoLat) * (ALTO_VIDEO - margenInterno * 2);
  }

  const distanciaMostrar = frame.distanciaKm;
  const duracionMostrar = frame.duracionSeg;

  const marcaSvg = logoDataUrl
    ? `<clipPath id="clipLogo"><circle cx="${ANCHO_VIDEO - 46}" cy="46" r="24"/></clipPath>
       <circle cx="${ANCHO_VIDEO - 46}" cy="46" r="26" fill="#0d0a06" opacity="0.75"/>
       <image href="${logoDataUrl}" x="${ANCHO_VIDEO - 70}" y="22" width="48" height="48" clip-path="url(#clipLogo)"/>
       <circle cx="${ANCHO_VIDEO - 46}" cy="46" r="24" fill="none" stroke="${DORADO_BORDE}" stroke-width="1.3"/>`
    : "";

  // Cuadro de cierre con foto a pantalla completa (opción "final"): ya no
  // hay mapa en este cuadro, solo la foto + degradé + resumen del recorrido.
  if (mostrarFotoFinal && config.fotoDataUrl) {
    return `
      <svg width="${ANCHO_VIDEO}" height="${ALTO_VIDEO}" viewBox="0 0 ${ANCHO_VIDEO} ${ALTO_VIDEO}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="degradeFoto" x1="0" y1="0" x2="0" y2="1">
            <stop offset="45%" stop-color="#0d0a06" stop-opacity="0"/>
            <stop offset="100%" stop-color="#0d0a06" stop-opacity="0.88"/>
          </linearGradient>
        </defs>
        <clipPath id="clipFotoFinal"><rect width="${ANCHO_VIDEO}" height="${ALTO_VIDEO}"/></clipPath>
        <image href="${config.fotoDataUrl}" x="0" y="0" width="${ANCHO_VIDEO}" height="${ALTO_VIDEO}" preserveAspectRatio="xMidYMid slice" clip-path="url(#clipFotoFinal)"/>
        <rect width="${ANCHO_VIDEO}" height="${ALTO_VIDEO}" fill="url(#degradeFoto)"/>
        ${marcaSvg}
        <text x="${ANCHO_VIDEO / 2}" y="${ALTO_VIDEO - 190}" text-anchor="middle" font-family="Arial, sans-serif" font-size="46" font-weight="800" fill="${DORADO}">${distanciaMostrar.toFixed(2)} km &#183; ${Math.round(duracionMostrar / 60)} min</text>
        <text x="${ANCHO_VIDEO / 2}" y="${ALTO_VIDEO - 148}" text-anchor="middle" font-family="Arial, sans-serif" font-size="22" fill="${GRIS_TEXTO}">VEL. PROMEDIO ${Math.round(datos.velocidadPromedio)} km/h &#183; VEL. MÁXIMA ${Math.round(datos.velocidadMaxima)} km/h</text>
        <text x="${ANCHO_VIDEO / 2}" y="${ALTO_VIDEO - 60}" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" font-weight="600" letter-spacing="3" fill="${GRIS_TEXTO}">LEGIÓN ROLLER</text>
      </svg>
    `;
  }

  const inicio = puntos[0];
  const fin = puntos[puntos.length - 1];
  const focoActual = frame.posicionActual ?? fin;
  const focoTrazandoPx = { x: x(focoActual.lon), y: y(focoActual.lat) };
  const focoCentroPx = mapa
    ? { x: ANCHO_VIDEO / 2, y: ALTO_VIDEO / 2 }
    : { x: x((minLon + maxLon) / 2), y: y((minLat + maxLat) / 2) };
  const camara = estadoCamara(fraccionTotal, focoTrazandoPx, focoCentroPx);

  const trazo = frame.puntosTrazo.map((p) => `${x(p.lon)},${y(p.lat)}`).join(" ");

  const mapaFondoSvg = mapa
    ? `<image href="${mapa.dataUrl}" x="0" y="0" width="${ANCHO_VIDEO}" height="${ALTO_VIDEO}" preserveAspectRatio="none"/>`
    : `<rect x="0" y="0" width="${ANCHO_VIDEO}" height="${ALTO_VIDEO}" fill="#1a1108"/>`;

  const mostrarVelMax =
    config.puntoVelMax !== null && distanciaMostrar >= config.distanciaVelMaxKm;
  const velMaxSvg =
    mostrarVelMax && config.puntoVelMax
      ? `<g transform="translate(${x(config.puntoVelMax.lon)}, ${y(config.puntoVelMax.lat)})">
           <circle r="10" fill="none" stroke="${DORADO}" stroke-width="1.5" opacity="0.55" filter="url(#resplandorDorado)"/>
           <circle r="6" fill="${DORADO}" stroke="#0d0a06" stroke-width="2"/>
           <rect x="12" y="-13" width="82" height="26" rx="13" fill="#0d0a06" opacity="0.8"/>
           <text x="24" y="4" font-family="Arial, sans-serif" font-size="15" fill="${DORADO}">&#9889;</text>
           <text x="36" y="5" font-family="Arial, sans-serif" font-size="14" font-weight="700" fill="${DORADO}">${Math.round(config.kmhVelMax)} km/h</text>
         </g>`
      : "";

  const mostrarFotoMapa =
    config.estiloFoto === "mapa" &&
    config.fotoDataUrl &&
    config.puntoFotoMapa !== null &&
    distanciaMostrar >= config.distanciaFotoMapaKm;
  const fotoMapaSvg =
    mostrarFotoMapa && config.fotoDataUrl && config.puntoFotoMapa
      ? pinFotoSvg(x(config.puntoFotoMapa.lon), y(config.puntoFotoMapa.lat), 30, config.fotoDataUrl, "clipFotoMapa")
      : "";

  const contadorSvg = `
    <rect x="0" y="0" width="${ANCHO_VIDEO}" height="118" fill="#0d0a06" opacity="0.5"/>
    <text x="28" y="52" font-family="Arial, sans-serif" font-size="38" font-weight="800" fill="${DORADO}">${distanciaMostrar.toFixed(2)} km</text>
    <text x="28" y="76" font-family="Arial, sans-serif" font-size="15" font-weight="600" letter-spacing="1" fill="${GRIS_TEXTO}">DISTANCIA</text>
    <text x="${ANCHO_VIDEO / 2 + 20}" y="52" font-family="Arial, sans-serif" font-size="38" font-weight="800" fill="${DORADO}">${Math.round(duracionMostrar / 60)} min</text>
    <text x="${ANCHO_VIDEO / 2 + 20}" y="76" font-family="Arial, sans-serif" font-size="15" font-weight="600" letter-spacing="1" fill="${GRIS_TEXTO}">TIEMPO</text>
  `;

  return `
    <svg width="${ANCHO_VIDEO}" height="${ALTO_VIDEO}" viewBox="0 0 ${ANCHO_VIDEO} ${ALTO_VIDEO}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="resplandorDorado" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="4" result="blur"/>
          <feMerge>
            <feMergeNode in="blur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>
      <clipPath id="recorteVideo"><rect width="${ANCHO_VIDEO}" height="${ALTO_VIDEO}"/></clipPath>
      <g clip-path="url(#recorteVideo)">
        <g transform="translate(${ANCHO_VIDEO / 2}, ${ALTO_VIDEO / 2}) scale(${camara.escala}) translate(${-camara.cx}, ${-camara.cy})">
          ${mapaFondoSvg}
          <polyline points="${trazo}" fill="none" stroke="${DORADO}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
          <circle cx="${x(inicio.lon)}" cy="${y(inicio.lat)}" r="10" fill="#5fae4e" stroke="#0d0a06" stroke-width="3"/>
          ${frame.mostrarFin ? `<circle cx="${x(fin.lon)}" cy="${y(fin.lat)}" r="10" fill="#d8342f" stroke="#0d0a06" stroke-width="3"/>` : ""}
          ${frame.posicionActual ? `<circle cx="${x(frame.posicionActual.lon)}" cy="${y(frame.posicionActual.lat)}" r="9" fill="${DORADO}" stroke="#0d0a06" stroke-width="3" filter="url(#resplandorDorado)"/>` : ""}
          ${velMaxSvg}
          ${fotoMapaSvg}
        </g>
      </g>
      ${contadorSvg}
      ${marcaSvg}
    </svg>
  `;
}

// Genera un video corto (.webm) del recorrido "dibujándose" sobre el mismo
// mapa satelital de la tarjeta estática, con la distancia y el tiempo
// subiendo en vivo — pensado específicamente para compartir en redes
// sociales (a diferencia de generarTarjetaRecorrido, que da una imagen fija
// para la ficha/publicación en Post). No reemplaza la tarjeta de imagen,
// la complementa: usa el mismo mapa/tiles/estilo, solo animado.
//
// Como MediaRecorder graba lo que el canvas muestra en tiempo real (no hay
// forma de "renderizar más rápido que tiempo real" con esta API), esta
// función tarda aproximadamente duracionAnimSeg + duracionFinalSeg segundos
// reales en resolver — por eso recibe onProgreso, para poder mostrar un
// indicador mientras tanto.
export async function generarVideoRecorrido(
  datos: DatosTarjetaRecorrido,
  opciones: OpcionesVideoRecorrido = {},
): Promise<Blob> {
  const {
    duracionAnimSeg = DURACION_ANIM_SEG_DEFECTO,
    duracionFinalSeg = DURACION_FINAL_SEG_DEFECTO,
    fps = FPS_DEFECTO,
    onProgreso,
    fotoDataUrl = null,
    estiloFoto = null,
  } = opciones;

  if (typeof MediaRecorder === "undefined") {
    throw new Error("Este navegador no puede generar video.");
  }
  if (datos.puntos.length < 2) {
    throw new Error("El recorrido no tiene suficientes puntos para animar.");
  }

  const [logoDataUrl, mapa] = await Promise.all([
    cargarImagenComoDataUrl("/logo-legion-roller-mini.png"),
    generarMapaReal(datos.puntos, ANCHO_VIDEO, ALTO_VIDEO),
  ]);

  const distanciaAcumuladaKm = [0];
  for (let i = 1; i < datos.puntos.length; i++) {
    distanciaAcumuladaKm.push(
      distanciaAcumuladaKm[i - 1] + distanciaHaversineKm(datos.puntos[i - 1], datos.puntos[i]),
    );
  }

  const { punto: puntoVelMax, indice: indiceVelMax, kmh: kmhVelMax } = velocidadMaximaConPunto(datos.puntos);
  // El pin de "foto en el mapa" se clava, por defecto, en la mitad del
  // recorrido POR DISTANCIA (no por índice ni por tiempo -- así se ve
  // centrado en el trazo incluso si el usuario se detuvo mucho rato en un
  // tramo, lo que dejaría muchos más puntos ahí).
  const mitadDistanciaKm = datos.distanciaKm / 2;
  let indiceFotoMapa = 0;
  while (
    indiceFotoMapa < distanciaAcumuladaKm.length - 1 &&
    distanciaAcumuladaKm[indiceFotoMapa] < mitadDistanciaKm
  ) {
    indiceFotoMapa++;
  }

  const config: ConfigVideo = {
    puntoVelMax,
    distanciaVelMaxKm: indiceVelMax >= 0 ? distanciaAcumuladaKm[indiceVelMax] : Infinity,
    kmhVelMax,
    fotoDataUrl,
    estiloFoto,
    puntoFotoMapa: estiloFoto === "mapa" && fotoDataUrl ? datos.puntos[indiceFotoMapa] : null,
    distanciaFotoMapaKm: distanciaAcumuladaKm[indiceFotoMapa] ?? Infinity,
  };

  const canvas = document.createElement("canvas");
  canvas.width = ANCHO_VIDEO;
  canvas.height = ALTO_VIDEO;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo preparar el video.");

  async function dibujarFrame(fraccionTotal: number, mostrarFotoFinal: boolean) {
    const fraccionTrazo = Math.min(1, fraccionTotal / FRACCION_TRAZO_COMPLETO);
    const frame = estadoEnFraccion(datos, distanciaAcumuladaKm, fraccionTrazo);
    const svg = construirSvgVideo(datos, logoDataUrl, mapa, frame, fraccionTotal, config, mostrarFotoFinal);
    const svgDataUrl = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
    await new Promise<void>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        ctx!.clearRect(0, 0, canvas.width, canvas.height);
        ctx!.drawImage(img, 0, 0);
        resolve();
      };
      img.onerror = () => reject(new Error("No se pudo dibujar un cuadro del video."));
      img.src = svgDataUrl;
    });
  }

  // Primer cuadro dibujado ANTES de arrancar a grabar, para no capturar un
  // instante en blanco mientras carga la primera imagen.
  await dibujarFrame(0, false);

  const stream = canvas.captureStream(fps);
  const mediaRecorder = new MediaRecorder(stream, { mimeType: elegirMimeTypeVideo() });
  const chunks: BlobPart[] = [];
  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  const grabacionLista = new Promise<Blob>((resolve, reject) => {
    mediaRecorder.onstop = () => resolve(new Blob(chunks, { type: "video/webm" }));
    mediaRecorder.onerror = () => reject(new Error("Falló la grabación del video."));
  });

  mediaRecorder.start();

  const totalFrames = Math.round(duracionAnimSeg * fps);
  const intervaloMs = 1000 / fps;
  for (let f = 0; f <= totalFrames; f++) {
    await dibujarFrame(f / totalFrames, false);
    onProgreso?.(f / totalFrames);
    await new Promise((r) => setTimeout(r, intervaloMs));
  }

  // Cuadro final congelado unos segundos más, para que en redes sociales
  // alcance a leerse antes de que corte -- panorámica del recorrido
  // completo, o la foto de portada si el usuario eligió estiloFoto "final".
  const mostrarFotoFinal = estiloFoto === "final" && !!fotoDataUrl;
  await dibujarFrame(1, mostrarFotoFinal);
  await new Promise((r) => setTimeout(r, duracionFinalSeg * 1000));

  mediaRecorder.stop();
  onProgreso?.(1);
  return grabacionLista;
}
