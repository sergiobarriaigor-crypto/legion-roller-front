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
  // Hasta 3 etiquetas de lugar repartidas por distancia (inicio/medio/fin,
  // ya deduplicadas -- ver MisRutasPanel.tsx), cada una con su propia
  // posición real en el mapa. Solo las usa el video (generarVideoRecorrido);
  // la tarjeta estática sigue mostrando `sector` como texto simple junto a
  // la fecha, sin cambios.
  sectoresRuta?: { lat: number; lon: number; nombre: string; distanciaKm: number }[];
  // Ciudad (sin barrio/calle) para la pantalla de cierre del video --
  // logo grande + este nombre debajo, después de la panorámica final.
  ciudad?: string;
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

export interface OpcionesVideoRecorrido {
  // Duración de la animación (el trazo dibujándose + la cámara alejándose al
  // final) — NO la duración real del recorrido, que puede ser de horas.
  // Pensado para redes sociales, no para ver el paseo en tiempo real. Más
  // larga que antes a propósito: se ve más fluida, no hay apuro por cortarla
  // corta.
  duracionAnimSeg?: number;
  // Cuánto se mantiene congelado el cuadro final (panorámica completa, o la
  // foto de cierre si se eligió una) antes de cortar el video.
  duracionFinalSeg?: number;
  fps?: number;
  onProgreso?: (fraccion: number) => void;
  // Las dos fotos opcionales son independientes entre sí -- se puede elegir
  // una, la otra, ambas, o ninguna (nunca obligatorias):
  // - fotoFinalDataUrl: 1 sola foto a pantalla completa en el cuadro de
  //   cierre, como una portada.
  // - fotosPinDataUrl: hasta 3 fotos clavadas como pines circulares sobre el
  //   mapa, repartidas por distancia del recorrido (ver fraccionesPines) --
  //   cada una se revela recién cuando el trazo animado llega a ese punto,
  //   igual que la marca de velocidad máxima.
  fotoFinalDataUrl?: string;
  fotosPinDataUrl?: string[];
  // Portada opcional al arranque del video con la foto de perfil + nombre
  // del usuario (estilo Relive/Strava) -- si no se pasa nombreUsuario, no
  // hay intro (avatarUrl solo tiene efecto si también hay nombreUsuario).
  // avatarUrl puede ser remota (se descarga y convierte a data URL acá
  // mismo, igual que el logo) -- si falla o no se pasa, se dibuja un
  // círculo con la inicial del nombre en vez de dejar la portada vacía.
  avatarUrl?: string | null;
  nombreUsuario?: string;
  duracionIntroSeg?: number;
  // Cuánto se sostiene el cuadro de cierre (logo grande + ciudad) al final
  // de todo, después de la panorámica (o de la foto de portada).
  duracionCierreSeg?: number;
  // Música de fondo opcional, del mismo catálogo propio que usan las
  // Historias (ver lib/musicaHistorias.ts) -- musicaUrl es la ruta estática
  // dentro de /public (no pasa por /uploads), musicaInicioSeg el segundo
  // desde donde arrancar si la pista es más larga que el video. Sin
  // musicaUrl el video queda mudo, como antes.
  musicaUrl?: string;
  musicaInicioSeg?: number;
}

const DURACION_ANIM_SEG_DEFECTO = 11;
const DURACION_FINAL_SEG_DEFECTO = 3;
const DURACION_INTRO_SEG_DEFECTO = 1.8;
// Cuánto tarda la portada en desvanecerse hacia el cuadro animado -- sin
// esto el corte de la portada al trazo era de golpe, un salto brusco.
const FUNDIDO_INTRO_SEG = 0.6;
const DURACION_CIERRE_SEG_DEFECTO = 2.2;
const FPS_DEFECTO = 24;

// Techo generoso de cuánto puede llegar a durar el video con los valores por
// defecto (intro + fundido + trazo + pausa de vel. máxima + final + cierre).
// Solo se usa para decidir si hay que ofrecer recorte de música (ver
// SelectorMusicaHistoria) -- no necesita ser exacto, mejor quedarse corto en
// la duración real (que varía según si hay intro) que sobrar.
export const DURACION_VIDEO_ESTIMADA_SEG = 20;

// Volumen base de la música de fondo (dejamos algo de aire para que no tape
// el resto del audio si el usuario reproduce esto sobre otro sonido) y
// cuánto se desvanece hacia el final -- coincide con el cuadro de cierre
// (logo + ciudad) para que el corte del video y el del audio se sientan
// juntos, no uno después del otro.
const VOLUMEN_MUSICA = 0.65;

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

function elegirMimeTypeVideo(conAudio: boolean): string {
  const candidatos = conAudio
    ? ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"]
    : ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  for (const candidato of candidatos) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(candidato)) return candidato;
  }
  return "video/webm";
}

// Descarga y decodifica la pista de música elegida a un buffer de audio
// listo para reproducir con Web Audio API. Nunca lanza -- si falla (red,
// formato, navegador sin soporte), el video sigue igual pero mudo en vez de
// arruinar toda la generación por un problema de audio.
async function cargarBufferMusica(
  url: string,
  audioCtx: AudioContext,
): Promise<AudioBuffer | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const arrayBuffer = await res.arrayBuffer();
    return await audioCtx.decodeAudioData(arrayBuffer);
  } catch {
    return null;
  }
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
    x: clamp(focoTrazando.x, mitadVisibleX, ANCHO_VIDEO - mitadVisibleX),
    y: clamp(focoTrazando.y, mitadVisibleY, ALTO_VIDEO - mitadVisibleY),
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

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

// Ventana de aparición/desvanecido de una etiqueta de sector, en fracción de
// DISTANCIA recorrida (no de tiempo) -- ver alphaEtiqueta. Precalculada una
// sola vez en generarVideoRecorrido() a partir de su distanciaKm real.
interface EtiquetaTiempoVideo {
  nombre: string;
  lat: number;
  lon: number;
  inicioFraccion: number;
  finFadeInFraccion: number;
  finHoldFraccion: number;
  finFraccion: number;
}

// Cuánto (en fracción de FRACCION_TRAZO_COMPLETO, o sea de la distancia
// TOTAL del recorrido, no tiempo) tarda en aparecer/sostenerse/apagarse cada
// etiqueta desde que el trazo llega a su punto -- así se ajusta sola al
// largo del recorrido: en una ruta corta esa ventana dura varios segundos
// reales igual que en una larga (es la MISMA fracción de la animación),
// nunca aparece en flash ni quedan colgadas eternamente. Apagarla en vez de
// dejarla fija para siempre evita que, en un recorrido largo, una etiqueta
// revelada hace rato termine "pegada" al borde de la pantalla mientras la
// cámara persigue un punto lejano -- ver alphaEtiqueta para la reaparición
// conjunta en la toma final.
const FADE_ETIQUETA_PCT = 0.025;
const HOLD_ETIQUETA_PCT = 0.08;

// Alpha de una etiqueta en un instante dado: durante el trazo, aparece,
// se sostiene y se apaga sola (ver constantes de arriba) -- apagada NO
// vuelve a encenderse aunque el trazo pase cerca de nuevo (recorridos de
// ida y vuelta), se dispara una sola vez por distancia acumulada. Después
// de FRACCION_TRAZO_COMPLETO (la panorámica final) se toma el máximo con un
// segundo fundido que va de 0 a 1 a lo largo de todo ese tramo final -- así
// las 3 etiquetas reaparecen juntas ahí, y si alguna quedaba a mitad de
// apagarse justo al cruzar ese límite, el máximo evita cualquier salto (se
// retoma suave hacia visible en vez de completar el apagado o "parpadear").
function alphaEtiqueta(et: EtiquetaTiempoVideo, fraccionTotal: number): number {
  let alphaTrazo = 0;
  if (fraccionTotal >= et.inicioFraccion && fraccionTotal <= et.finFraccion) {
    if (fraccionTotal < et.finFadeInFraccion) {
      alphaTrazo =
        et.finFadeInFraccion > et.inicioFraccion
          ? (fraccionTotal - et.inicioFraccion) / (et.finFadeInFraccion - et.inicioFraccion)
          : 1;
    } else if (fraccionTotal < et.finHoldFraccion) {
      alphaTrazo = 1;
    } else {
      alphaTrazo =
        et.finFraccion > et.finHoldFraccion
          ? 1 - (fraccionTotal - et.finHoldFraccion) / (et.finFraccion - et.finHoldFraccion)
          : 0;
    }
  }
  const alphaFinal =
    fraccionTotal > FRACCION_TRAZO_COMPLETO
      ? suavizar((fraccionTotal - FRACCION_TRAZO_COMPLETO) / (1 - FRACCION_TRAZO_COMPLETO))
      : 0;
  return Math.max(alphaTrazo, alphaFinal);
}

// Casilla con el nombre del sector (ej. "Antonio Varas"), clavada sobre el
// mapa en su posición geográfica real, DEBAJO de su punto (para no taparse
// nunca con el pin de foto, que se dibuja arriba del suyo -- ver
// dibujarPinFoto). Se dibuja con la transformación de cámara (pan/zoom) ya
// aplicada -- se clampea en espacio de PANTALLA, invirtiendo esa
// transformación, para que la casilla nunca quede cortada en ningún borde
// sin importar dónde esté el punto real ni cuánto haya acercado la cámara
// en este cuadro puntual. suavizado (mutado por referencia) evita que ese
// clamp se sienta como un salto cuadro a cuadro -- en vez de saltar directo
// a la posición corregida, se acerca gradualmente a ella, así se ve
// acompañando al mapa en vez de "corriendo" aparte.
function dibujarEtiquetaSector(
  ctx: CanvasRenderingContext2D,
  mapX: number,
  mapY: number,
  texto: string,
  alpha: number,
  suavizado: { x: number; y: number } | null,
): { x: number; y: number } {
  ctx.font = "700 15px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const anchoTexto = ctx.measureText(texto).width;
  const paddingX = 12;
  const anchoCaja = anchoTexto + paddingX * 2;
  const altoCaja = 26;

  const t = ctx.getTransform();
  const margenPantalla = 12;
  const screenX = t.a * mapX + t.c * mapY + t.e;
  const screenY = t.b * mapX + t.d * mapY + t.f;
  const screenXClamp = clamp(screenX, margenPantalla + anchoCaja / 2, ANCHO_VIDEO - margenPantalla - anchoCaja / 2);
  const screenYClamp = clamp(screenY, margenPantalla + altoCaja / 2, ALTO_VIDEO - margenPantalla - altoCaja / 2);

  // Resuelve el sistema 2x2 [a c; b d] * (cx,cy) = (screenXClamp,screenYClamp)
  // -e,-f para volver a espacio de mapa.
  const det = t.a * t.d - t.b * t.c;
  let cx = mapX;
  let cy = mapY;
  if (Math.abs(det) > 1e-6) {
    const dxScreen = screenXClamp - screenX;
    const dyScreen = screenYClamp - screenY;
    cx = mapX + (t.d * dxScreen - t.c * dyScreen) / det;
    cy = mapY + (-t.b * dxScreen + t.a * dyScreen) / det;
  }

  const ALPHA_SUAVIZADO = 0.25;
  const nuevo = suavizado
    ? {
        x: suavizado.x + (cx - suavizado.x) * ALPHA_SUAVIZADO,
        y: suavizado.y + (cy - suavizado.y) * ALPHA_SUAVIZADO,
      }
    : { x: cx, y: cy };

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.shadowColor = "rgba(0,0,0,0.6)";
  ctx.shadowBlur = 8;
  ctx.fillStyle = "rgba(13,10,6,0.8)";
  trazarRectRedondeado(ctx, nuevo.x - anchoCaja / 2, nuevo.y - altoCaja / 2, anchoCaja, altoCaja, altoCaja / 2);
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;

  trazarRectRedondeado(ctx, nuevo.x - anchoCaja / 2, nuevo.y - altoCaja / 2, anchoCaja, altoCaja, altoCaja / 2);
  ctx.strokeStyle = DORADO_BORDE;
  ctx.lineWidth = 1.2;
  ctx.stroke();

  ctx.fillStyle = DORADO;
  ctx.fillText(texto, nuevo.x, nuevo.y + 1);
  ctx.restore();

  return nuevo;
}

// Color del trazo según qué tan rápido se iba en ese tramo -- mismo tono
// dorado de la marca en toda su gama (nunca sale del tema de la app), solo
// varía qué tan clara/brillante se ve: más oscura y bronce en los tramos
// lentos, blanco-dorada en los más rápidos. kmhReferencia es la velocidad
// que se pinta al tope (normalmente la máxima real del recorrido), así el
// gradiente siempre usa el rango completo sin importar qué tan rápido fue
// el usuario en total.
function colorPorVelocidad(kmh: number, kmhReferencia: number): string {
  const t = Math.min(1, Math.max(0, kmh / kmhReferencia));
  const luminosidad = 38 + t * 40;
  return `hsl(42, 85%, ${luminosidad}%)`;
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

// pulso (0 por defecto = estado normal ya asentado): al revelarse la marca
// se llama varios cuadros seguidos con pulso creciente 0→1 (ver PAUSA_VELMAX_MS
// en generarVideoRecorrido) para un anillo que se expande y se desvanece --
// un "ping" real, no un marcador estático -- y después queda en su estado
// fijo (punto + resplandor + casilla) el resto del video.
function dibujarMarcaVelMax(ctx: CanvasRenderingContext2D, cx: number, cy: number, kmh: number, pulso = 0) {
  if (pulso > 0) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - pulso) * 0.6;
    ctx.beginPath();
    ctx.arc(cx, cy, 9 + pulso * 30, 0, Math.PI * 2);
    ctx.strokeStyle = DORADO;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
  }

  ctx.save();
  ctx.shadowColor = DORADO;
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.arc(cx, cy, 8, 0, Math.PI * 2);
  ctx.fillStyle = DORADO;
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = "#0d0a06";
  ctx.stroke();
  ctx.restore();

  const texto = `⚡ ${Math.round(kmh)} km/h`;
  ctx.font = "800 15px Arial, sans-serif";
  const ancho = ctx.measureText(texto).width + 28;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.75)";
  ctx.shadowBlur = 5;
  ctx.fillStyle = "rgba(13,10,6,0.88)";
  dibujarRectRedondeado(ctx, cx + 14, cy - 16, ancho, 32, 16);
  ctx.restore();
  ctx.strokeStyle = DORADO_BORDE;
  ctx.lineWidth = 1.4;
  trazarRectRedondeado(ctx, cx + 14, cy - 16, ancho, 32, 16);
  ctx.stroke();
  ctx.fillStyle = DORADO;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(texto, cx + 28, cy + 6);
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

// Dibuja una imagen COMPLETA, sin recortar ni deformar (mismo criterio que
// CSS object-fit: contain) -- para el logo del cierre: el archivo real ya
// es una insignia circular con alas que llegan casi al borde de su propio
// lienzo cuadrado; recortarla en un círculo nuestro (como hacía antes)
// volvía a cortar esas puntas. Mostrando el archivo tal cual, completo, se
// ve la insignia entera.
function dibujarImagenContain(ctx: CanvasRenderingContext2D, img: HTMLImageElement, cx: number, cy: number, tamanoMax: number) {
  const escala = Math.min(tamanoMax / img.width, tamanoMax / img.height);
  const w = img.width * escala;
  const h = img.height * escala;
  ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
}

// Foto de cierre a pantalla completa (solo con exactamente 1 foto y
// estiloFoto "final") o pin sobre el mapa (los demás casos, hasta 3, cada
// uno con su propio punto real del recorrido y su propia distancia de
// revelado -- ver fraccionesPines).
interface PinFotoVideo {
  img: HTMLImageElement;
  punto: PuntoGps;
  distanciaKm: number;
}

interface ConfigVideo {
  puntoVelMax: PuntoGps | null;
  distanciaVelMaxKm: number;
  kmhVelMax: number;
  fotoFinalImg: HTMLImageElement | null;
  pinesFoto: PinFotoVideo[];
  // Hasta 3 etiquetas de lugar (ver DatosTarjetaRecorrido.sectoresRuta), cada
  // una con su ventana de aparición/desvanecido ya calculada -- ver
  // EtiquetaTiempoVideo/alphaEtiqueta.
  sectoresRuta: EtiquetaTiempoVideo[];
  // Velocidad (km/h) de cada tramo entre puntos consecutivos, para colorear
  // el trazo según qué tan rápido se iba ahí -- velocidadesKmh[j] es la
  // velocidad LLEGANDO al punto j (0 para j=0). kmhReferenciaColor es el
  // valor que se pinta más "caliente" (blanco-dorado), normalmente la
  // velocidad máxima real de este recorrido.
  velocidadesKmh: number[];
  kmhReferenciaColor: number;
}

// Dibuja cada cuadro del video rediseñado directamente en el canvas (sin
// pasar por SVG+<img> por cuadro, ver generarVideoRecorrido): mapa a
// pantalla completa (a diferencia de construirSvg(), que sigue siendo la
// tarjeta de siempre para el PNG de Post), contador de distancia/tiempo
// flotando arriba, marca de velocidad máxima que se prende al pasar el
// trazo por ese punto, y el cuadro de cierre (panorámica completa, con o
// sin foto según config.fotoFinalImg).
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
  pulsoVelMax = 0,
  suavizadoEtiquetas: Map<number, { x: number; y: number }> = new Map(),
) {
  const { puntos } = datos;
  const distanciaMostrar = frame.distanciaKm;
  const duracionMostrar = frame.duracionSeg;

  ctx.clearRect(0, 0, ANCHO_VIDEO, ALTO_VIDEO);
  ctx.textBaseline = "alphabetic";

  // Cuadro de cierre con foto a pantalla completa (opción "final"): ya no
  // hay mapa en este cuadro, solo la foto + degradé + resumen del recorrido.
  if (mostrarFotoFinal && config.fotoFinalImg) {
    dibujarImagenCover(ctx, config.fotoFinalImg, 0, 0, ANCHO_VIDEO, ALTO_VIDEO);
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

  // El trazo se dibuja tramo a tramo (no una sola polyline) para poder
  // colorear cada segmento según la velocidad real ahí -- más dorado/claro
  // en los tramos rápidos, más bronce/oscuro en los lentos.
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (let k = 0; k < frame.puntosTrazo.length - 1; k++) {
    const a = frame.puntosTrazo[k];
    const b = frame.puntosTrazo[k + 1];
    const kmh = config.velocidadesKmh[k + 1] ?? 0;
    ctx.beginPath();
    ctx.moveTo(x(a.lon), y(a.lat));
    ctx.lineTo(x(b.lon), y(b.lat));
    ctx.strokeStyle = colorPorVelocidad(kmh, config.kmhReferenciaColor);
    ctx.stroke();
  }

  dibujarPunto(ctx, x(inicio.lon), y(inicio.lat), 10, "#5fae4e");
  if (frame.mostrarFin) dibujarPunto(ctx, x(fin.lon), y(fin.lat), 10, "#d8342f");
  if (frame.posicionActual) {
    dibujarPunto(ctx, x(frame.posicionActual.lon), y(frame.posicionActual.lat), 9, DORADO, true);
  }

  const mostrarVelMax = config.puntoVelMax !== null && distanciaMostrar >= config.distanciaVelMaxKm;
  if (mostrarVelMax && config.puntoVelMax) {
    dibujarMarcaVelMax(ctx, x(config.puntoVelMax.lon), y(config.puntoVelMax.lat), config.kmhVelMax, pulsoVelMax);
  }

  // Hasta 3 fotos clavadas como pin sobre el mapa, cada una en su propio
  // punto real del recorrido, revelándose recién cuando el trazo llega a su
  // distancia -- mismo criterio que la marca de velocidad máxima.
  for (const pin of config.pinesFoto) {
    if (distanciaMostrar >= pin.distanciaKm) {
      dibujarPinFoto(ctx, pin.img, x(pin.punto.lon), y(pin.punto.lat), 30);
    }
  }

  // Las etiquetas de sector se dibujan al final (encima de todo lo demás,
  // como una etiqueta real de mapa), debajo de su punto (para no taparse con
  // el pin de foto, que va arriba del suyo) -- cada una con su propio alpha
  // de aparición/desvanecido (ver alphaEtiqueta) y su propia posición
  // suavizada cuadro a cuadro (ver suavizadoEtiquetas, mutado acá).
  // El suavizado (lerp cuadro a cuadro) existe solo para disimular el
  // salto del ajuste anti-corte cerca del borde -- durante el trazo la
  // cámara persigue el punto actual sin moverse por su cuenta, así que ese
  // salto sería lo único que se sentiría brusco. En la panorámica final
  // (fraccionTotal > FRACCION_TRAZO_COMPLETO) la cámara YA se aleja sola con
  // su propia curva suave (ver estadoCamara) -- sumarle el lerp encima
  // hacía que la etiqueta se sintiera "atrasada" persiguiendo al mapa en vez
  // de ir clavada con él (el reporte de "la etiqueta avanza con el
  // recorrido" al reaparecer). Ahí se dibuja directo en la posición real,
  // sin suavizado extra: sigue al mapa cuadro a cuadro, sin retraso.
  const enPanoramicaFinal = fraccionTotal > FRACCION_TRAZO_COMPLETO;
  for (let i = 0; i < config.sectoresRuta.length; i++) {
    const etiqueta = config.sectoresRuta[i];
    const alpha = alphaEtiqueta(etiqueta, fraccionTotal);
    if (alpha > 0) {
      const anterior = enPanoramicaFinal ? null : suavizadoEtiquetas.get(i) ?? null;
      const nuevo = dibujarEtiquetaSector(ctx, x(etiqueta.lon), y(etiqueta.lat) + 32, etiqueta.nombre, alpha, anterior);
      suavizadoEtiquetas.set(i, nuevo);
    } else {
      suavizadoEtiquetas.delete(i);
    }
  }

  ctx.restore();

  // Cuadro de cierre (panorámica, sin foto o con estiloFoto "mapa"): la
  // barra de arriba se agranda un poco para sumar vel. promedio/máxima como
  // resumen final -- antes solo quedaban distancia/tiempo, que ya vienen
  // mostrándose desde el principio del video.
  const contadorAltura = frame.mostrarFin ? 160 : 118;
  // Más opaca que antes en ambos estados -- contra mapas satelitales claros
  // (nieve, arena, hormigón) el texto se perdía incluso con la sombra de
  // abajo; subir la opacidad de la barra es lo que de verdad garantiza
  // contraste, la sombra sola no alcanzaba.
  ctx.fillStyle = frame.mostrarFin ? "rgba(13,10,6,0.75)" : "rgba(13,10,6,0.62)";
  ctx.fillRect(0, 0, ANCHO_VIDEO, contadorAltura);
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.85)";
  ctx.shadowBlur = 6;
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
  ctx.restore();

  if (frame.mostrarFin) {
    ctx.save();
    ctx.textAlign = "center";
    ctx.shadowColor = "rgba(0,0,0,0.85)";
    ctx.shadowBlur = 6;
    ctx.fillStyle = DORADO;
    ctx.font = "800 21px Arial, sans-serif";
    ctx.fillText(
      `VEL. PROMEDIO ${Math.round(datos.velocidadPromedio)} km/h  ·  VEL. MÁXIMA ${Math.round(datos.velocidadMaxima)} km/h`,
      ANCHO_VIDEO / 2,
      110,
    );
    ctx.restore();
  }
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

// Cuadro de cierre final (después de la panorámica, o de la foto de portada
// si se eligió estiloFoto "final"): el logo real de la Legión en grande
// (acá SÍ se usa la imagen -- a este tamaño el detalle del emblema se ve
// bien, a diferencia del corner badge chico que se reemplazó por el
// monograma vectorial) y la ciudad debajo. Fondo sólido de marca, sin mapa
// -- es un cierre de cortina, no otro cuadro del recorrido. El logo se
// dibuja COMPLETO (dibujarImagenContain), sin recortarlo en un círculo
// propio -- el archivo ya es una insignia circular con alas que llegan
// casi al borde de su lienzo; un recorte nuestro encima le cortaba las
// puntas de las alas.
function dibujarCierreVideo(ctx: CanvasRenderingContext2D, logoGrandeImg: HTMLImageElement | null, ciudad: string) {
  ctx.clearRect(0, 0, ANCHO_VIDEO, ALTO_VIDEO);
  ctx.fillStyle = "#0d0a06";
  ctx.fillRect(0, 0, ANCHO_VIDEO, ALTO_VIDEO);
  ctx.textBaseline = "alphabetic";

  const cx = ANCHO_VIDEO / 2;
  const cy = ALTO_VIDEO / 2 - 60;
  const tamano = 300;
  if (logoGrandeImg) {
    dibujarImagenContain(ctx, logoGrandeImg, cx, cy, tamano);
  } else {
    dibujarCirculoConImagen(ctx, null, cx, cy, tamano / 2, "L");
  }

  ctx.textAlign = "center";
  ctx.fillStyle = DORADO;
  ctx.font = "800 32px Arial, sans-serif";
  ctx.fillText("LEGIÓN ROLLER", cx, cy + tamano / 2 + 50);

  if (ciudad) {
    ctx.fillStyle = GRIS_TEXTO;
    ctx.font = "700 26px Arial, sans-serif";
    ctx.fillText(ciudad, cx, cy + tamano / 2 + 88);
  }
}

// Reparte hasta 3 pines de foto por distancia del recorrido -- con 1 sola
// foto queda en la mitad (mismo criterio de siempre); con 2 o 3, separadas
// entre sí para no amontonarse (sin pegarse a los extremos, donde la cámara
// ya está persiguiendo el inicio/fin del trazo).
function fraccionesPines(n: number): number[] {
  if (n <= 1) return [0.5];
  if (n === 2) return [0.35, 0.7];
  return [0.18, 0.5, 0.82];
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
    duracionCierreSeg = DURACION_CIERRE_SEG_DEFECTO,
    fps = FPS_DEFECTO,
    onProgreso,
    fotoFinalDataUrl = null,
    fotosPinDataUrl = [],
    avatarUrl = null,
    nombreUsuario,
    musicaUrl,
    musicaInicioSeg = 0,
  } = opciones;

  if (typeof MediaRecorder === "undefined") {
    throw new Error("Este navegador no puede generar video.");
  }
  if (datos.puntos.length < 2) {
    throw new Error("El recorrido no tiene suficientes puntos para animar.");
  }

  const [logoGrandeDataUrl, mapa, avatarDataUrl] = await Promise.all([
    cargarImagenComoDataUrl("/logo-legion-roller.png"),
    generarMapaReal(datos.puntos, ANCHO_VIDEO, ALTO_VIDEO, false),
    avatarUrl ? cargarImagenComoDataUrl(avatarUrl) : Promise.resolve(null),
  ]);

  // Las imágenes (mapa, fotos, avatar, logo) se decodifican UNA sola vez acá,
  // antes de arrancar la animación -- la versión anterior reincrustaba el
  // mapa completo (base64) dentro de un SVG nuevo en CADA cuadro y lo volvía
  // a rasterizar, lo que con el mapa ahora a pantalla completa tardaba tanto
  // por cuadro que el video terminaba grabándose muchísimo más lento que en
  // tiempo real (se notaba como "cuadro por cuadro"). Con las imágenes ya
  // decodificadas, dibujar un cuadro es un puñado de drawImage()/stroke()
  // directos sobre el canvas -- sin async, sin volver a parsear texto
  // gigante -- así que corre a la velocidad real que pide el fps. El logo
  // grande (real, con todo su detalle) solo se usa en el cuadro de cierre
  // final -- ahí es lo bastante grande para verse bien; el corner badge
  // chico que se veía pixelado se sacó del video.
  const [mapaImg, fotoFinalImg, fotosPinImg, avatarImg, logoGrandeImg] = await Promise.all([
    cargarImagenOpcional(mapa?.dataUrl ?? null),
    cargarImagenOpcional(fotoFinalDataUrl),
    Promise.all(fotosPinDataUrl.map((d) => cargarImagenOpcional(d))),
    cargarImagenOpcional(avatarDataUrl),
    cargarImagenOpcional(logoGrandeDataUrl),
  ]);

  const distanciaAcumuladaKm = [0];
  const velocidadesKmh = [0];
  for (let i = 1; i < datos.puntos.length; i++) {
    const distTramoKm = distanciaHaversineKm(datos.puntos[i - 1], datos.puntos[i]);
    distanciaAcumuladaKm.push(distanciaAcumuladaKm[i - 1] + distTramoKm);
    const dtSeg = (datos.puntos[i].timestamp - datos.puntos[i - 1].timestamp) / 1000;
    velocidadesKmh.push(dtSeg > 0 ? (distTramoKm / dtSeg) * 3600 : 0);
  }

  const { punto: puntoVelMax, indice: indiceVelMax, kmh: kmhVelMax } = velocidadMaximaConPunto(datos.puntos);

  // Cada pin de foto se clava en un punto real del recorrido, repartido POR
  // DISTANCIA (no por índice ni por tiempo -- así se ve repartido en el
  // trazo incluso si el usuario se detuvo mucho rato en un tramo, lo que
  // dejaría muchos más puntos ahí).
  const pinesFoto: PinFotoVideo[] = fotosPinImg.flatMap((img, i) => {
    if (!img) return [];
    const fraccion = fraccionesPines(fotosPinImg.length)[i];
    const distanciaObjetivoKm = fraccion * datos.distanciaKm;
    let indice = 0;
    while (indice < distanciaAcumuladaKm.length - 1 && distanciaAcumuladaKm[indice] < distanciaObjetivoKm) {
      indice++;
    }
    return [{ img, punto: datos.puntos[indice], distanciaKm: distanciaAcumuladaKm[indice] }];
  });

  // Convierte cada etiqueta de sector (lat/lon + distanciaKm real) en su
  // ventana de aparición/desvanecido -- ver EtiquetaTiempoVideo/
  // alphaEtiqueta. distanciaMostrar avanza LINEAL con fraccionTotal durante
  // el trazo (ver estadoEnFraccion), así que alcanza con despejar en qué
  // fraccionTotal se cruza esa distancia.
  const sectoresRuta: EtiquetaTiempoVideo[] = (datos.sectoresRuta ?? []).map((etiqueta) => {
    const inicioFraccion =
      datos.distanciaKm > 0
        ? Math.min(FRACCION_TRAZO_COMPLETO, (etiqueta.distanciaKm / datos.distanciaKm) * FRACCION_TRAZO_COMPLETO)
        : 0;
    const fadeFraccion = FADE_ETIQUETA_PCT * FRACCION_TRAZO_COMPLETO;
    const holdFraccion = HOLD_ETIQUETA_PCT * FRACCION_TRAZO_COMPLETO;
    return {
      nombre: etiqueta.nombre,
      lat: etiqueta.lat,
      lon: etiqueta.lon,
      inicioFraccion,
      finFadeInFraccion: inicioFraccion + fadeFraccion,
      finHoldFraccion: inicioFraccion + fadeFraccion + holdFraccion,
      finFraccion: inicioFraccion + fadeFraccion + holdFraccion + fadeFraccion,
    };
  });

  const config: ConfigVideo = {
    puntoVelMax,
    distanciaVelMaxKm: indiceVelMax >= 0 ? distanciaAcumuladaKm[indiceVelMax] : Infinity,
    kmhVelMax,
    fotoFinalImg,
    pinesFoto,
    sectoresRuta,
    velocidadesKmh,
    kmhReferenciaColor: Math.max(kmhVelMax, 8),
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

  // Posición suavizada de cada etiqueta (por índice), persistida ENTRE
  // cuadros -- ver dibujarEtiquetaSector.
  const suavizadoEtiquetas = new Map<number, { x: number; y: number }>();

  function dibujarFrame(fraccionTotal: number, mostrarFotoFinal: boolean, pulsoVelMax = 0) {
    const fraccionTrazo = Math.min(1, fraccionTotal / FRACCION_TRAZO_COMPLETO);
    const frame = estadoEnFraccion(datos, distanciaAcumuladaKm, fraccionTrazo);
    dibujarCuadroVideo(
      ctx!,
      datos,
      mapaImg,
      x,
      y,
      focoCentroPx,
      frame,
      fraccionTotal,
      config,
      mostrarFotoFinal,
      pulsoVelMax,
      suavizadoEtiquetas,
    );
  }

  // Primer cuadro dibujado ANTES de arrancar a grabar, para no capturar un
  // instante en blanco.
  dibujarFrame(0, false);

  // Música de fondo (opcional): se decodifica y arranca a reproducir ANTES
  // de crear el MediaRecorder, mezclada como un track de audio más sobre el
  // mismo stream que graba el canvas -- así queda "quemada" dentro del
  // .webm resultante, sin depender de que quien lo reproduzca sepa nada de
  // música por separado. Si algo falla acá (red, decode, navegador sin Web
  // Audio), sigue igual pero mudo -- nunca revienta la generación del video.
  let audioCtx: AudioContext | null = null;
  let fuenteMusica: AudioBufferSourceNode | null = null;
  let gananciaMusica: GainNode | null = null;
  let destinoMusica: MediaStreamAudioDestinationNode | null = null;
  if (musicaUrl) {
    try {
      const AudioContextCtor =
        window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtx = new AudioContextCtor();
      const buffer = await cargarBufferMusica(musicaUrl, audioCtx);
      if (buffer) {
        destinoMusica = audioCtx.createMediaStreamDestination();
        gananciaMusica = audioCtx.createGain();
        gananciaMusica.gain.value = VOLUMEN_MUSICA;
        fuenteMusica = audioCtx.createBufferSource();
        fuenteMusica.buffer = buffer;
        fuenteMusica.connect(gananciaMusica).connect(destinoMusica);
        fuenteMusica.start(0, Math.min(musicaInicioSeg, Math.max(0, buffer.duration - 0.1)));
      } else {
        audioCtx.close().catch(() => {});
        audioCtx = null;
      }
    } catch {
      audioCtx = null;
      fuenteMusica = null;
      gananciaMusica = null;
      destinoMusica = null;
    }
  }

  const streamVideo = canvas.captureStream(fps);
  const stream = new MediaStream([
    ...streamVideo.getVideoTracks(),
    ...(destinoMusica ? destinoMusica.stream.getAudioTracks() : []),
  ]);
  const mediaRecorder = new MediaRecorder(stream, {
    mimeType: elegirMimeTypeVideo(!!destinoMusica),
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

    // Al llegar al punto de velocidad máxima, en vez de solo pausar se
    // redibuja unos cuadros más con un anillo que se expande y se
    // desvanece (ver dibujarMarcaVelMax) -- un "ping" real que llama la
    // atención, no un marcador estático que aparece de la nada.
    if (!pausaVelMaxHecha && config.puntoVelMax) {
      const fraccionTrazo = Math.min(1, fraccionTotal / FRACCION_TRAZO_COMPLETO);
      if (fraccionTrazo * datos.distanciaKm >= config.distanciaVelMaxKm) {
        pausaVelMaxHecha = true;
        const framesPulso = Math.max(1, Math.round((PAUSA_VELMAX_MS / 1000) * fps));
        for (let p = 1; p <= framesPulso; p++) {
          dibujarFrame(fraccionTotal, false, p / framesPulso);
          await new Promise((r) => setTimeout(r, intervaloMs));
        }
      }
    }
  }

  // Cuadro final congelado unos segundos más, para que en redes sociales
  // alcance a leerse antes de que corte -- panorámica del recorrido
  // completo, o la foto de portada si el usuario eligió estiloFoto "final".
  const mostrarFotoFinal = !!fotoFinalImg;
  dibujarFrame(1, mostrarFotoFinal);
  await new Promise((r) => setTimeout(r, duracionFinalSeg * 1000));

  // Cuadro de cierre final: logo grande + ciudad, después de todo lo
  // demás (panorámica o foto de portada). La música (si hay) se desvanece
  // en simultáneo, para que el corte de imagen y de audio se sientan
  // juntos en vez de uno después del otro.
  if (gananciaMusica && audioCtx) {
    const ahora = audioCtx.currentTime;
    gananciaMusica.gain.cancelScheduledValues(ahora);
    gananciaMusica.gain.setValueAtTime(gananciaMusica.gain.value, ahora);
    gananciaMusica.gain.linearRampToValueAtTime(0, ahora + duracionCierreSeg);
  }
  dibujarCierreVideo(ctx, logoGrandeImg, datos.ciudad ?? "");
  await new Promise((r) => setTimeout(r, duracionCierreSeg * 1000));

  mediaRecorder.stop();
  try {
    fuenteMusica?.stop();
  } catch {
    // ya se había detenido sola (el buffer terminó antes que el video) -- no pasa nada
  }
  audioCtx?.close().catch(() => {});
  onProgreso?.(1);
  return grabacionLista;
}
