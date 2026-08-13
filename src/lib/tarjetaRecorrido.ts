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
  // El video rediseñado pasa false acá: las etiquetas de calles/lugares
  // horneadas en el tile (fuente fija del proveedor, se ve borrosa al
  // reescalarse y peor todavía tras la recompresión de WhatsApp/redes)
  // se reemplazan por una casilla propia con el sector, dibujada nítida en
  // cada cuadro (ver dibujarEtiquetaSector en dibujarCuadroVideo). La
  // tarjeta estática (generarTarjetaRecorrido) sigue pidiendo las
  // etiquetas como siempre.
  incluirEtiquetas: boolean = true,
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
      incluirEtiquetas
        ? Promise.all(tiles.map((t) => cargarTileComoImagen(urlTile(TILE_ETIQUETAS_URL, zoom, t.x, t.y))))
        : Promise.resolve(tiles.map(() => null)),
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
  // Portada opcional al arranque del video con la foto de perfil + nombre
  // del usuario (estilo Relive/Strava) -- si no se pasa nombreUsuario, no
  // hay intro (avatarUrl solo tiene efecto si también hay nombreUsuario).
  // avatarUrl puede ser remota (se descarga y convierte a data URL acá
  // mismo, igual que el logo) -- si falla o no se pasa, se dibuja un
  // círculo con la inicial del nombre en vez de dejar la portada vacía.
  avatarUrl?: string | null;
  nombreUsuario?: string;
  duracionIntroSeg?: number;
}

const DURACION_ANIM_SEG_DEFECTO = 11;
const DURACION_FINAL_SEG_DEFECTO = 3;
const DURACION_INTRO_SEG_DEFECTO = 1.8;
// Cuánto tarda la portada en desvanecerse hacia el cuadro animado -- sin
// esto el corte de la portada al trazo era de golpe, un salto brusco.
const FUNDIDO_INTRO_SEG = 0.6;
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

// Pausa real (no cosmética) que se agrega al llegar al punto de velocidad
// máxima: sin esto, con el trazo ya fluido, la marca aparece y el ojo no
// alcanza a leerla antes de que la cámara siga de largo.
const PAUSA_VELMAX_MS = 700;

function elegirMimeTypeVideo(): string {
  const candidatos = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  for (const candidato of candidatos) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(candidato)) return candidato;
  }
  return "video/webm";
}

// Dado un instante (0 a 1) de la animación, calcula qué parte real del
// trazo ya se recorrió. Avanza por DISTANCIA recorrida, no por tiempo real
// transcurrido -- si se avanzara por tiempo, un descanso real del usuario a
// mitad de recorrido (parado un buen rato en el mismo lugar) haría que el
// punto animado se quedara "pegado" ahí durante un tramo grande de la
// animación (esa franja de tiempo real, aunque casi no sumó distancia,
// pesaría igual que cualquier otra). Por distancia, un tramo sin avance real
// no consume nada de la animación -- el recorrido se ve continuo y fluido,
// sin delatar los descansos. `distanciaAcumuladaKm[i]` es la distancia
// recorrida hasta el punto i (precalculada una sola vez, no en cada cuadro).
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

  const distObjetivoKm = fraccion * datos.distanciaKm;

  let i = 0;
  while (i < puntos.length - 2 && distanciaAcumuladaKm[i + 1] <= distObjetivoKm) i++;
  const actual = puntos[i];
  const siguiente = puntos[i + 1];
  const distTramoKm = distanciaAcumuladaKm[i + 1] - distanciaAcumuladaKm[i];
  const progresoTramo =
    distTramoKm > 0 ? Math.min(1, Math.max(0, (distObjetivoKm - distanciaAcumuladaKm[i]) / distTramoKm)) : 0;

  const posicionActual: PuntoGps = {
    lat: actual.lat + (siguiente.lat - actual.lat) * progresoTramo,
    lon: actual.lon + (siguiente.lon - actual.lon) * progresoTramo,
    timestamp: actual.timestamp + (siguiente.timestamp - actual.timestamp) * progresoTramo,
  };

  return {
    puntosTrazo: [...puntos.slice(0, i + 1), posicionActual],
    distanciaKm: distObjetivoKm,
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
//
// El punto perseguido se "clampea" (nunca se deja centrar la cámara más
// cerca del borde de lo que el acercamiento permite) -- el mapa cargado
// cubre EXACTAMENTE el cuadro a escala 1, así que perseguir de cerca (1.35x)
// un punto pegado al borde (típicamente el de inicio/fin) dejaría ver, más
// allá del borde del mapa, un vacío sin imagen (franja negra). Con el
// clamp, cerca del borde la cámara deja de seguir el punto exacto y se
// queda quieta en el máximo desplazamiento que el mapa cargado alcanza a
// cubrir -- se pierde algo de precisión del seguimiento justo ahí, pero
// nunca se sale del mapa real.
function estadoCamara(
  fraccionTotal: number,
  focoTrazando: { x: number; y: number },
  focoCentro: { x: number; y: number },
): EstadoCamara {
  const mitadVisibleX = ANCHO_VIDEO / (2 * ESCALA_CAMARA_CERCANA);
  const mitadVisibleY = ALTO_VIDEO / (2 * ESCALA_CAMARA_CERCANA);
  const focoCercano = {
    x: Math.min(Math.max(focoTrazando.x, mitadVisibleX), ANCHO_VIDEO - mitadVisibleX),
    y: Math.min(Math.max(focoTrazando.y, mitadVisibleY), ALTO_VIDEO - mitadVisibleY),
  };
  if (fraccionTotal <= FRACCION_TRAZO_COMPLETO) {
    return { cx: focoCercano.x, cy: focoCercano.y, escala: ESCALA_CAMARA_CERCANA };
  }
  const t = suavizar((fraccionTotal - FRACCION_TRAZO_COMPLETO) / (1 - FRACCION_TRAZO_COMPLETO));
  return {
    cx: focoCercano.x + (focoCentro.x - focoCercano.x) * t,
    cy: focoCercano.y + (focoCentro.y - focoCercano.y) * t,
    escala: ESCALA_CAMARA_CERCANA + (1 - ESCALA_CAMARA_CERCANA) * t,
  };
}

function cargarImagenDesdeSrc(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("No se pudo cargar una imagen del video."));
    img.src = src;
  });
}

async function cargarImagenOpcional(src: string | null): Promise<HTMLImageElement | null> {
  if (!src) return null;
  try {
    return await cargarImagenDesdeSrc(src);
  } catch {
    return null;
  }
}

function trazarRectRedondeado(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function dibujarRectRedondeado(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  trazarRectRedondeado(ctx, x, y, w, h, r);
  ctx.fill();
}

// Círculo genérico con foto (o inicial del nombre como respaldo si no hay
// foto) -- comparte dibujo entre el logo, el avatar de la intro y el pin de
// foto en el mapa.
function dibujarCirculoConImagen(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | null,
  cx: number,
  cy: number,
  r: number,
  inicial: string,
) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = "#0d0a06";
  ctx.fill();
  ctx.clip();
  if (img) {
    dibujarImagenCover(ctx, img, cx - r, cy - r, r * 2, r * 2);
  } else if (inicial) {
    ctx.fillStyle = DORADO;
    ctx.font = `800 ${Math.round(r * 1.1)}px Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(inicial.toUpperCase(), cx, cy + r * 0.05);
  }
  ctx.restore();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = DORADO_BORDE;
  ctx.lineWidth = 2;
  ctx.stroke();
}

// Casilla con el nombre del sector (ej. "Puerto Montt"), clavada sobre el
// mapa como una etiqueta de lugar real -- reemplaza las etiquetas horneadas
// en los tiles del proveedor (borrosas al reescalar/comprimir, ver
// generarMapaReal) por una propia, siempre nítida. A propósito chica y
// discreta (estilo Relive/Google Maps: una etiqueta de lugar real, no un
// letrero) -- una versión grande se sentía más como un cartel que como un
// nombre de lugar en el mapa.
function dibujarEtiquetaSector(ctx: CanvasRenderingContext2D, cx: number, cy: number, texto: string) {
  ctx.font = "700 15px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const anchoTexto = ctx.measureText(texto).width;
  const paddingX = 12;
  const anchoCaja = anchoTexto + paddingX * 2;
  const altoCaja = 26;

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.6)";
  ctx.shadowBlur = 8;
  ctx.fillStyle = "rgba(13,10,6,0.8)";
  trazarRectRedondeado(ctx, cx - anchoCaja / 2, cy - altoCaja / 2, anchoCaja, altoCaja, altoCaja / 2);
  ctx.fill();
  ctx.restore();

  trazarRectRedondeado(ctx, cx - anchoCaja / 2, cy - altoCaja / 2, anchoCaja, altoCaja, altoCaja / 2);
  ctx.strokeStyle = DORADO_BORDE;
  ctx.lineWidth = 1.2;
  ctx.stroke();

  ctx.fillStyle = DORADO;
  ctx.fillText(texto, cx, cy + 1);
}

function dibujarPunto(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string, resplandor = false) {
  if (resplandor) {
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
  }
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#0d0a06";
  ctx.stroke();
  if (resplandor) ctx.restore();
}

// Insignia simplificada (monograma "LR" dibujado con texto, no una imagen)
// para el video: el logo real (montañas, alas, patineta, texto chico) tiene
// demasiado detalle fino para sobrevivir chico + comprimido -- terminaba
// viéndose pixelado sin importar cuánto se agrandara (ver conversación con
// el usuario). Un monograma vectorial es nítido a cualquier tamaño y
// resiste cualquier recompresión (WhatsApp, etc.) porque es texto, no una
// imagen rasterizada.
function dibujarLogo(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = "#0d0a06";
  ctx.fill();
  ctx.fillStyle = DORADO;
  ctx.font = `800 ${Math.round(r * 0.95)}px Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("LR", cx, cy + r * 0.05);
  ctx.restore();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = DORADO_BORDE;
  ctx.lineWidth = 1.3;
  ctx.stroke();
}

function dibujarMarcaVelMax(ctx: CanvasRenderingContext2D, cx: number, cy: number, kmh: number) {
  ctx.save();
  ctx.shadowColor = DORADO;
  ctx.shadowBlur = 8;
  ctx.globalAlpha = 0.55;
  ctx.beginPath();
  ctx.arc(cx, cy, 10, 0, Math.PI * 2);
  ctx.strokeStyle = DORADO;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  ctx.beginPath();
  ctx.arc(cx, cy, 6, 0, Math.PI * 2);
  ctx.fillStyle = DORADO;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#0d0a06";
  ctx.stroke();

  const texto = `⚡ ${Math.round(kmh)} km/h`;
  ctx.font = "700 14px Arial, sans-serif";
  const ancho = ctx.measureText(texto).width + 24;
  ctx.fillStyle = "rgba(13,10,6,0.8)";
  dibujarRectRedondeado(ctx, cx + 12, cy - 13, ancho, 26, 13);
  ctx.fillStyle = DORADO;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(texto, cx + 24, cy + 5);
}

// Pin circular con la foto del usuario clavado en un punto del mapa (estilo
// Relive/Strava) -- un triángulo apuntador + la foto recortada en círculo.
function dibujarPinFoto(ctx: CanvasRenderingContext2D, fotoImg: HTMLImageElement, cx: number, cyPunta: number, radio: number) {
  const cyCentro = cyPunta - radio - 6;
  ctx.beginPath();
  ctx.moveTo(cx, cyPunta);
  ctx.lineTo(cx - 8, cyCentro + radio - 4);
  ctx.lineTo(cx + 8, cyCentro + radio - 4);
  ctx.closePath();
  ctx.fillStyle = "#0d0a06";
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cyCentro, radio, 0, Math.PI * 2);
  ctx.fillStyle = "#0d0a06";
  ctx.fill();
  ctx.clip();
  dibujarImagenCover(ctx, fotoImg, cx - radio, cyCentro - radio, radio * 2, radio * 2);
  ctx.restore();

  ctx.beginPath();
  ctx.arc(cx, cyCentro, radio, 0, Math.PI * 2);
  ctx.strokeStyle = DORADO_BORDE;
  ctx.lineWidth = 2.5;
  ctx.stroke();
}

// Dibuja una imagen recortándola (nunca deformándola) para cubrir todo el
// rectángulo destino -- mismo criterio que CSS object-fit: cover.
function dibujarImagenCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const escala = Math.max(w / img.width, h / img.height);
  const anchoDestino = img.width * escala;
  const altoDestino = img.height * escala;
  ctx.drawImage(img, x + (w - anchoDestino) / 2, y + (h - altoDestino) / 2, anchoDestino, altoDestino);
}

interface ConfigVideo {
  puntoVelMax: PuntoGps | null;
  distanciaVelMaxKm: number;
  kmhVelMax: number;
  fotoImg: HTMLImageElement | null;
  estiloFoto: EstiloFotoVideo | null;
  puntoFotoMapa: PuntoGps | null;
  distanciaFotoMapaKm: number;
}

// Dibuja cada cuadro del video rediseñado directamente en el canvas (sin
// pasar por SVG+<img> por cuadro, ver generarVideoRecorrido): mapa a
// pantalla completa (a diferencia de construirSvg(), que sigue siendo la
// tarjeta de siempre para el PNG de Post), contador de distancia/tiempo
// flotando arriba, marca de velocidad máxima que se prende al pasar el
// trazo por ese punto, y el cuadro de cierre (panorámica completa, con o
// sin foto según config.estiloFoto).
function dibujarCuadroVideo(
  ctx: CanvasRenderingContext2D,
  datos: DatosTarjetaRecorrido,
  mapaImg: HTMLImageElement | null,
  x: (lon: number) => number,
  y: (lat: number) => number,
  focoCentroPx: { x: number; y: number },
  frame: FrameAnimado,
  fraccionTotal: number,
  config: ConfigVideo,
  mostrarFotoFinal: boolean,
) {
  const { puntos } = datos;
  const distanciaMostrar = frame.distanciaKm;
  const duracionMostrar = frame.duracionSeg;

  ctx.clearRect(0, 0, ANCHO_VIDEO, ALTO_VIDEO);
  ctx.textBaseline = "alphabetic";

  // Cuadro de cierre con foto a pantalla completa (opción "final"): ya no
  // hay mapa en este cuadro, solo la foto + degradé + resumen del recorrido.
  if (mostrarFotoFinal && config.fotoImg) {
    dibujarImagenCover(ctx, config.fotoImg, 0, 0, ANCHO_VIDEO, ALTO_VIDEO);
    const degrade = ctx.createLinearGradient(0, ALTO_VIDEO * 0.45, 0, ALTO_VIDEO);
    degrade.addColorStop(0, "rgba(13,10,6,0)");
    degrade.addColorStop(1, "rgba(13,10,6,0.88)");
    ctx.fillStyle = degrade;
    ctx.fillRect(0, 0, ANCHO_VIDEO, ALTO_VIDEO);

    ctx.textAlign = "center";
    ctx.fillStyle = DORADO;
    ctx.font = "800 46px Arial, sans-serif";
    ctx.fillText(
      `${distanciaMostrar.toFixed(2)} km · ${Math.round(duracionMostrar / 60)} min`,
      ANCHO_VIDEO / 2,
      ALTO_VIDEO - 190,
    );
    ctx.fillStyle = GRIS_TEXTO;
    ctx.font = "400 22px Arial, sans-serif";
    ctx.fillText(
      `VEL. PROMEDIO ${Math.round(datos.velocidadPromedio)} km/h · VEL. MÁXIMA ${Math.round(datos.velocidadMaxima)} km/h`,
      ANCHO_VIDEO / 2,
      ALTO_VIDEO - 148,
    );
    ctx.font = "600 18px Arial, sans-serif";
    ctx.fillText("LEGIÓN ROLLER", ANCHO_VIDEO / 2, ALTO_VIDEO - 60);
    dibujarLogo(ctx, ANCHO_VIDEO - 58, 58, 32);
    return;
  }

  const inicio = puntos[0];
  const fin = puntos[puntos.length - 1];
  const focoActual = frame.posicionActual ?? fin;
  const focoTrazandoPx = { x: x(focoActual.lon), y: y(focoActual.lat) };
  const camara = estadoCamara(fraccionTotal, focoTrazandoPx, focoCentroPx);

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, ANCHO_VIDEO, ALTO_VIDEO);
  ctx.clip();
  ctx.translate(ANCHO_VIDEO / 2, ALTO_VIDEO / 2);
  ctx.scale(camara.escala, camara.escala);
  ctx.translate(-camara.cx, -camara.cy);

  if (mapaImg) {
    ctx.drawImage(mapaImg, 0, 0, ANCHO_VIDEO, ALTO_VIDEO);
  } else {
    ctx.fillStyle = "#1a1108";
    ctx.fillRect(0, 0, ANCHO_VIDEO, ALTO_VIDEO);
  }

  if (datos.sector) {
    dibujarEtiquetaSector(ctx, focoCentroPx.x, focoCentroPx.y - 50, datos.sector);
  }

  ctx.beginPath();
  frame.puntosTrazo.forEach((p, i) => {
    const px = x(p.lon);
    const py = y(p.lat);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.strokeStyle = DORADO;
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();

  dibujarPunto(ctx, x(inicio.lon), y(inicio.lat), 10, "#5fae4e");
  if (frame.mostrarFin) dibujarPunto(ctx, x(fin.lon), y(fin.lat), 10, "#d8342f");
  if (frame.posicionActual) {
    dibujarPunto(ctx, x(frame.posicionActual.lon), y(frame.posicionActual.lat), 9, DORADO, true);
  }

  const mostrarVelMax = config.puntoVelMax !== null && distanciaMostrar >= config.distanciaVelMaxKm;
  if (mostrarVelMax && config.puntoVelMax) {
    dibujarMarcaVelMax(ctx, x(config.puntoVelMax.lon), y(config.puntoVelMax.lat), config.kmhVelMax);
  }

  const mostrarFotoMapa =
    config.estiloFoto === "mapa" &&
    config.fotoImg &&
    config.puntoFotoMapa !== null &&
    distanciaMostrar >= config.distanciaFotoMapaKm;
  if (mostrarFotoMapa && config.fotoImg && config.puntoFotoMapa) {
    dibujarPinFoto(ctx, config.fotoImg, x(config.puntoFotoMapa.lon), y(config.puntoFotoMapa.lat), 30);
  }

  ctx.restore();

  ctx.fillStyle = "rgba(13,10,6,0.5)";
  ctx.fillRect(0, 0, ANCHO_VIDEO, 118);
  ctx.textAlign = "left";
  ctx.fillStyle = DORADO;
  ctx.font = "800 38px Arial, sans-serif";
  ctx.fillText(`${distanciaMostrar.toFixed(2)} km`, 28, 52);
  ctx.fillStyle = GRIS_TEXTO;
  ctx.font = "600 15px Arial, sans-serif";
  ctx.fillText("DISTANCIA", 28, 76);
  ctx.fillStyle = DORADO;
  ctx.font = "800 38px Arial, sans-serif";
  ctx.fillText(`${Math.round(duracionMostrar / 60)} min`, ANCHO_VIDEO / 2 + 20, 52);
  ctx.fillStyle = GRIS_TEXTO;
  ctx.font = "600 15px Arial, sans-serif";
  ctx.fillText("TIEMPO", ANCHO_VIDEO / 2 + 20, 76);

  dibujarLogo(ctx, ANCHO_VIDEO - 58, 58, 32);
}

// Portada al arranque del video (estilo Relive/Strava): la foto de perfil
// del usuario y su nombre, superpuestos sobre el cuadro real del video (ya
// dibujado antes de llamar a esto, ver generarVideoRecorrido) -- no redibuja
// el mapa de fondo. Recibe `alpha` para poder desvanecerla gradualmente en
// vez de cortar de golpe al cuadro animado: se llama varias veces seguidas
// con alpha decreciente (1 -> 0) sobre el mismo cuadro de fondo ya dibujado.
function dibujarOverlayIntro(
  ctx: CanvasRenderingContext2D,
  avatarImg: HTMLImageElement | null,
  nombreUsuario: string,
  alpha: number,
) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textBaseline = "alphabetic";

  ctx.fillStyle = "rgba(13,10,6,0.6)";
  ctx.fillRect(0, 0, ANCHO_VIDEO, ALTO_VIDEO);

  const cxAvatar = ANCHO_VIDEO / 2;
  const cyAvatar = ALTO_VIDEO / 2 - 40;
  const rAvatar = 80;
  dibujarCirculoConImagen(ctx, avatarImg, cxAvatar, cyAvatar, rAvatar, nombreUsuario.charAt(0));

  ctx.textAlign = "center";
  ctx.fillStyle = DORADO;
  ctx.font = "800 34px Arial, sans-serif";
  ctx.fillText(nombreUsuario, cxAvatar, cyAvatar + rAvatar + 56);
  ctx.fillStyle = GRIS_TEXTO;
  ctx.font = "600 15px Arial, sans-serif";
  ctx.fillText("LEGIÓN ROLLER", cxAvatar, cyAvatar + rAvatar + 82);
  ctx.restore();
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
    duracionIntroSeg = DURACION_INTRO_SEG_DEFECTO,
    fps = FPS_DEFECTO,
    onProgreso,
    fotoDataUrl = null,
    estiloFoto = null,
    avatarUrl = null,
    nombreUsuario,
  } = opciones;

  if (typeof MediaRecorder === "undefined") {
    throw new Error("Este navegador no puede generar video.");
  }
  if (datos.puntos.length < 2) {
    throw new Error("El recorrido no tiene suficientes puntos para animar.");
  }

  const [mapa, avatarDataUrl] = await Promise.all([
    generarMapaReal(datos.puntos, ANCHO_VIDEO, ALTO_VIDEO, false),
    avatarUrl ? cargarImagenComoDataUrl(avatarUrl) : Promise.resolve(null),
  ]);

  // Las imágenes (mapa, foto, avatar) se decodifican UNA sola vez acá, antes
  // de arrancar la animación -- la versión anterior reincrustaba el mapa
  // completo (base64) dentro de un SVG nuevo en CADA cuadro y lo volvía a
  // rasterizar, lo que con el mapa ahora a pantalla completa tardaba tanto
  // por cuadro que el video terminaba grabándose muchísimo más lento que en
  // tiempo real (se notaba como "cuadro por cuadro"). Con las imágenes ya
  // decodificadas, dibujar un cuadro es un puñado de drawImage()/stroke()
  // directos sobre el canvas -- sin async, sin volver a parsear texto
  // gigante -- así que corre a la velocidad real que pide el fps. El logo ya
  // no se carga acá -- el video usa un monograma vectorial (ver dibujarLogo).
  const [mapaImg, fotoImg, avatarImg] = await Promise.all([
    cargarImagenOpcional(mapa?.dataUrl ?? null),
    cargarImagenOpcional(fotoDataUrl),
    cargarImagenOpcional(avatarDataUrl),
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
    fotoImg,
    estiloFoto,
    puntoFotoMapa: estiloFoto === "mapa" && fotoImg ? datos.puntos[indiceFotoMapa] : null,
    distanciaFotoMapaKm: distanciaAcumuladaKm[indiceFotoMapa] ?? Infinity,
  };

  const lats = datos.puntos.map((p) => p.lat);
  const lons = datos.puntos.map((p) => p.lon);
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
  const focoCentroPx = mapa
    ? { x: ANCHO_VIDEO / 2, y: ALTO_VIDEO / 2 }
    : { x: x((minLon + maxLon) / 2), y: y((minLat + maxLat) / 2) };

  const canvas = document.createElement("canvas");
  canvas.width = ANCHO_VIDEO;
  canvas.height = ALTO_VIDEO;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo preparar el video.");

  function dibujarFrame(fraccionTotal: number, mostrarFotoFinal: boolean) {
    const fraccionTrazo = Math.min(1, fraccionTotal / FRACCION_TRAZO_COMPLETO);
    const frame = estadoEnFraccion(datos, distanciaAcumuladaKm, fraccionTrazo);
    dibujarCuadroVideo(ctx!, datos, mapaImg, x, y, focoCentroPx, frame, fraccionTotal, config, mostrarFotoFinal);
  }

  // Primer cuadro dibujado ANTES de arrancar a grabar, para no capturar un
  // instante en blanco.
  dibujarFrame(0, false);

  const stream = canvas.captureStream(fps);
  const mediaRecorder = new MediaRecorder(stream, {
    mimeType: elegirMimeTypeVideo(),
    // Sin esto el navegador elige un bitrate bajo por defecto -- se nota
    // sobre todo en el logo (detalle fino) y cuando la app que recibe el
    // video (WhatsApp, etc.) lo vuelve a comprimir: partir de un video
    // menos comprimido deja más margen antes de que se vea "pixelado".
    videoBitsPerSecond: 5_000_000,
  });
  const chunks: BlobPart[] = [];
  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  const grabacionLista = new Promise<Blob>((resolve, reject) => {
    mediaRecorder.onstop = () => resolve(new Blob(chunks, { type: "video/webm" }));
    mediaRecorder.onerror = () => reject(new Error("Falló la grabación del video."));
  });

  mediaRecorder.start();

  const intervaloMs = 1000 / fps;

  if (nombreUsuario && nombreUsuario.trim()) {
    const nombreLimpio = nombreUsuario.trim();
    dibujarFrame(0, false);
    dibujarOverlayIntro(ctx, avatarImg, nombreLimpio, 1);
    await new Promise((r) => setTimeout(r, duracionIntroSeg * 1000));

    // Desvanecido gradual hacia el cuadro animado (el mismo cuadro 0 ya
    // dibujado abajo, con la barra de contador/logo/etiqueta ya visibles) en
    // vez de cortar de golpe de la portada al trazo.
    const framesFundido = Math.max(1, Math.round(FUNDIDO_INTRO_SEG * fps));
    for (let i = 1; i <= framesFundido; i++) {
      dibujarFrame(0, false);
      dibujarOverlayIntro(ctx, avatarImg, nombreLimpio, 1 - i / framesFundido);
      await new Promise((r) => setTimeout(r, intervaloMs));
    }
  }

  const totalFrames = Math.round(duracionAnimSeg * fps);
  let pausaVelMaxHecha = false;
  for (let f = 0; f <= totalFrames; f++) {
    const fraccionTotal = f / totalFrames;
    dibujarFrame(fraccionTotal, false);
    onProgreso?.(fraccionTotal);
    await new Promise((r) => setTimeout(r, intervaloMs));

    // Al llegar al punto de velocidad máxima, se sostiene ese mismo cuadro
    // (marca ya prendida, sin redibujar) un instante más antes de seguir --
    // el captureStream repite el último cuadro solo, no hace falta volver a
    // dibujar nada para lograr la pausa.
    if (!pausaVelMaxHecha && config.puntoVelMax) {
      const fraccionTrazo = Math.min(1, fraccionTotal / FRACCION_TRAZO_COMPLETO);
      if (fraccionTrazo * datos.distanciaKm >= config.distanciaVelMaxKm) {
        pausaVelMaxHecha = true;
        await new Promise((r) => setTimeout(r, PAUSA_VELMAX_MS));
      }
    }
  }

  // Cuadro final congelado unos segundos más, para que en redes sociales
  // alcance a leerse antes de que corte -- panorámica del recorrido
  // completo, o la foto de portada si el usuario eligió estiloFoto "final".
  const mostrarFotoFinal = estiloFoto === "final" && !!fotoImg;
  dibujarFrame(1, mostrarFotoFinal);
  await new Promise((r) => setTimeout(r, duracionFinalSeg * 1000));

  mediaRecorder.stop();
  onProgreso?.(1);
  return grabacionLista;
}
