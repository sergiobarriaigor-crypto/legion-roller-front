import {
  distanciaHaversineKm,
  velocidadMaximaConPunto,
  clasificarTramos,
  type PuntoGps,
  type ClasificacionTramo,
} from "./geo";
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
//
// PENDIENTE DE REVISIÓN antes de masificar el video de seguimiento (no
// tocar acá, solo documentado): "sin API key" no es lo mismo que "gratis e
// ilimitado para uso masivo/comercial" -- no hay un límite de solicitudes ni
// política de uso publicada que hayamos podido confirmar para este endpoint
// específico de tiles estáticos de server.arcgisonline.com. Mientras el
// video de seguimiento sea una prueba técnica de bajo volumen esto no es
// bloqueante, pero antes de lanzarlo a todos los usuarios habría que
// confirmar con Esri (o migrar a un plan/proveedor con límites conocidos) --
// ver registrarFalloTile más abajo, que ahora deja explícito en consola
// cualquier HTTP 429 (señal de throttling) para poder detectar esto durante
// las pruebas.
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

// Clasificación explícita del fallo de un tile -- pedido para las pruebas de
// la Opción C (cache de tiles + tope más alto de MAX_TILES_MOSAICO_SEGUIMIENTO):
// antes cualquier fallo (red, 404, 429, error de decodificación) caía en el
// mismo `return null` silencioso, indistinguible entre "no hay internet" y
// "Esri está limitando la cantidad de pedidos". No cambia el contrato de
// cargarTileComoImagen (nunca revienta, siempre devuelve null en cualquier
// fallo) -- solo agrega qué se ve en consola antes de devolver null. Esto es
// deliberadamente ruidoso (sin agregación/throttling de logs) porque es para
// las pruebas técnicas actuales, no para producción masiva -- si en el futuro
// esto se vuelve ruido real, hay que revisarlo antes de escalar el uso del
// proveedor (ver el comentario "PENDIENTE DE REVISIÓN" sobre la licencia de
// Esri, más arriba, junto a TILE_SATELITE_URL).
type MotivoFalloTile = "red" | "timeout" | "http_429" | "http_404" | "http_otro" | "decodificacion";

// Contadores REALES (no estimados) de una sola generación de video -- ver
// CacheTilesLRU.contadores, y el resumen final impreso por el wrapper
// generarVideoRecorrido (try/finally). Instrumentación temporal para las
// pruebas de mosaicos Z17: confirmar con datos de ejecución, no estimaciones,
// cuánto ayuda el cache y si Esri está devolviendo 429/timeouts en un
// volumen real de pedidos.
interface ContadoresTilesSeguimiento {
  fetchTotal: number;
  cacheHits: number;
  cacheMisses: number;
  exitosos: number;
  red: number;
  timeout: number;
  http429: number;
  http404: number;
  httpOtro: number;
  decodificacion: number;
  mosaicosOK: number;
  mosaicosNull: number;
}

function crearContadoresTilesSeguimiento(): ContadoresTilesSeguimiento {
  return {
    fetchTotal: 0,
    cacheHits: 0,
    cacheMisses: 0,
    exitosos: 0,
    red: 0,
    timeout: 0,
    http429: 0,
    http404: 0,
    httpOtro: 0,
    decodificacion: 0,
    mosaicosOK: 0,
    mosaicosNull: 0,
  };
}

function registrarFalloTile(
  motivo: MotivoFalloTile,
  url: string,
  detalle: string,
  contadores: ContadoresTilesSeguimiento | null = null,
): void {
  const mensajes: Record<MotivoFalloTile, string> = {
    red: `error de red pidiendo tile (${detalle})`,
    timeout: `timeout (>${TIMEOUT_TILE_MS}ms) pidiendo tile`,
    http_429: `HTTP 429 -- posible rate limit/throttling del proveedor (Esri)`,
    http_404: `HTTP 404 -- tile inexistente en el proveedor`,
    http_otro: `HTTP ${detalle} -- respuesta no exitosa`,
    decodificacion: `no se pudo leer/decodificar el tile descargado (${detalle})`,
  };
  console.warn(`[tiles] ${mensajes[motivo]}: ${url}`);
  if (!contadores) return;
  if (motivo === "red") contadores.red++;
  else if (motivo === "timeout") contadores.timeout++;
  else if (motivo === "http_429") contadores.http429++;
  else if (motivo === "http_404") contadores.http404++;
  else if (motivo === "http_otro") contadores.httpOtro++;
  else contadores.decodificacion++;
}

// `contadores` es opcional y solo lo pasan los llamadores que quieren
// estadísticas reales (ver obtenerTileConCache, exclusivo de los mosaicos de
// seguimiento) -- la panorámica (generarMapaReal/generarMapaDetallado, capa
// de etiquetas) sigue llamando esto sin contadores, sin cambio de
// comportamiento.
async function cargarTileComoImagen(
  url: string,
  contadores: ContadoresTilesSeguimiento | null = null,
): Promise<HTMLImageElement | null> {
  const controlador = new AbortController();
  const idTimeout = setTimeout(() => controlador.abort(), TIMEOUT_TILE_MS);
  let res: Response;
  try {
    try {
      res = await fetch(url, { signal: controlador.signal });
    } finally {
      clearTimeout(idTimeout);
    }
  } catch (err) {
    const esTimeout = err instanceof DOMException && err.name === "AbortError";
    registrarFalloTile(esTimeout ? "timeout" : "red", url, err instanceof Error ? err.message : String(err), contadores);
    return null;
  }
  if (!res.ok) {
    if (res.status === 429) registrarFalloTile("http_429", url, String(res.status), contadores);
    else if (res.status === 404) registrarFalloTile("http_404", url, String(res.status), contadores);
    else registrarFalloTile("http_otro", url, String(res.status), contadores);
    return null;
  }
  try {
    const blob = await res.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const lector = new FileReader();
      lector.onload = () => resolve(lector.result as string);
      lector.onerror = () => reject(new Error("no se pudo leer el tile"));
      lector.readAsDataURL(blob);
    });
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const imagen = new Image();
      imagen.onload = () => resolve(imagen);
      imagen.onerror = () => reject(new Error("no se pudo decodificar el tile"));
      imagen.src = dataUrl;
    });
    if (contadores) contadores.exitosos++;
    return img;
  } catch (err) {
    registrarFalloTile("decodificacion", url, err instanceof Error ? err.message : String(err), contadores);
    return null;
  }
}

// Variante EXCLUSIVA de la grilla Z17 de seguimiento (ver
// prepararTilesZ17/construirCorredorTilesZ17 más abajo) -- mismo fetch/
// manejo de error/timeout que cargarTileComoImagen, pero decodifica
// directo `fetch → blob → createImageBitmap(blob)`, sin el rodeo por
// FileReader/dataURL/`new Image()` (puro desperdicio de CPU para un tile
// que de todos modos se va a descartar apenas termine de decodificar).
// `createImageBitmap` acá es Fase A (permitido) -- Fase B nunca la llama,
// solo lee del Map ya poblado. Se prefiere ImageBitmap sobre
// HTMLImageElement específicamente por `.close()`: liberación
// determinística de memoria GPU/CPU, más estable que depender del GC del
// navegador bajo presión de memoria (ver diseño aprobado, prioridad
// "estabilidad en Chrome/Android").
async function cargarTileComoImageBitmap(
  url: string,
  contadores: ContadoresTilesSeguimiento | null = null,
): Promise<ImageBitmap | null> {
  const controlador = new AbortController();
  const idTimeout = setTimeout(() => controlador.abort(), TIMEOUT_TILE_MS);
  let res: Response;
  try {
    try {
      res = await fetch(url, { signal: controlador.signal });
    } finally {
      clearTimeout(idTimeout);
    }
  } catch (err) {
    const esTimeout = err instanceof DOMException && err.name === "AbortError";
    registrarFalloTile(esTimeout ? "timeout" : "red", url, err instanceof Error ? err.message : String(err), contadores);
    return null;
  }
  if (!res.ok) {
    if (res.status === 429) registrarFalloTile("http_429", url, String(res.status), contadores);
    else if (res.status === 404) registrarFalloTile("http_404", url, String(res.status), contadores);
    else registrarFalloTile("http_otro", url, String(res.status), contadores);
    return null;
  }
  try {
    const blob = await res.blob();
    const bitmap = await createImageBitmap(blob);
    if (contadores) contadores.exitosos++;
    return bitmap;
  } catch (err) {
    registrarFalloTile("decodificacion", url, err instanceof Error ? err.message : String(err), contadores);
    return null;
  }
}

// Cache temporal de tiles YA DESCARGADOS, exclusivo de UNA generación de
// video (ver generarVideoRecorrido) -- no es un cache de módulo ni persiste
// entre videos/usuarios. Mosaicos de seguimiento consecutivos (ver
// calcularMosaicosSeguimiento) se superponen mucho geográficamente, así que
// buena parte de sus tiles son literalmente el mismo z/x/y ya descargado
// para el mosaico anterior -- sin este cache, generarMapaEnZoom lo vuelve a
// pedir por red cada vez. Guarda la Promise (no la Image ya resuelta) para
// que si dos mosaicos vecinos necesitan el mismo tile EN PARALELO (ver
// prepararTodosLosMosaicosSeguimiento, que puede generar varios mosaicos a
// la vez -- ver CONCURRENCIA_PREPARACION_SEGUIMIENTO), el segundo reutilice
// el mismo fetch en vuelo en vez de duplicarlo.
//
// Solo se usa para la capa satelital de los mosaicos de seguimiento (ver
// generarMapaEnZoom): la clave es nada más "zoom/x/y" porque esta cache
// nunca recibe tiles de la capa de etiquetas (los mosaicos de seguimiento
// siempre piden incluirEtiquetas=false) ni tiles del panorámico (generarMapaReal/
// generarMapaDetallado no reciben cache) -- si algún día se cachea más de
// una capa, la clave necesitaría incluir cuál.
interface CacheTilesLRU {
  entradas: Map<string, Promise<HTMLImageElement | null>>;
  limite: number;
  contadores: ContadoresTilesSeguimiento;
}

function crearCacheTilesLRU(limite: number): CacheTilesLRU {
  return { entradas: new Map(), limite, contadores: crearContadoresTilesSeguimiento() };
}

// Vacía el cache por completo -- se llama al terminar generarVideoRecorrido
// (éxito o error, ver el wrapper con try/finally más abajo). Las Promises
// resueltas (Image ya decodificada) quedan sin ninguna referencia viva acá
// adentro; como cargarTileComoImagen usa dataURL (no URL.createObjectURL),
// no hace falta revocar nada explícito -- el recolector de basura se encarga
// en cuanto no queda ninguna otra referencia (los mosaicos ya compuestos
// guardan su propio dataURL final, no una referencia a los Image de cada tile).
function limpiarCacheTilesLRU(cache: CacheTilesLRU): void {
  cache.entradas.clear();
}

function obtenerTileConCache(
  cache: CacheTilesLRU | null,
  plantilla: string,
  zoom: number,
  x: number,
  y: number,
): Promise<HTMLImageElement | null> {
  const url = urlTile(plantilla, zoom, x, y);
  if (!cache) return cargarTileComoImagen(url);
  const clave = `${zoom}/${x}/${y}`;
  const existente = cache.entradas.get(clave);
  if (existente) {
    cache.contadores.cacheHits++;
    // Reinsertar al final = "más recientemente usado" (Map conserva orden
    // de inserción, así que el primer par es siempre el menos usado
    // recientemente -- ver la expulsión más abajo).
    cache.entradas.delete(clave);
    cache.entradas.set(clave, existente);
    return existente;
  }
  cache.contadores.cacheMisses++;
  cache.contadores.fetchTotal++;
  const promesa = cargarTileComoImagen(url, cache.contadores);
  cache.entradas.set(clave, promesa);
  if (cache.entradas.size > cache.limite) {
    const claveMasAntigua = cache.entradas.keys().next().value;
    if (claveMasAntigua !== undefined) cache.entradas.delete(claveMasAntigua);
  }
  return promesa;
}

interface MapaGenerado {
  dataUrl: string;
  zoom: number;
  centroPxX: number;
  centroPxY: number;
}

// Variante de MapaGenerado para el pipeline de mosaicos de seguimiento (ver
// Fase A / prepararTodosLosMosaicosSeguimiento): en vez de PNG codificado en
// un dataUrl (que después hay que decodificar de nuevo con new Image()),
// entrega directamente un ImageBitmap listo para ctx.drawImage() -- se
// elimina por completo el viaje canvas -> toDataURL() -> string base64 ->
// Image -> decode que causaba los bloqueos de varios segundos en el loop de
// render (ver [render-diag] de la ronda de diagnóstico anterior).
interface MosaicoBitmap {
  bitmap: ImageBitmap;
  zoom: number;
  centroPxX: number;
  centroPxY: number;
}

// Pide y compone los tiles de un zoom/centro ya decididos por el llamador
// (generarMapaReal calcula el zoom que hace entrar TODO el recorrido;
// generarMapaDetallado, más abajo, pide el mismo recuadro geográfico un
// zoom más arriba, con el doble de lienzo, para tener detalle real donde
// antes solo había un acercamiento digital). Mismo criterio de "nunca
// romper la tarjeta/video": ante cualquier falla devuelve null.
// Dos formatos de salida posibles (ver diseño Fase A / Fase B aprobado):
// "dataUrl" (por defecto, comportamiento de siempre -- PNG codificado, para
// generarMapaReal/generarMapaDetallado) o "bitmap" (exclusivo del pipeline
// de mosaicos de seguimiento -- entrega un ImageBitmap ya decodificado,
// listo para dibujar, sin pasar por toDataURL()/new Image()). Sobrecargas
// para que el tipo de retorno quede resuelto en tiempo de compilación según
// qué `formato` se pasa, sin castear en cada llamador.
async function generarMapaEnZoom(
  centroPxX: number,
  centroPxY: number,
  zoom: number,
  anchoDestino: number,
  altoDestino: number,
  incluirEtiquetas: boolean,
  maxTiles: number,
  cache?: CacheTilesLRU | null,
  etiquetaDiagnostico?: string | null,
  escalaSalida?: number,
  formato?: "dataUrl",
): Promise<MapaGenerado | null>;
async function generarMapaEnZoom(
  centroPxX: number,
  centroPxY: number,
  zoom: number,
  anchoDestino: number,
  altoDestino: number,
  incluirEtiquetas: boolean,
  maxTiles: number,
  cache: CacheTilesLRU | null,
  etiquetaDiagnostico: string | null,
  escalaSalida: number,
  formato: "bitmap",
): Promise<MosaicoBitmap | null>;
async function generarMapaEnZoom(
  centroPxX: number,
  centroPxY: number,
  zoom: number,
  anchoDestino: number,
  altoDestino: number,
  incluirEtiquetas: boolean,
  maxTiles: number,
  // Solo lo usan los mosaicos de seguimiento (ver prepararTodosLosMosaicosSeguimiento)
  // -- la panorámica (generarMapaReal/generarMapaDetallado) sigue sin cache,
  // exactamente como antes, al no pasar este argumento.
  cache: CacheTilesLRU | null = null,
  // Instrumentación temporal (ver prepararTodosLosMosaicosSeguimiento): si
  // viene una etiqueta ("indice=N"), loguea inicio/resultado de ESTE
  // mosaico puntual -- la panorámica no pasa etiqueta, así que sigue muda
  // como antes.
  etiquetaDiagnostico: string | null = null,
  // Cuántos píxeles físicos del canvas por píxel lógico de destino -- por
  // defecto ESCALA (retina, 2x), igual que siempre. Los mosaicos de
  // seguimiento pasan ESCALA_SALIDA_MOSAICO_SEGUIMIENTO (1) acá: los tiles
  // fuente son 256px reales sin variante "@2x", así que estirarlos 2x en
  // este paso no agregaba detalle real, solo costo (memoria, toDataURL,
  // decode) -- ver diseño aprobado.
  escalaSalida: number = ESCALA,
  // "dataUrl" (por defecto) codifica a PNG como siempre. "bitmap" devuelve
  // un ImageBitmap directamente dibujable, sin tocar toDataURL()/Image en
  // absoluto -- ver el branch al final de esta función.
  formato: "dataUrl" | "bitmap" = "dataUrl",
): Promise<MapaGenerado | MosaicoBitmap | null> {
  // Diagnóstico temporal (investigación de por qué un video a 30fps termina
  // con ~80% de cuadros duplicados): separa descarga/red, drawImage de
  // tiles y toDataURL en tres mediciones independientes, cada una con
  // performance.now() ABSOLUTO (no relativo al loop de render) para poder
  // cruzarlas directo contra los [render-diag] *** STALL *** del loop
  // principal, que usa el mismo reloj. tEtiqueta ya trae "indice=N" (ver
  // prepararTodosLosMosaicosSeguimiento) para los mosaicos de seguimiento;
  // "sin-etiqueta" para la panorámica/detallado, que no lo pasan.
  const tEtiqueta = etiquetaDiagnostico ?? "sin-etiqueta";
  try {
    const tiles = calcularTilesNecesarios(centroPxX, centroPxY, zoom, anchoDestino, altoDestino);
    if (etiquetaDiagnostico) {
      console.log(`[mosaico] ${etiquetaDiagnostico} descarga iniciada -- tiles calculados=${tiles.length} (maxTiles=${maxTiles})`);
    }
    if (tiles.length === 0 || tiles.length > maxTiles) {
      if (etiquetaDiagnostico) {
        console.warn(
          `[mosaico] ${etiquetaDiagnostico} generarMapaEnZoom devolvió null -- tiles calculados=${tiles.length} supera maxTiles=${maxTiles}`,
        );
        if (cache) cache.contadores.mosaicosNull++;
      }
      return null;
    }

    console.log(`[render-diag] inicio generación mosaico ${tEtiqueta} tiles=${tiles.length} tAbsMs=${performance.now().toFixed(0)}`);
    const tRedInicio = performance.now();
    const [imagenesBase, imagenesEtiquetas] = await Promise.all([
      Promise.all(tiles.map((t) => obtenerTileConCache(cache, TILE_SATELITE_URL, zoom, t.x, t.y))),
      incluirEtiquetas
        ? Promise.all(tiles.map((t) => cargarTileComoImagen(urlTile(TILE_ETIQUETAS_URL, zoom, t.x, t.y))))
        : Promise.resolve(tiles.map(() => null)),
    ]);
    const tRedMs = performance.now() - tRedInicio;
    (tRedMs > 50 ? console.warn : console.log)(
      `[render-diag] ${tEtiqueta} descarga/red (${tiles.length} tiles) = ${tRedMs.toFixed(1)}ms tAbsMs=${performance.now().toFixed(0)}`,
    );
    const cargados = imagenesBase.filter((img) => img !== null).length;
    const fallidos = imagenesBase.length - cargados;
    if (imagenesBase.every((img) => img === null)) {
      if (etiquetaDiagnostico) {
        console.warn(`[mosaico] ${etiquetaDiagnostico} generarMapaEnZoom devolvió null -- los ${tiles.length} tiles fallaron`);
        if (cache) cache.contadores.mosaicosNull++;
      }
      return null;
    }

    // El canvas de composición va al doble de tamaño (ESCALA), para que el
    // mapa se vea nítido en la tarjeta final exportada a resolución retina
    // — los tiles satelitales de Esri no tienen variante "@2x" como Carto,
    // así que acá se estiran al dibujarse (misma nitidez que ya se ve en el
    // mapa satelital dentro de la app).
    //
    // OJO -- pregunta explícita del round de instrumentación: si algunos
    // tiles fallan (parcial, no todos), el mosaico SE GENERA IGUAL con este
    // fillRect de fondo visible en cada hueco (NO transparente, NO se
    // devuelve null) -- cada tile fallido deja un rectángulo sólido de este
    // color exacto (#1a1108, marrón muy oscuro) del tamaño físico de un tile
    // (TAM_TILE*ESCALA = 512×512 px) en su posición real dentro del mosaico.
    // Si varios tiles vecinos fallan juntos (ej. una ráfaga de 429 del
    // proveedor bajo carga real, con Promise.all pidiendo ~112-150 tiles en
    // paralelo), esos huecos se ven como UN rectángulo sólido más grande,
    // no puntos sueltos -- candidato serio para explicar el "rectángulo que
    // no corresponde" reportado, independiente de si el mosaico "existe" o
    // no (acá SÍ existe, solo tiene huecos).
    const canvas = document.createElement("canvas");
    canvas.width = anchoDestino * escalaSalida;
    canvas.height = altoDestino * escalaSalida;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#1a1108";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // tiles.forEach, canvas.toDataURL() y createImageBitmap() son trabajo
    // pesado que corre en el mismo hilo que el loop de dibujarFrame cuando
    // se dispara sin await desde ahí -- por eso, en el pipeline de
    // seguimiento (Fase A / prepararTodosLosMosaicosSeguimiento), TODO esto
    // se resuelve antes de arrancar MediaRecorder, no durante la grabación
    // (ver diseño aprobado). Se mide cada paso por separado para saber cuál
    // pesa más -- warn (en vez de log) cuando supera 50ms, para que salte a
    // la vista en medio de un log largo.
    const tDibujoInicio = performance.now();
    tiles.forEach((t, i) => {
      const base = imagenesBase[i];
      if (base)
        ctx.drawImage(base, t.destX * escalaSalida, t.destY * escalaSalida, TAM_TILE * escalaSalida, TAM_TILE * escalaSalida);
      const etiquetas = imagenesEtiquetas[i];
      if (etiquetas)
        ctx.drawImage(etiquetas, t.destX * escalaSalida, t.destY * escalaSalida, TAM_TILE * escalaSalida, TAM_TILE * escalaSalida);
    });
    const tDibujoMs = performance.now() - tDibujoInicio;
    (tDibujoMs > 50 ? console.warn : console.log)(
      `[render-diag] ${tEtiqueta} drawImage de tiles (x${tiles.length}) = ${tDibujoMs.toFixed(1)}ms tAbsMs=${performance.now().toFixed(0)}`,
    );

    if (etiquetaDiagnostico) {
      console.log(
        `[mosaico] ${etiquetaDiagnostico} generado OK -- tiles ${cargados}/${tiles.length} cargados (${fallidos} fallidos), canvas=${canvas.width}x${canvas.height}`,
      );
      if (cache) cache.contadores.mosaicosOK++;
    }

    if (formato === "bitmap") {
      const tBitmapInicio = performance.now();
      const bitmap = await createImageBitmap(canvas);
      const tBitmapMs = performance.now() - tBitmapInicio;
      (tBitmapMs > 50 ? console.warn : console.log)(
        `[render-diag] ${tEtiqueta} createImageBitmap (${canvas.width}x${canvas.height}) = ${tBitmapMs.toFixed(1)}ms tAbsMs=${performance.now().toFixed(0)}`,
      );
      return { bitmap, zoom, centroPxX, centroPxY };
    }

    const tDataUrlInicio = performance.now();
    const dataUrl = canvas.toDataURL("image/png");
    const tDataUrlMs = performance.now() - tDataUrlInicio;
    (tDataUrlMs > 50 ? console.warn : console.log)(
      `[render-diag] ${tEtiqueta} toDataURL (${canvas.width}x${canvas.height}) = ${tDataUrlMs.toFixed(1)}ms tAbsMs=${performance.now().toFixed(0)}`,
    );

    return { dataUrl, zoom, centroPxX, centroPxY };
  } catch (err) {
    if (etiquetaDiagnostico) {
      console.warn(`[mosaico] ${etiquetaDiagnostico} excepción: ${err instanceof Error ? err.message : String(err)}`);
      if (cache) cache.contadores.mosaicosNull++;
    }
    return null;
  }
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
  const lats = puntos.map((p) => p.lat);
  const lons = puntos.map((p) => p.lon);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);

  const zoom = elegirZoom(minLat, maxLat, minLon, maxLon, anchoDestino, altoDestino);
  const centroPxX = lonAPixelX((minLon + maxLon) / 2, zoom);
  const centroPxY = latAPixelY((minLat + maxLat) / 2, zoom);

  return generarMapaEnZoom(centroPxX, centroPxY, zoom, anchoDestino, altoDestino, incluirEtiquetas, 48);
}

// Segundo mapa, EXCLUSIVO del video, con más detalle real que el panorámico
// (generarMapaReal): mismo centro geográfico y mismo recuadro que `mapaBase`,
// pero un zoom más arriba (el doble de densidad de píxeles reales de tile) en
// un lienzo del doble de ancho/alto -- cubre exactamente la misma zona que
// mapaBase, solo que con el doble de detalle. Antes, la cámara "cercana" del
// video (ver ESCALA_CAMARA_CERCANA) hacía un acercamiento puramente digital
// sobre el mapa panorámico -- en recorridos largos ese panorámico ya viene a
// un zoom bajo (para que entre todo el trazo), así que acercarse digitalmente
// solo agrandaba píxeles borrosos ("puro montañas", sin calles). Con este
// segundo mapa, el tramo de persecución de la cámara dibuja tiles reales de
// más detalle en vez de agrandar los mismos píxeles -- ver dibujarFondoMapaVideo.
// Al cubrir el mismo recuadro que mapaBase, la posición de cualquier punto acá
// es exactamente `factorDetalle` veces su posición en mapaBase (mismo centro,
// mismo ángulo) -- por eso no hace falta una proyección x()/y() aparte, el
// trazo/pines/etiquetas siguen calculándose en el espacio de mapaBase.
async function generarMapaDetallado(
  mapaBase: MapaGenerado,
  anchoDestino: number,
  altoDestino: number,
): Promise<MapaGenerado | null> {
  const incrementoZoom = 1;
  const factorDetalle = 2 ** incrementoZoom;
  return generarMapaEnZoom(
    mapaBase.centroPxX * factorDetalle,
    mapaBase.centroPxY * factorDetalle,
    mapaBase.zoom + incrementoZoom,
    anchoDestino * factorDetalle,
    altoDestino * factorDetalle,
    false,
    // Lienzo del doble de ancho/alto en el zoom siguiente = ~4x los tiles
    // del panorámico -- tope más generoso porque es un "mejor esfuerzo"
    // (si falla, dibujarFondoMapaVideo cae de vuelta al panorámico solo).
    160,
  );
}

// --- Video 2D: cámara de seguimiento sobre una grilla Z17 continua ---
//
// Reemplaza, SOLO durante el tramo de seguimiento (fraccionTotal <=
// FRACCION_TRAZO_COMPLETO), el esquema anterior de "una panorámica +
// un detalle digital sobre la misma ventana" -- ese esquema no podía dar
// sensación de cámara cercana en rutas urbanas largas porque la panorámica
// (elegirZoom) se calcula para que ENTRE TODA la ruta, así que ya arranca
// lejos antes de cualquier acercamiento óptico.
//
// A diferencia del esquema anterior (mosaicos grandes pre-compuestos,
// calcularMosaicosSeguimiento/seleccionarMosaico/dibujarMosaicosSeguimiento,
// eliminados -- ver diseño aprobado "tiles Z17 directos"), acá NO se
// compone ningún canvas grande: la cámara viaja sobre la misma grilla
// nativa de tiles Web Mercator (256x256, ZOOM_SEGUIMIENTO fijo) que ya usa
// la panorámica, dibujando directamente los tiles que caen dentro del
// viewport cada cuadro (ver construirCorredorTilesZ17/prepararTilesZ17/
// dibujarTilesZ17 más abajo). Sin "mosaico actual/siguiente", sin
// crossfade entre tiles, sin radioZonaSegura/radioLimite -- los tiles
// vecinos son la MISMA grilla, aparecen/desaparecen solo al entrar/salir
// del viewport. La panorámica (mapaImg/elegirZoom) sigue existiendo tal
// cual, reservada para PANORAMICA_HUECO/PANORAMICA_OUTRO.

// Zoom real fijo para el seguimiento -- nunca se aleja por más larga que
// sea la ruta (a diferencia de elegirZoom). Mismo orden que
// ZOOM_CENTRADO_AUTOMATICO en MapaView.tsx (16, ya validado ahí como
// "cómodo para ver tu cuadra" al centrar el mapa en vivo) -- un paso más
// cerca porque acá el encuadre es una franja vertical angosta, no el mapa
// completo. Sujeto a ajuste visual.
const ZOOM_SEGUIMIENTO = 17;

// K = ESCALA_SEGUIMIENTO define cuántos píxeles de VIDEO representa cada
// píxel LÓGICO de ZOOM_SEGUIMIENTO -- K=1 es resolución nativa (ni
// estirado ni reducido): con escalaCropSeguimiento=1 (ver dibujarFrame),
// cada tile de 256x256 se dibuja 1:1 en pantalla, sin reescalado digital
// alguno (ver dibujarTilesZ17). VALOR INICIAL sujeto a ajuste visual: K>1
// acerca la cámara, K<1 la aleja.
//
// Durante el seguimiento, camara.escala (ver estadoCamara) pasa a valer
// `factor × ESCALA_SEGUIMIENTO` en vez del fijo ESCALA_CAMARA_CERCANA --
// demostrado matemáticamente que el `factor` (que depende de mapaBase.zoom,
// o sea de la distancia total de la ruta) se cancela al combinarse con la
// conversión geográfica real, dejando el nivel de acercamiento final
// idéntico sin importar qué zoom haya elegido la panorámica para la ruta
// completa. Importante (ver diseño aprobado, separación escala geográfica/
// zoom visual): `factor` (factorSeguimiento) sigue existiendo SOLO para
// convertir coordenadas canvas-base<->Z17 -- el recorte/dibujo de tiles
// usa escalaCropSeguimiento (=ESCALA_SEGUIMIENTO en régimen normal), NUNCA
// factorSeguimiento×ESCALA_SEGUIMIENTO, para no reintroducir accidentalmente
// una ampliación digital del tile.
const ESCALA_SEGUIMIENTO = 1;

// El pipeline de tiles Z17 (prepararTilesZ17 más abajo) ya no pasa por
// CacheTilesLRU/obtenerTileConCache -- el Set de construirCorredorTilesZ17
// ya viene deduplicado, así que no hace falta una segunda capa de dedup en
// vuelo. Este límite queda solo para generarVideoRecorrido (wrapper, sin
// tocar), que sigue creando un CacheTilesLRU para reutilizar
// cacheTiles.contadores en el RESUMEN final -- generarMapaEnZoom (panorámica)
// sigue aceptando ese cache opcional tal cual, sin cambios.
const LIMITE_CACHE_TILES_SEGUIMIENTO = 300;

// Recorre datos.puntos REALES (no una versión simplificada -- acá no se
// paga un costo por punto como con los mosaicos grandes, así que no hace
// falta reducir la densidad) y arma el Set de tiles Z17 únicos "x/y" que
// la cámara de seguimiento puede llegar a necesitar en algún momento del
// video -- el corredor sigue la polilínea real, no el bounding box
// completo de la ruta (ver diseño aprobado).
//
// Respeta clasificacionTramos EXACTAMENTE con el mismo criterio que ya usa
// el trazado ([:2920] aprox., "if (clasificacionTramos[k+1]==='saltoGps')
// continue") -- un tramo saltoGps no suma cobertura de tiles, igual que
// hoy no dibuja línea ahí. Eso es lo que deja el hueco real en el corredor
// (PANORAMICA_HUECO se encarga de esa zona, nunca Z17) -- sin tocar
// clasificarTramos ni su lógica, solo reutilizando su resultado.
//
// margenExcursionPx (zona muerta + anticipación de cámara, ver
// RADIO_TOLERANCIA_PX/MAX_DESPLAZAMIENTO_ANTICIPACION_PX más abajo en el
// archivo) se referencia acá ADENTRO de la función a propósito -- son
// const declaradas más abajo en el archivo, pero como esto es el CUERPO de
// una función (no se evalúa hasta que se llama, bien entrada la
// generación del video, con el módulo ya completamente inicializado) no
// hay ningún problema de orden de declaración.
function construirCorredorTilesZ17(puntos: PuntoGps[], clasificacionTramos: ClasificacionTramo[]): Set<string> {
  const margenExcursionPx = RADIO_TOLERANCIA_PX + MAX_DESPLAZAMIENTO_ANTICIPACION_PX;
  const mitadAnchoPx = ANCHO_VIDEO / 2 + margenExcursionPx;
  const mitadAltoPx = ALTO_VIDEO / 2 + margenExcursionPx;
  // Paso máximo entre muestras a lo largo de un tramo confiable -- la
  // mitad más chica del margen de cobertura, para garantizar que dos
  // muestras consecutivas siempre tengan zonas de cobertura solapadas. Sin
  // esto, un tramo válido (no saltoGps) pero con puntos GPS espaciados de
  // forma poco frecuente podría dejar un hueco de tiles en el medio aunque
  // ambos extremos del tramo estén cubiertos.
  const pasoMuestreoPx = Math.min(mitadAnchoPx, mitadAltoPx);
  const tiles = new Set<string>();

  function agregarCobertura(gx: number, gy: number): void {
    const tileXMin = Math.floor((gx - mitadAnchoPx) / TAM_TILE);
    const tileXMax = Math.floor((gx + mitadAnchoPx) / TAM_TILE);
    const tileYMin = Math.floor((gy - mitadAltoPx) / TAM_TILE);
    const tileYMax = Math.floor((gy + mitadAltoPx) / TAM_TILE);
    for (let ty = tileYMin; ty <= tileYMax; ty++) {
      for (let tx = tileXMin; tx <= tileXMax; tx++) tiles.add(`${tx}/${ty}`);
    }
  }

  let anterior: { x: number; y: number } | null = null;
  for (let i = 0; i < puntos.length; i++) {
    const gx = lonAPixelX(puntos[i].lon, ZOOM_SEGUIMIENTO);
    const gy = latAPixelY(puntos[i].lat, ZOOM_SEGUIMIENTO);
    const segmentoConfiable = i > 0 && clasificacionTramos[i] !== "saltoGps";
    if (segmentoConfiable && anterior) {
      const dist = Math.hypot(gx - anterior.x, gy - anterior.y);
      const pasos = Math.max(1, Math.ceil(dist / pasoMuestreoPx));
      for (let p = 1; p <= pasos; p++) {
        const t = p / pasos;
        agregarCobertura(anterior.x + (gx - anterior.x) * t, anterior.y + (gy - anterior.y) * t);
      }
    } else {
      agregarCobertura(gx, gy);
    }
    anterior = { x: gx, y: gy };
  }
  return tiles;
}

// Posición de la cámara (canvas-base) expresada en píxeles GLOBALES de
// ZOOM_SEGUIMIENTO -- ver la demostración algebraica: sustituyendo la
// definición de canvas-base (cb = gz17/factor - mapaBase.centroPx + mitad
// video) dentro de la transformación de cámara (screen = mitad + (cb-cx)×
// escala, con escala=factor×K) se cancela el factor y queda
// screen = mitad + K×(gz17 - camaraZ17) -- una única transformación lineal
// "globalZ17 → pantalla". Esta función calcula ese `camaraZ17`; el trazo y
// el marcador (que siguen pasando por canvas-base, sin tocar ese código)
// terminan representando la MISMA transformación por construcción
// algebraica, no por coincidencia -- ver el mensaje de diseño aprobado.
function calcularCamaraZ17(
  camara: { cx: number; cy: number },
  mapaBase: MapaGenerado,
  factor: number,
): { x: number; y: number } {
  return {
    x: factor * (camara.cx + mapaBase.centroPxX - ANCHO_VIDEO / 2),
    y: factor * (camara.cy + mapaBase.centroPxY - ALTO_VIDEO / 2),
  };
}

// Opción 5 -- huecos de cobertura entre puntos GPS reales sin tiles Z17
// preparados (ver el diseño largo aprobado, comentario de
// coberturaCompletaZ17/dibujarFrame más abajo). En vez de forzar el
// seguimiento Z17 a través de una zona sin tiles, la cámara se aleja lo
// justo para encuadrar el ORIGEN (última posición con cobertura) y el
// DESTINO (adonde el recorrido forward-only normal habría llegado) en un
// solo cuadro, el marcador avanza sobre esa vista (panorámica ya cargada,
// dibujarFondoMapaVideo) sin ninguna geometría inventada, y al acercarse
// geográficamente al destino la cámara vuelve sola al seguimiento cercano
// -- ver el chequeo de coberturaCompletaZ17 en dibujarFrame, no un umbral
// de escala arbitrario.
// "convergiendo": la fuente Z17 YA está activa (coberturaCompletaZ17 ya
// dio true con la cámara real, incluida la detección de un hueco nuevo)
// pero camara.escala todavía viene convergiendo desde el encuadre amplio
// de la panorámica -- se desacopla a propósito de "regresando -> ninguno"
// (que antes activaba la fuente Y daba por terminada la convergencia en el
// mismo instante, forzando un salto de escalaCropSeguimiento de golpe a
// ESCALA_SEGUIMIENTO). No tiene condición de salida explícita hacia
// "ninguno": para todo propósito de dibujo/detección se trata igual que
// "ninguno" (ver los dos gates que aceptan ambas), y escalaCropSeguimiento
// converge sola hacia ESCALA_SEGUIMIENTO a medida que camara.escala
// converge hacia su régimen estable (ver verificar_continuidad_hueco.ts)
// -- si aparece un hueco nuevo mientras seguimos acá, se pasa directo a
// "en_hueco" como siempre, sin pasar por "ninguno" en el medio.
type FaseHueco = "ninguno" | "en_hueco" | "regresando" | "convergiendo";

interface EstadoHueco {
  fase: FaseHueco;
  indiceDestino: number | null;
  // Encuadre fijo calculado UNA sola vez al detectar el hueco (ver
  // calcularCamaraHueco) -- el objetivo de cámara mientras fase="en_hueco".
  camaraAmplia: EstadoCamara | null;
  // Escala "en tránsito", con su propio lag (mismo FACTOR_SUAVIZADO_CAMARA
  // que ya usa la posición en suavizarCamara) -- existe porque
  // suavizarCamara() NO interpola escala, solo posición (ver su código: pasa
  // objetivo.escala directo). Sin esto, el alejamiento/acercamiento de
  // escala se vería como un salto instantáneo en vez de una curva suave.
  escalaActual: number | null;
  // Cuántos cuadros lleva en fase "convergiendo" desde que recorteValido()
  // pasó a true (ver la transición regresando->convergiendo más abajo) --
  // null mientras no se disparó esa transición todavía. Uso EXCLUSIVO: el
  // peso del crossfade visual PANORAMICA_HUECO->Z17 (ver
  // CROSSFADE_HUECO_Z17_FRAMES) -- no participa de ninguna decisión
  // geométrica ni de la máquina de estados en sí (la continuidad
  // geométrica en ese instante ya está probada algebraicamente: mismo
  // centro, misma escala entre ambas fuentes -- ver diseño aprobado). Se
  // resetea a null cada vez que se detecta un hueco nuevo.
  cuadrosDesdeConvergencia: number | null;
}

// Duración (en cuadros) del crossfade visual al reactivarse Z17 después de
// un hueco: durante estos cuadros se dibuja PANORAMICA_HUECO opaca debajo y
// el mosaico Z17 encima con un peso creciente (ver dibujarCuadroVideo) --
// sin esto, la reactivación es un corte duro de una fuente satelital a
// otra en un solo cuadro (confirmado en corridas reales). Geométricamente
// ambas fuentes ya coinciden exactamente en centro y escala durante toda
// la fase "convergiendo" (ver demostración algebraica en el diseño
// aprobado), así que este crossfade solo suaviza la diferencia de
// resolución/tono entre imágenes satelitales, nunca esconde un salto de
// cámara. Valor inicial sujeto a ajuste visual, igual criterio que
// ESCALA_SEGUIMIENTO/FRACCION_ZONA_SEGURA más arriba.
const CROSSFADE_HUECO_Z17_FRAMES = 8;

// Encuadre amplio que contiene origen y destino de un hueco, con el mismo
// criterio de margen que ya usa elegirZoom() para encuadrar un recuadro
// completo (MARGEN=0.78). Protegida contra: puntos coincidentes (halfDx=halfDy=0),
// tramos puramente verticales/horizontales (halfDx=0 o halfDy=0 por
// separado) y valores no finitos -- en cualquiera de esos casos no hay
// ningún encuadre más ancho que calcular, se devuelve la escala de
// seguimiento actual tal cual (no hace falta alejarse).
function calcularCamaraHueco(
  origenPx: { x: number; y: number },
  destinoPx: { x: number; y: number },
  escalaSeguimientoActual: number,
): EstadoCamara {
  const MARGEN_ENCUADRE_HUECO = 0.78; // mismo criterio que MARGEN en elegirZoom()

  const halfDx = Math.abs(destinoPx.x - origenPx.x) / 2;
  const halfDy = Math.abs(destinoPx.y - origenPx.y) / 2;
  if (!Number.isFinite(halfDx) || !Number.isFinite(halfDy)) {
    return { cx: origenPx.x, cy: origenPx.y, escala: escalaSeguimientoActual };
  }

  const cx = (origenPx.x + destinoPx.x) / 2;
  const cy = (origenPx.y + destinoPx.y) / 2;

  const escalaPorX = halfDx > 0 ? ((ANCHO_VIDEO / 2) * MARGEN_ENCUADRE_HUECO) / halfDx : Infinity;
  const escalaPorY = halfDy > 0 ? ((ALTO_VIDEO / 2) * MARGEN_ENCUADRE_HUECO) / halfDy : Infinity;
  let escala = Math.min(escalaPorX, escalaPorY);
  if (!Number.isFinite(escala)) escala = escalaSeguimientoActual;

  escala = clamp(escala, 1, escalaSeguimientoActual);
  return { cx, cy, escala };
}

// Rango de tiles Z17 que intersectan el viewport actual -- misma fórmula
// para decidir QUÉ cobertura hace falta (ver coberturaCompletaZ17) y para
// DIBUJAR (ver dibujarTilesZ17 más abajo), así ambas preguntas ("¿está
// preparado?" y "¿qué dibujo?") usan exactamente el mismo rectángulo, sin
// riesgo de que diverjan.
function rangoTilesVisibles(
  camaraZ17: { x: number; y: number },
  escalaCropSeguimiento: number,
): { tileXMin: number; tileXMax: number; tileYMin: number; tileYMax: number } {
  const anchoVentanaZ17 = ANCHO_VIDEO / escalaCropSeguimiento;
  const altoVentanaZ17 = ALTO_VIDEO / escalaCropSeguimiento;
  return {
    tileXMin: Math.floor((camaraZ17.x - anchoVentanaZ17 / 2) / TAM_TILE),
    tileXMax: Math.floor((camaraZ17.x + anchoVentanaZ17 / 2 - 1) / TAM_TILE),
    tileYMin: Math.floor((camaraZ17.y - altoVentanaZ17 / 2) / TAM_TILE),
    tileYMax: Math.floor((camaraZ17.y + altoVentanaZ17 / 2 - 1) / TAM_TILE),
  };
}

// Reemplaza a recorteValido()/calcularRecorteMosaico() -- ver diseño
// aprobado: ya no existe "¿cabe el recorte dentro del mosaico destino?"
// (ya no hay mosaico destino), ahora es "¿están preparados todos los
// tiles necesarios para el viewport Z17 en esta posición de cámara?". Usa
// el Set PLANEADO por construirCorredorTilesZ17 (no el de tiles
// efectivamente descargados con éxito) -- es una pregunta geométrica, "¿el
// corredor preparado alcanza hasta acá?"; si un tile puntual particular
// falló la descarga por red en Fase A, eso lo maneja el fallback de
// dibujo por-tile (ver dibujarTilesZ17), no la máquina de estados de
// hueco. Reemplaza también, en efecto, al viejo margenUtilPx de
// seleccionarMosaico -- acá no hace falta ningún umbral de distancia
// aparte, la cobertura real ya lo es.
function coberturaCompletaZ17(
  camaraZ17: { x: number; y: number },
  escalaCropSeguimiento: number,
  corredorPlaneado: Set<string>,
): boolean {
  const { tileXMin, tileXMax, tileYMin, tileYMax } = rangoTilesVisibles(camaraZ17, escalaCropSeguimiento);
  for (let ty = tileYMin; ty <= tileYMax; ty++) {
    for (let tx = tileXMin; tx <= tileXMax; tx++) {
      if (!corredorPlaneado.has(`${tx}/${ty}`)) return false;
    }
  }
  return true;
}

// Cuántos tiles se descargan en simultáneo durante Fase A. Más alto que la
// concurrencia del viejo esquema de mosaicos (2) porque acá cada unidad de
// trabajo es UN fetch chico (un tile, no un Promise.all de 100-150 tiles
// por mosaico) -- la paralelización real de red ya la da la cantidad de
// tiles en vuelo, esto es la segunda capa. Valor inicial, sujeto a ajuste
// con datos reales de esta primera prueba.
const CONCURRENCIA_PREPARACION_TILES_Z17 = 6;

// Límite (MB) de memoria cruda estimada para los tiles del corredor -- a
// diferencia del límite de referencia del viejo esquema de mosaicos (solo
// dejaba un warning), este SÍ corta la generación (ver prepararTilesZ17):
// pedido explícito -- no continuar automáticamente por ahora, sin haber
// validado primero esta arquitectura con una estrategia de ventana para
// rutas grandes.
const LIMITE_REFERENCIA_MEMORIA_TILES_MB = 150;

// Fase A del video de seguimiento: descarga y decodifica TODOS los tiles
// del corredor (ver construirCorredorTilesZ17 -- ya calculado de antemano,
// no depende de tiempo real ni de la cámara) como ImageBitmap directamente
// dibujables, con concurrencia acotada, ANTES de que el llamador arranque
// canvas.captureStream()/MediaRecorder (ver generarVideoRecorridoInterno).
// Reemplaza por completo al esquema de mosaicos grandes pre-compuestos
// (prepararTodosLosMosaicosSeguimiento, eliminada) -- acá no hay ninguna
// composición de canvas en absoluto, cada tile se decodifica directo del
// blob de red (ver cargarTileComoImageBitmap). Si falta un tile durante
// Fase B, eso es un error de preparación (tile ausente del Map
// `residentes`) -- Fase B nunca reintenta la descarga.
async function prepararTilesZ17(
  corredorPlaneado: Set<string>,
  contadores: ContadoresTilesSeguimiento,
): Promise<Map<string, ImageBitmap>> {
  const claves = [...corredorPlaneado];
  const n = claves.length;
  console.log(`[tile-z17] tilesNecesarios=${n}`);

  const bytesPorTile = TAM_TILE * TAM_TILE * 4; // RGBA sin comprimir
  const mbEstimado = (bytesPorTile * n) / 1_048_576;
  console.log(`[tile-z17] memoriaEstimadaMB=${mbEstimado.toFixed(1)}`);
  if (mbEstimado > LIMITE_REFERENCIA_MEMORIA_TILES_MB) {
    throw new Error(
      `[tile-z17] la memoria estimada para los tiles Z17 de esta ruta (${mbEstimado.toFixed(1)}MB, ${n} tiles) ` +
        `supera el límite de referencia (${LIMITE_REFERENCIA_MEMORIA_TILES_MB}MB) para esta primera implementación. ` +
        `No se continúa automáticamente -- hace falta diseñar una estrategia de ventana/liberación antes de generar ` +
        `el video para una ruta de este tamaño (ver diseño aprobado).`,
    );
  }

  const residentes = new Map<string, ImageBitmap>();
  let siguiente = 0;
  let fallidos = 0;
  const tFaseAInicio = performance.now();

  async function trabajador(): Promise<void> {
    while (siguiente < n) {
      const clave = claves[siguiente++];
      const [tx, ty] = clave.split("/").map(Number);
      const url = urlTile(TILE_SATELITE_URL, ZOOM_SEGUIMIENTO, tx, ty);
      const bitmap = await cargarTileComoImageBitmap(url, contadores);
      if (bitmap) residentes.set(clave, bitmap);
      else fallidos++;
    }
  }

  const trabajadores = Array.from({ length: Math.min(CONCURRENCIA_PREPARACION_TILES_Z17, Math.max(n, 1)) }, () => trabajador());
  await Promise.all(trabajadores);

  const tFaseAMs = performance.now() - tFaseAInicio;
  console.log(`[tile-z17] tilesPreparados=${residentes.size}`);
  console.log(`[tile-z17] tilesFallidos=${fallidos}`);
  console.log(`[tile-z17] preparación completa -- tiempoTotalMs=${tFaseAMs.toFixed(1)}`);
  return residentes;
}

// Dibuja los tiles Z17 visibles del viewport actual, directo desde la
// grilla -- ver diseño aprobado "tiles Z17 directos". Reemplaza por
// completo a seleccionarMosaico/dibujarMosaicosSeguimiento (eliminadas):
// sin "mosaico actual/siguiente", sin crossfade entre tiles, sin
// radioZonaSegura/radioLimite -- los tiles vecinos son la MISMA grilla,
// entran/salen del viewport uno por uno según rangoTilesVisibles, nunca
// cambian de escala/centro/sistema de coordenadas al cruzar de un tile a
// otro (misma grilla, mismo origen global siempre).
//
// Geometría: para cualquier punto Z17 (gx,gy), su posición en pantalla es
// `mitad + escalaCropSeguimiento×(gz17-camaraZ17)` -- la misma
// transformación lineal ya demostrada algebraicamente en calcularCamaraZ17
// -- se aplica acá directo a la esquina superior-izquierda de cada tile
// visible. Con escalaCropSeguimiento=1 (régimen normal) el tile se dibuja
// 1:1 sin reescalar (drawImage de 3 argumentos); con !=1 (fase
// "convergiendo", ver dibujarFrame) se reescala con la forma de 9
// argumentos -- misma fórmula general, sin caso especial para ese
// instante, la continuidad geométrica ya validada se preserva tal cual.
//
// `alphaGlobal` (default 1): exclusivo del crossfade PANORAMICA_HUECO->Z17
// (ver dibujarCuadroVideo, CROSSFADE_HUECO_Z17_FRAMES) y del crossfade del
// intro -- con <1, el llamador ya dibujó el fondo opaco debajo, así que
// los tiles se componen encima como cross-dissolve estándar sobre fondo
// opaco, sin canvas intermedio.
//
// Si un tile visible no está en `tilesResidentes` (ausente del corredor
// preparado por Fase A, o falló la descarga): eso es un ERROR DE
// PREPARACIÓN, nunca dispara una descarga acá (Fase B prohibido) -- se
// rellena con el mismo color sólido que ya usa el resto del archivo para
// tiles fallidos, y se loguea.
function dibujarTilesZ17(
  ctx: CanvasRenderingContext2D,
  tilesResidentes: Map<string, ImageBitmap>,
  camaraZ17: { x: number; y: number },
  escalaCropSeguimiento: number,
  alphaGlobal = 1,
): { descriptor: string; tilesVisibles: number; tilesFaltantes: number } {
  const { tileXMin, tileXMax, tileYMin, tileYMax } = rangoTilesVisibles(camaraZ17, escalaCropSeguimiento);
  let dibujados = 0;
  let faltantes = 0;
  ctx.globalAlpha = alphaGlobal;
  for (let ty = tileYMin; ty <= tileYMax; ty++) {
    for (let tx = tileXMin; tx <= tileXMax; tx++) {
      const pantallaX = ANCHO_VIDEO / 2 + (tx * TAM_TILE - camaraZ17.x) * escalaCropSeguimiento;
      const pantallaY = ALTO_VIDEO / 2 + (ty * TAM_TILE - camaraZ17.y) * escalaCropSeguimiento;
      const tam = TAM_TILE * escalaCropSeguimiento;
      const tile = tilesResidentes.get(`${tx}/${ty}`);
      if (!tile) {
        faltantes++;
        console.error(`[tile-z17] tile faltante en Fase B -- x=${tx} y=${ty} (error de preparación, no se descarga)`);
        ctx.fillStyle = "#1a1108";
        ctx.fillRect(pantallaX, pantallaY, tam, tam);
        continue;
      }
      if (escalaCropSeguimiento === 1) {
        ctx.drawImage(tile, pantallaX, pantallaY);
      } else {
        ctx.drawImage(tile, 0, 0, TAM_TILE, TAM_TILE, pantallaX, pantallaY, tam, tam);
      }
      dibujados++;
    }
  }
  ctx.globalAlpha = 1;
  return {
    descriptor: `Z17 tiles=${dibujados}${faltantes > 0 ? ` faltantes=${faltantes}` : ""}`,
    tilesVisibles: dibujados,
    tilesFaltantes: faltantes,
  };
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
  // Índice i tal que la interpolación actual cae entre datos.puntos[i] y
  // datos.puntos[i+1] -- null cuando fraccion>=1 (mostrarFin=true, sin
  // interpolación). El tramo que se está atravesando AHORA MISMO es
  // clasificacionTramos[indiceBase+1] (ver clasificarTramos en geo.ts).
  indiceBase: number | null;
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

// --- Cámara de seguimiento: suavizado, zona de tolerancia y anticipación ---
// (mejora sobre la cámara de mosaicos ya existente -- no toca ZOOM_SEGUIMIENTO
// ni la cadena de mosaicos en sí, solo CÓMO se mueve la cámara sobre ellos).

// Radio (px, a escala 1, canvas base) de la zona muerta alrededor de la
// cámara: mientras el foco crudo (la posición real del patinador) quede
// adentro, la cámara no se mueve nada -- recién al salir empieza a
// acompañarlo. Se deriva de la dimensión visible del video (no un número
// fijo pensado para 720x1280) para que el comportamiento se sienta parecido
// si el video cambia de resolución/relación de aspecto más adelante.
const FACTOR_TOLERANCIA_CAMARA = 0.1;
const RADIO_TOLERANCIA_MIN_PX = 30;
const RADIO_TOLERANCIA_MAX_PX = 120;
const RADIO_TOLERANCIA_PX = clamp(
  Math.min(ANCHO_VIDEO, ALTO_VIDEO) * FACTOR_TOLERANCIA_CAMARA,
  RADIO_TOLERANCIA_MIN_PX,
  RADIO_TOLERANCIA_MAX_PX,
);
// Qué fracción de la distancia pendiente (entre la cámara y el borde de la
// zona de tolerancia) se recupera por cuadro, una vez que la cámara
// necesita moverse -- más alto = alcanza más rápido (más "pegada" al
// patinador), más bajo = más lag mercado.
const FACTOR_SUAVIZADO_CAMARA = 0.18;
// A partir de qué fracción de FRACCION_TRAZO_COMPLETO se empieza a apagar
// el suavizado (ver suavizarCamara) para llegar EXACTAMENTE convergida al
// objetivo crudo justo antes de que estadoCamara arranque su propia curva
// de alejamiento -- sin esto, un pequeño rezago acumulado por la zona de
// tolerancia se notaría como un salto en el corte hacia el outro.
const FRACCION_INICIO_CONVERGENCIA_CAMARA = 0.92;

// Anticipación de dirección: cuánto más adelante en la ruta (en km reales)
// se mira para calcular hacia dónde se está yendo, y cuánto se desplaza el
// PUNTO DE MIRA de la cámara (no la posición dibujada del marcador) en esa
// dirección -- así queda más mapa visible hacia adelante que hacia atrás.
// MAX_DESPLAZAMIENTO_ANTICIPACION_PX es un techo explícito, independiente
// de DESPLAZAMIENTO_ANTICIPACION_PX: en curvas cerradas o zigzags la
// dirección calculada puede cambiar mucho de un tramo a otro, pero la
// MAGNITUD del desplazamiento nunca debe superar este techo -- evita que el
// patinador termine empujado demasiado lejos del centro del cuadro.
const DISTANCIA_ANTICIPACION_KM = 0.12;
const DESPLAZAMIENTO_ANTICIPACION_PX = 70;
const MAX_DESPLAZAMIENTO_ANTICIPACION_PX = 90;
// Suavizado de la DIRECCIÓN (no de la magnitud, que ya es constante) entre
// cuadros -- evita que un cambio de rumbo de la ruta (curva) desplace el
// punto de mira de golpe. Mismo principio que SUAVIZADO_BEARING en
// geo-flyover.util.ts, aplicado acá a un vector 2D de pantalla en vez de un
// ángulo (no hace falta manejar wrap-around de 360°).
const FACTOR_SUAVIZADO_ANTICIPACION = 0.08;

// Intro: pausa panorámica quieta + acercamiento suave hasta la posición y
// escala exactas del arranque del seguimiento (ver el bloque de intro en
// generarVideoRecorrido). Se suman como tiempo REAL extra al video, no
// consumen nada del eje fraccionTotal existente.
const DURACION_PAUSA_INTRO_SEG = 0.8;
const DURACION_ACERCAMIENTO_INTRO_SEG = 1.6;

// La cámara "persigue" el punto actual durante el dibujado del trazo
// (estilo Relive), y en el último tramo de la animación se aleja hasta
// volver a 1 (panorámica del recorrido completo). El acercamiento durante
// el seguimiento YA NO es un multiplicador fijo (antes ESCALA_CAMARA_CERCANA,
// pensado para un zoom óptico sobre la panorámica) -- ver estadoCamara: con
// mosaicos de verdad, ese número tiene que depender de `factor` para que el
// nivel de acercamiento final no dependa de qué zoom haya elegido la
// panorámica (ver ESCALA_SEGUIMIENTO más arriba y la demostración
// matemática en el diseño aprobado).

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
      indiceBase: null,
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
    indiceBase: i,
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
// `factor` (= 2^(ZOOM_SEGUIMIENTO - mapaBase.zoom), la misma conversión
// geográfica real que ya usan los mosaicos) es lo único nuevo acá: durante
// el seguimiento, la escala de cámara pasa a ser `factor × ESCALA_SEGUIMIENTO`
// en vez del viejo valor fijo -- demostrado matemáticamente que el `factor`
// se cancela al combinarse con la conversión geográfica, dejando el nivel
// de acercamiento final independiente de qué zoom haya elegido la
// panorámica para esta ruta. El outro arranca su interpolación desde ESE
// mismo valor dinámico (en vez del viejo fijo) para no saltar en el corte
// -- el resto de la coreografía (aleja con curva suave hasta escala 1,
// centrada en el recorrido completo) no cambia en nada.
// Progreso (0..1, ya pasado por suavizar()) de la curva de alejamiento del
// outro -- extraído de estadoCamara (mismo cálculo, mismo resultado, sin
// cambiar su comportamiento) para poder reutilizarlo en dibujarFrame al
// calcular focoOutro (ver diseño aprobado de continuidad
// seguimiento->outro): la interpolación de la anticipación hacia
// focoTrazandoPx tiene que usar EXACTAMENTE esta misma `t`, no una curva
// separada, para que la demostración algebraica de continuidad valga.
function progresoAlejamientoOutro(fraccionTotal: number): number {
  return suavizar((fraccionTotal - FRACCION_TRAZO_COMPLETO) / (1 - FRACCION_TRAZO_COMPLETO));
}

function estadoCamara(
  fraccionTotal: number,
  focoTrazando: { x: number; y: number },
  focoCentro: { x: number; y: number },
  factor: number,
): EstadoCamara {
  const escalaSeguimiento = factor * ESCALA_SEGUIMIENTO;
  const mitadVisibleX = ANCHO_VIDEO / (2 * escalaSeguimiento);
  const mitadVisibleY = ALTO_VIDEO / (2 * escalaSeguimiento);
  const focoCercano = {
    x: clamp(focoTrazando.x, mitadVisibleX, ANCHO_VIDEO - mitadVisibleX),
    y: clamp(focoTrazando.y, mitadVisibleY, ALTO_VIDEO - mitadVisibleY),
  };
  if (fraccionTotal <= FRACCION_TRAZO_COMPLETO) {
    return { cx: focoCercano.x, cy: focoCercano.y, escala: escalaSeguimiento };
  }
  const t = progresoAlejamientoOutro(fraccionTotal);
  return {
    cx: focoCercano.x + (focoCentro.x - focoCercano.x) * t,
    cy: focoCercano.y + (focoCentro.y - focoCercano.y) * t,
    escala: escalaSeguimiento + (1 - escalaSeguimiento) * t,
  };
}

// Igual que la interpolación de estadoEnFraccion, pero parametrizada por una
// distancia (km) cualquiera en vez de por fraccionTotal -- se usa para
// "mirar adelante" en calcularFocoConAnticipacion sin duplicar el índice que
// ya devuelve estadoEnFraccion (esa sigue exactamente igual, sin tocar).
function puntoADistanciaKm(puntos: PuntoGps[], distanciaAcumuladaKm: number[], distObjetivoKmCrudo: number): PuntoGps {
  const distTotal = distanciaAcumuladaKm[distanciaAcumuladaKm.length - 1];
  const distObjetivoKm = clamp(distObjetivoKmCrudo, 0, distTotal);
  let i = 0;
  while (i < puntos.length - 2 && distanciaAcumuladaKm[i + 1] <= distObjetivoKm) i++;
  const actual = puntos[i];
  const siguiente = puntos[i + 1];
  const distTramoKm = distanciaAcumuladaKm[i + 1] - distanciaAcumuladaKm[i];
  const progresoTramo = distTramoKm > 0 ? clamp((distObjetivoKm - distanciaAcumuladaKm[i]) / distTramoKm, 0, 1) : 0;
  return {
    lat: actual.lat + (siguiente.lat - actual.lat) * progresoTramo,
    lon: actual.lon + (siguiente.lon - actual.lon) * progresoTramo,
    timestamp: actual.timestamp + (siguiente.timestamp - actual.timestamp) * progresoTramo,
  };
}

interface DireccionAnticipacion {
  dx: number;
  dy: number;
}

interface ResultadoAnticipacion {
  foco: { x: number; y: number };
  direccion: DireccionAnticipacion;
}

// Desplaza el PUNTO DE MIRA (no la posición dibujada del marcador, que sigue
// yendo en su lugar real) hacia donde continúa la ruta, mirando un poco más
// adelante en distancia real -- así queda más mapa visible por delante que
// por detrás. La dirección se suaviza entre cuadros (no la magnitud, fija y
// topeada por MAX_DESPLAZAMIENTO_ANTICIPACION_PX) para que un cambio de
// rumbo en una curva la mueva gradual, nunca de golpe. `direccionAnterior`
// es de solo lectura acá -- el llamador decide si persiste el resultado
// (ver dibujarFrame/generarVideoRecorrido), función pura sin estado propio.
//
// DESPLAZAMIENTO_ANTICIPACION_PX/MAX_DESPLAZAMIENTO_ANTICIPACION_PX son
// conceptualmente píxeles de PANTALLA (70/90px visibles) -- igual que
// RADIO_TOLERANCIA_PX en suavizarCamara, acá se trabaja sobre focoActualPx
// (canvas-base), así que hay que convertir dividiendo por la escala
// vigente de este cuadro (`escalaSeguimiento` -- durante el tramo de
// seguimiento es exactamente factor×ESCALA_SEGUIMIENTO, el mismo valor que
// va a terminar siendo camara.escala; se recibe ya calculado en vez de
// recibir estadoCamara completo porque esta función corre ANTES de
// llamarlo -- ver dibujarFrame).
function calcularFocoConAnticipacion(
  focoActualPx: { x: number; y: number },
  datos: DatosTarjetaRecorrido,
  distanciaAcumuladaKm: number[],
  fraccionTrazo: number,
  x: (lon: number) => number,
  y: (lat: number) => number,
  direccionAnterior: DireccionAnticipacion | null,
  escalaSeguimiento: number,
): ResultadoAnticipacion {
  const distanciaActualKm = fraccionTrazo * datos.distanciaKm;
  const puntoAdelante = puntoADistanciaKm(datos.puntos, distanciaAcumuladaKm, distanciaActualKm + DISTANCIA_ANTICIPACION_KM);
  const adelantePx = { x: x(puntoAdelante.lon), y: y(puntoAdelante.lat) };

  let dx = adelantePx.x - focoActualPx.x;
  let dy = adelantePx.y - focoActualPx.y;
  const dist = Math.hypot(dx, dy);
  if (dist > 0) {
    dx /= dist;
    dy /= dist;
  }

  let direccion: DireccionAnticipacion = { dx, dy };
  if (direccionAnterior) {
    if (dist === 0) {
      // Sin punto adelante confiable (fin de la ruta) -- mantiene la
      // última dirección conocida en vez de colapsar a (0,0).
      direccion = direccionAnterior;
    } else {
      const sx = direccionAnterior.dx + (dx - direccionAnterior.dx) * FACTOR_SUAVIZADO_ANTICIPACION;
      const sy = direccionAnterior.dy + (dy - direccionAnterior.dy) * FACTOR_SUAVIZADO_ANTICIPACION;
      const norm = Math.hypot(sx, sy);
      direccion = norm > 0 ? { dx: sx / norm, dy: sy / norm } : direccionAnterior;
    }
  }

  const desplazamiento = Math.min(DESPLAZAMIENTO_ANTICIPACION_PX, MAX_DESPLAZAMIENTO_ANTICIPACION_PX) / escalaSeguimiento;
  return {
    foco: {
      x: focoActualPx.x + direccion.dx * desplazamiento,
      y: focoActualPx.y + direccion.dy * desplazamiento,
    },
    direccion,
  };
}

interface CamaraSuavizada {
  cx: number;
  cy: number;
}

// Cámara con "zona muerta": mientras el objetivo crudo (ya calculado por
// estadoCamara, con su propio clamp a los bordes del mapa) quede a menos de
// RADIO_TOLERANCIA_PX (en PANTALLA, ver conversión de unidades más abajo) de
// la posición actual de la cámara, la cámara no se mueve -- el patinador
// puede moverse dentro de esa zona sin que la cámara reaccione a cada
// micro-variación del GPS. Al salir de la zona, la cámara avanza hacia el
// punto que deja al objetivo justo en el borde (no de vuelta al centro
// exacto), con una interpolación suave (FACTOR_SUAVIZADO_CAMARA) en vez de
// un salto instantáneo al borde.
//
// RADIO_TOLERANCIA_PX es conceptualmente una distancia en PANTALLA (72px
// visibles), pero acá se trabaja en canvas-base (objetivo.cx/cy) -- esos dos
// espacios solo coinciden cuando escala=1. Ahora que la escala del
// seguimiento es factor×ESCALA_SEGUIMIENTO (no 1), hay que convertir:
// distanciaPantalla = distanciaCanvasBase × escala, así que
// distanciaCanvasBase = distanciaPantalla / escala -- de ahí `radioBase`.
// Usa `objetivo.escala` (la escala YA resuelta para este cuadro por
// estadoCamara, la misma que va a usar la transformación de cámara real)
// en vez de recalcular nada aparte.
//
// `anterior === null` pasa exactamente una vez, en el primer cuadro del
// seguimiento (ya sea el último del intro o, si no hubo intro, el primero
// del loop real) -- ahí no hay "desde dónde" suavizar, así que se devuelve
// el objetivo tal cual (coincide con cómo termina el acercamiento del intro,
// ver generarVideoRecorrido).
//
// Sobre el final del tramo (ver FRACCION_INICIO_CONVERGENCIA_CAMARA) el
// suavizado se apaga a propósito para llegar EXACTAMENTE convergida al
// objetivo crudo antes del corte al outro -- estadoCamara arranca su propia
// curva de alejamiento ahí partiendo del objetivo crudo (sin suavizar), así
// que sin esto un pequeño rezago acumulado se notaría como un salto.
function suavizarCamara(objetivo: EstadoCamara, anterior: CamaraSuavizada | null, fraccionTotal: number): EstadoCamara {
  if (!anterior) return objetivo;

  const inicioConvergencia = FRACCION_INICIO_CONVERGENCIA_CAMARA * FRACCION_TRAZO_COMPLETO;
  if (fraccionTotal >= inicioConvergencia) {
    const t = suavizar((fraccionTotal - inicioConvergencia) / (FRACCION_TRAZO_COMPLETO - inicioConvergencia));
    const factor = Math.max(FACTOR_SUAVIZADO_CAMARA, t);
    return {
      cx: anterior.cx + (objetivo.cx - anterior.cx) * factor,
      cy: anterior.cy + (objetivo.cy - anterior.cy) * factor,
      escala: objetivo.escala,
    };
  }

  const radioBase = RADIO_TOLERANCIA_PX / objetivo.escala;
  const dx = objetivo.cx - anterior.cx;
  const dy = objetivo.cy - anterior.cy;
  const dist = Math.hypot(dx, dy);
  if (dist <= radioBase) {
    return { cx: anterior.cx, cy: anterior.cy, escala: objetivo.escala };
  }
  const excedente = dist - radioBase;
  const objetivoEfectivoX = anterior.cx + (dx / dist) * excedente;
  const objetivoEfectivoY = anterior.cy + (dy / dist) * excedente;
  return {
    cx: anterior.cx + (objetivoEfectivoX - anterior.cx) * FACTOR_SUAVIZADO_CAMARA,
    cy: anterior.cy + (objetivoEfectivoY - anterior.cy) * FACTOR_SUAVIZADO_CAMARA,
    escala: objetivo.escala,
  };
}

// Fondo del cuadro: dibuja siempre el panorámico (mapaImg, base segura), y
// si hay mapa detallado (ver generarMapaDetallado) lo superpone encima con
// un alpha que sigue exactamente la misma curva que el acercamiento de la
// cámara. Ahora se llama SOLO durante el outro (el seguimiento usa
// dibujarMosaicosSeguimiento) -- 100% detallado al arrancar el outro
// (camara.escala == escalaInicioOutro, el mismo valor dinámico con el que
// terminó el seguimiento), crossfade hacia el panorámico a medida que la
// cámara se aleja (escala -> 1), 0% detallado en la panorámica final. Ambos
// mapas cubren EXACTAMENTE el mismo recuadro geográfico (mismo centro, un
// zoom de diferencia) -- por eso alcanza con escalar/trasladar el detallado
// por factorDetalle para que calce pixel a pixel con el trazo/pines, que se
// siguen dibujando en el espacio de coordenadas del panorámico (ver
// dibujarCuadroVideo).
// Se llama con ctx en la transformación identidad (antes del bloque de
// transformación de cámara que usa el trazo/pines/etiquetas) -- arma su
// propia transformación para cada capa, así el llamador no necesita saber
// si hay uno o dos mapas de fondo.
function dibujarFondoMapaVideo(
  ctx: CanvasRenderingContext2D,
  mapaImg: HTMLImageElement | null,
  mapaDetalladoImg: HTMLImageElement | null,
  factorDetalle: number,
  camara: EstadoCamara,
  escalaInicioOutro: number,
) {
  if (!mapaImg) {
    ctx.fillStyle = "#1a1108";
    ctx.fillRect(0, 0, ANCHO_VIDEO, ALTO_VIDEO);
  } else {
    ctx.save();
    ctx.translate(ANCHO_VIDEO / 2, ALTO_VIDEO / 2);
    ctx.scale(camara.escala, camara.escala);
    ctx.translate(-camara.cx, -camara.cy);
    ctx.drawImage(mapaImg, 0, 0, ANCHO_VIDEO, ALTO_VIDEO);
    ctx.restore();
  }

  if (!mapaDetalladoImg) return;
  const pesoDetallado =
    escalaInicioOutro > 1 ? clamp((camara.escala - 1) / (escalaInicioOutro - 1), 0, 1) : 0;
  if (pesoDetallado <= 0) return;

  ctx.save();
  ctx.globalAlpha = pesoDetallado;
  ctx.translate(ANCHO_VIDEO / 2, ALTO_VIDEO / 2);
  ctx.scale(camara.escala / factorDetalle, camara.escala / factorDetalle);
  ctx.translate(-camara.cx * factorDetalle, -camara.cy * factorDetalle);
  ctx.drawImage(mapaDetalladoImg, 0, 0, ANCHO_VIDEO * factorDetalle, ALTO_VIDEO * factorDetalle);
  ctx.restore();
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

  // Transformación inversa localizada: la posición (nuevo.x/nuevo.y, y todo
  // el cálculo de clamping de arriba) queda EXACTAMENTE igual que antes --
  // solo el dibujo de acá para abajo pasa a un origen local (0,0) escalado
  // por 1/escalaAmbiente, para que la caja/fuente/borde/sombra mantengan un
  // tamaño físico constante en pantalla sin importar camara.escala.
  const escalaAmbiente = Math.hypot(t.a, t.b);
  ctx.save();
  ctx.translate(nuevo.x, nuevo.y);
  ctx.scale(1 / escalaAmbiente, 1 / escalaAmbiente);
  ctx.globalAlpha = alpha;
  ctx.shadowColor = "rgba(0,0,0,0.6)";
  ctx.shadowBlur = 8;
  ctx.fillStyle = "rgba(13,10,6,0.8)";
  trazarRectRedondeado(ctx, -anchoCaja / 2, -altoCaja / 2, anchoCaja, altoCaja, altoCaja / 2);
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;

  trazarRectRedondeado(ctx, -anchoCaja / 2, -altoCaja / 2, anchoCaja, altoCaja, altoCaja / 2);
  ctx.strokeStyle = DORADO_BORDE;
  ctx.lineWidth = 1.2;
  ctx.stroke();

  ctx.fillStyle = DORADO;
  ctx.fillText(texto, 0, 1);
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
  // Transformación inversa localizada (ver dibujarEtiquetaSector): cx/cy
  // siguen siendo la posición geográfica real; todo lo que se dibuja abajo
  // queda relativo a un origen local (0,0) escalado por 1/escalaAmbiente,
  // así el radio/borde/resplandor mantienen tamaño físico constante en
  // pantalla sin importar camara.escala.
  const t = ctx.getTransform();
  const escalaAmbiente = Math.hypot(t.a, t.b);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1 / escalaAmbiente, 1 / escalaAmbiente);
  if (resplandor) {
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
  }
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#0d0a06";
  ctx.stroke();
  if (resplandor) ctx.restore();
  ctx.restore();
}

// pulso (0 por defecto = estado normal ya asentado): al revelarse la marca
// se llama varios cuadros seguidos con pulso creciente 0→1 (ver PAUSA_VELMAX_MS
// en generarVideoRecorrido) para un anillo que se expande y se desvanece --
// un "ping" real, no un marcador estático -- y después queda en su estado
// fijo (punto + resplandor + casilla) el resto del video.
function dibujarMarcaVelMax(ctx: CanvasRenderingContext2D, cx: number, cy: number, kmh: number, pulso = 0) {
  // Transformación inversa localizada (ver dibujarEtiquetaSector): cx/cy
  // siguen siendo la posición geográfica real; todo lo que sigue queda
  // relativo a un origen local (0,0) escalado por 1/escalaAmbiente, para
  // que anillo/punto/caja/texto mantengan tamaño físico constante en
  // pantalla sin importar camara.escala.
  const t = ctx.getTransform();
  const escalaAmbiente = Math.hypot(t.a, t.b);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1 / escalaAmbiente, 1 / escalaAmbiente);

  if (pulso > 0) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - pulso) * 0.6;
    ctx.beginPath();
    ctx.arc(0, 0, 9 + pulso * 30, 0, Math.PI * 2);
    ctx.strokeStyle = DORADO;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
  }

  ctx.save();
  ctx.shadowColor = DORADO;
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.arc(0, 0, 8, 0, Math.PI * 2);
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
  dibujarRectRedondeado(ctx, 14, -16, ancho, 32, 16);
  ctx.restore();
  ctx.strokeStyle = DORADO_BORDE;
  ctx.lineWidth = 1.4;
  trazarRectRedondeado(ctx, 14, -16, ancho, 32, 16);
  ctx.stroke();
  ctx.fillStyle = DORADO;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(texto, 28, 6);
  ctx.restore();
}

// Pin circular con la foto del usuario clavado en un punto del mapa (estilo
// Relive/Strava) -- un triángulo apuntador + la foto recortada en círculo.
function dibujarPinFoto(ctx: CanvasRenderingContext2D, fotoImg: HTMLImageElement, cx: number, cyPunta: number, radio: number) {
  // Transformación inversa localizada (ver dibujarEtiquetaSector): cx/cyPunta
  // siguen siendo la posición geográfica real (la punta del pin); todo lo
  // que sigue queda relativo a un origen local (0,0) escalado por
  // 1/escalaAmbiente, para que el pin mantenga tamaño físico constante en
  // pantalla sin importar camara.escala.
  const t = ctx.getTransform();
  const escalaAmbiente = Math.hypot(t.a, t.b);
  ctx.save();
  ctx.translate(cx, cyPunta);
  ctx.scale(1 / escalaAmbiente, 1 / escalaAmbiente);

  const cyCentro = -radio - 6;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-8, cyCentro + radio - 4);
  ctx.lineTo(8, cyCentro + radio - 4);
  ctx.closePath();
  ctx.fillStyle = "#0d0a06";
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.arc(0, cyCentro, radio, 0, Math.PI * 2);
  ctx.fillStyle = "#0d0a06";
  ctx.fill();
  ctx.clip();
  dibujarImagenCover(ctx, fotoImg, -radio, cyCentro - radio, radio * 2, radio * 2);
  ctx.restore();

  ctx.beginPath();
  ctx.arc(0, cyCentro, radio, 0, Math.PI * 2);
  ctx.strokeStyle = DORADO_BORDE;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.restore();
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

// Texto de diagnóstico TEMPORAL en la esquina inferior derecha del video --
// eliminar junto con el resto de esta instrumentación (ver refDiagnosticoFondo
// en dibujarCuadroVideo) una vez confirmado si el seguimiento usa mosaicos
// Z17 reales o cae a la panorámica de respaldo. Traduce el descriptor técnico
// (ver dibujarMosaicosSeguimiento) a un texto corto legible mirando el video:
// "Z17 M3", "Z17 M3→M4" (crossfade), "FALLBACK PANORAMICA".
function dibujarTextoDiagnosticoFondo(ctx: CanvasRenderingContext2D, descriptor: string): void {
  let texto = descriptor;
  const crossfadeHueco = descriptor.match(/^CROSSFADE_HUECO_Z17 peso=(\S+) Z17 tiles=(\d+)/);
  const z17 = descriptor.match(/^Z17 tiles=(\d+)/);
  if (crossfadeHueco) texto = `Z17 HUECO→Z17 (${crossfadeHueco[1]}) tiles=${crossfadeHueco[2]}`;
  else if (z17) texto = `Z17 tiles=${z17[1]}`;
  else if (descriptor.startsWith("PANORAMICA_HUECO")) texto = "PANORAMICA (hueco)";
  else if (descriptor.startsWith("PANORAMICA_OUTRO")) texto = "PANORAMICA (outro)";

  ctx.save();
  ctx.font = "700 20px monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const anchoCaja = ctx.measureText(texto).width + 20;
  ctx.fillStyle = "rgba(0,0,0,0.65)";
  ctx.fillRect(ANCHO_VIDEO - anchoCaja - 12, ALTO_VIDEO - 44, anchoCaja, 32);
  ctx.fillStyle = descriptor.includes("faltantes=") ? "#ff4d4d" : "#39ff6a";
  ctx.fillText(texto, ANCHO_VIDEO - anchoCaja - 2, ALTO_VIDEO - 28);
  ctx.restore();
}

// Diagnóstico temporal (investigación de congelamientos, ver [render-diag]
// en el loop principal de generarVideoRecorrido) -- snapshot de lo que
// dibujarCuadroVideo resolvió internamente este cuadro puntual, para que el
// loop de afuera lo pueda loguear junto con su propio timing de reloj real.
interface DiagnosticoFrame {
  camaraCx: number;
  camaraCy: number;
  camaraEscala: number;
  descriptorFondo: string;
  indiceBase: number | null;
  lat: number | null;
  lon: number | null;
  // Diagnóstico temporal (investigación STALL real vs presión de memoria en
  // Z17, ver [render-diag]/[tile-z17-frame] en el loop principal): cuánto
  // tardó dibujar el fondo este cuadro completo (dibujarTilesZ17 y/o
  // dibujarFondoMapaVideo, lo que haya corrido) -- línea base directa para
  // comparar Z17 cercano contra panorámica amplia. null si por algún motivo
  // no se llegó a medir.
  tiempoFondoMs: number | null;
  // Cuánto tardó ESPECÍFICAMENTE dibujarTilesZ17 (subconjunto de
  // tiempoFondoMs) -- null cuando Z17 no se dibujó este cuadro (hueco/outro).
  tiempoDrawTilesMs: number | null;
  // camaraZ17/escalaCropSeguimiento de este cuadro -- null fuera de Z17.
  camaraZ17X: number | null;
  camaraZ17Y: number | null;
  escalaCropSeguimiento: number | null;
  // Tiles realmente dibujados/faltantes este cuadro (ver dibujarTilesZ17)
  // -- null fuera de Z17.
  tilesVisibles: number | null;
  tilesFaltantes: number | null;
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
  mapaDetalladoImg: HTMLImageElement | null,
  factorDetalle: number,
  x: (lon: number) => number,
  y: (lat: number) => number,
  focoCentroPx: { x: number; y: number },
  frame: FrameAnimado,
  fraccionTotal: number,
  config: ConfigVideo,
  mostrarFotoFinal: boolean,
  // Ya resuelta por el llamador (dibujarFrame o la secuencia de intro en
  // generarVideoRecorrido) -- esta función ya no calcula estadoCamara
  // internamente, así el llamador puede aplicarle suavizado/anticipación
  // (tramo de seguimiento) o pasarla cruda (outro, sin cambios) según
  // corresponda, sin que dibujarCuadroVideo necesite saber cuál es cuál.
  camara: EstadoCamara,
  // Escala con la que arrancó el outro (ver estadoCamara) -- necesaria acá
  // solo para pasarla a dibujarFondoMapaVideo (crossfade panorámica/detalle
  // del outro); irrelevante mientras haya seleccionMosaico.
  escalaInicioOutro: number,
  // Posición de cámara en píxeles globales de ZOOM_SEGUIMIENTO (ver
  // calcularCamaraZ17) -- null fuera del tramo de seguimiento (o cuando
  // Z17 no tiene cobertura este cuadro, ver dibujarFrame/coberturaCompletaZ17).
  // Junto con escalaCropSeguimiento, define qué tiles se dibujan (ver
  // dibujarTilesZ17).
  camaraZ17: { x: number; y: number } | null,
  // Escala para dibujarTilesZ17, YA resuelta por el llamador (ver
  // dibujarFrame): ESCALA_SEGUIMIENTO en seguimiento normal, o
  // camara.escala/factorSeguimiento mientras la cámara sigue convergiendo
  // tras reactivarse Z17 (fase "convergiendo" -- ver FaseHueco).
  // Deliberadamente NO es camara.escala directo -- esa se sigue usando tal
  // cual para el translate/scale del trazo/marcador/etiquetas, sin cambios.
  escalaCropSeguimiento: number,
  // true durante fase "en_hueco"/"regresando" (ver dibujarFrame) -- activa
  // el camino PANORAMICA_HUECO. PANORAMICA_OUTRO queda exclusivo del
  // cierre real (fraccionTotal > FRACCION_TRAZO_COMPLETO), sin este flag
  // ambas situaciones caían en el mismo `else` (ver diseño aprobado).
  modoHuecoActivo = false,
  // Peso (0..1) con el que se dibuja Z17 este cuadro -- null cuando
  // camaraZ17 es null o Z17 no tiene cobertura (cae a
  // PANORAMICA_HUECO/OUTRO). 1 es el caso normal (Z17 opaco, sin nada
  // debajo); <1 dibuja PANORAMICA_HUECO opaca debajo primero y los tiles
  // encima con este peso -- cubre TANTO el crossfade PANORAMICA_HUECO->Z17
  // (ver CROSSFADE_HUECO_Z17_FRAMES) COMO el crossfade del intro
  // (panorámica->primer tile, ver dibujarFondoIntro), con la MISMA lógica
  // unificada -- la continuidad geométrica entre PANORAMICA_HUECO y Z17 en
  // ese tramo ya está demostrada algebraicamente (mismo centro, misma
  // escala), así que esto solo suaviza la diferencia de imagen satelital,
  // no un salto de cámara.
  pesoZ17: number | null = null,
  pulsoVelMax = 0,
  suavizadoEtiquetas: Map<number, { x: number; y: number }> = new Map(),
  // Tiles Z17 residentes (ver prepararTilesZ17) -- Map vacío fuera del
  // tramo de seguimiento (outro), sin efecto ahí porque camaraZ17/pesoZ17
  // ya son null.
  tilesZ17: Map<string, ImageBitmap> = new Map(),
  // Solo true durante el intro (panorámica/pausa/acercamiento, ver
  // generarVideoRecorrido): dibuja el fondo (con la cámara/mosaico que
  // corresponda) y corta ahí -- sin trazo, marcador, etiquetas, marca de
  // velocidad máxima ni la barra de estadísticas, que todavía no
  // corresponde mostrar antes de que arranque el recorrido de verdad.
  soloFondo = false,
  // Instrumentación temporal (ver dibujarTextoDiagnosticoFondo más abajo y
  // el resumen final en generarVideoRecorrido): si viene, dibuja un texto
  // fijo en pantalla con qué fondo se está usando EN ESTE cuadro (siempre,
  // no solo al cambiar), y loguea en consola solo cuando cambia respecto
  // del cuadro anterior (.valor persiste entre llamadas). null fuera de la
  // prueba -- sin este parámetro, cero cambio de comportamiento/dibujo.
  refDiagnosticoFondo: { valor: string | null } | null = null,
  // Diagnóstico temporal (investigación de congelamientos del video, ver
  // [render-diag] en el loop principal de generarVideoRecorrido): expone,
  // cuadro a cuadro, el estado interno que el loop no puede ver desde
  // afuera (camara/descriptorFondo/indiceBase son locales acá adentro). Se
  // sobreescribe SIEMPRE (no solo al cambiar, a diferencia de
  // refDiagnosticoFondo) -- el throttling de cada cuánto loguear lo decide
  // el loop, no esta función. null fuera de la prueba -- sin este
  // parámetro, cero cambio de comportamiento/dibujo.
  refDiagnosticoFrame: { valor: DiagnosticoFrame | null } | null = null,
  // Clasificación GPS por tramo (ver clasificarTramos en geo.ts), calculada
  // una sola vez en generarVideoRecorridoInterno y compartida con el
  // selector de mosaicos (misma fuente de verdad, ver seleccionarMosaico) --
  // el loop de trazo la usa para no dibujar una línea recta sobre un tramo
  // "saltoGps". clasificacionTramos[k] describe el tramo que TERMINA en
  // datos.puntos[k], igual que el resto de la app (ver dividirEnTramosParaDibujo
  // en geo.ts, mismo criterio en el mapa en vivo).
  clasificacionTramos: ClasificacionTramo[],
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

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, ANCHO_VIDEO, ALTO_VIDEO);
  ctx.clip();

  // Fondo: mosaicos con recorte real (source crop, ver
  // dibujarMosaicosSeguimiento) durante el seguimiento, o la panorámica de
  // siempre (dibujarFondoMapaVideo) en el outro -- ambos se dibujan con la
  // transformación IDENTIDAD (antes del translate/scale/translate de más
  // abajo), porque cada uno arma su propio recorte/transformación ya
  // resuelto en coordenadas finales de pantalla.
  // Diagnóstico temporal (investigación STALL real vs presión de memoria
  // en Z17 cercano, ver [render-diag]/[tile-z17-frame] en el loop
  // principal): mide el bloque de fondo completo (cualquiera de las 3
  // ramas de abajo) y, por separado, solo dibujarTilesZ17 -- línea base
  // directa Z17 contra panorámica amplia -- sin efecto en el dibujo.
  const tFondoDiagInicio = performance.now();
  let descriptorFondo: string | null = null;
  let tiempoDrawTilesMs: number | null = null;
  let tilesVisiblesDiag: number | null = null;
  let tilesFaltantesDiag: number | null = null;
  if (camaraZ17 && pesoZ17 !== null) {
    if (pesoZ17 < 1) {
      // PANORAMICA_HUECO (o panorámica base durante el intro) opaca
      // debajo, Z17 encima con peso creciente -- cross-dissolve estándar
      // sobre fondo opaco, sin canvas intermedio (ver alphaGlobal en
      // dibujarTilesZ17). null en vez de mapaDetalladoImg y 1 en vez de
      // escalaInicioOutro: PANORAMICA_HUECO usa exclusivamente mapaImg
      // (ver diseño aprobado -- a la escala ancha de un hueco, el detalle
      // extra de mapaDetalladoImg no aporta nada perceptible, y evita
      // inventar una fórmula de crossfade nueva).
      dibujarFondoMapaVideo(ctx, mapaImg, null, factorDetalle, camara, 1);
      const tTilesInicio = performance.now();
      const resultado = dibujarTilesZ17(ctx, tilesZ17, camaraZ17, escalaCropSeguimiento, pesoZ17);
      tiempoDrawTilesMs = performance.now() - tTilesInicio;
      tilesVisiblesDiag = resultado.tilesVisibles;
      tilesFaltantesDiag = resultado.tilesFaltantes;
      descriptorFondo = `CROSSFADE_HUECO_Z17 peso=${pesoZ17.toFixed(2)} ${resultado.descriptor}`;
    } else {
      const tTilesInicio = performance.now();
      const resultado = dibujarTilesZ17(ctx, tilesZ17, camaraZ17, escalaCropSeguimiento, 1);
      tiempoDrawTilesMs = performance.now() - tTilesInicio;
      tilesVisiblesDiag = resultado.tilesVisibles;
      tilesFaltantesDiag = resultado.tilesFaltantes;
      descriptorFondo = resultado.descriptor;
    }
  } else if (modoHuecoActivo) {
    // Camino independiente de PANORAMICA_OUTRO (ver diseño aprobado) --
    // exclusivamente mapaImg, sin mapaDetalladoImg ni escalaInicioOutro:
    // el `if (!mapaDetalladoImg) return;` de dibujarFondoMapaVideo corta
    // antes de tocar el 5to argumento, así que el `1` de abajo nunca se
    // usa.
    dibujarFondoMapaVideo(ctx, mapaImg, null, factorDetalle, camara, 1);
    descriptorFondo = "PANORAMICA_HUECO";
  } else {
    dibujarFondoMapaVideo(ctx, mapaImg, mapaDetalladoImg, factorDetalle, camara, escalaInicioOutro);
    descriptorFondo = "PANORAMICA_OUTRO";
  }
  const tFondoDiagMs = performance.now() - tFondoDiagInicio;

  if (refDiagnosticoFondo) {
    // Log en consola SOLO al cambiar (evita 30 líneas por segundo); el texto
    // en pantalla, en cambio, se redibuja siempre para poder leerlo en
    // cualquier instante pausando el video.
    if (descriptorFondo !== refDiagnosticoFondo.valor) {
      refDiagnosticoFondo.valor = descriptorFondo;
      console.log(`[video] fraccionTotal=${fraccionTotal.toFixed(3)} fondo=${descriptorFondo}`);
    }
    dibujarTextoDiagnosticoFondo(ctx, descriptorFondo);
  }

  if (refDiagnosticoFrame) {
    refDiagnosticoFrame.valor = {
      camaraCx: camara.cx,
      camaraCy: camara.cy,
      camaraEscala: camara.escala,
      descriptorFondo,
      indiceBase: frame.indiceBase,
      lat: frame.posicionActual?.lat ?? null,
      lon: frame.posicionActual?.lon ?? null,
      tiempoFondoMs: tFondoDiagMs,
      tiempoDrawTilesMs,
      camaraZ17X: camaraZ17?.x ?? null,
      camaraZ17Y: camaraZ17?.y ?? null,
      escalaCropSeguimiento: camaraZ17 ? escalaCropSeguimiento : null,
      tilesVisibles: tilesVisiblesDiag,
      tilesFaltantes: tilesFaltantesDiag,
    };
  }

  ctx.save();
  ctx.translate(ANCHO_VIDEO / 2, ALTO_VIDEO / 2);
  ctx.scale(camara.escala, camara.escala);
  ctx.translate(-camara.cx, -camara.cy);

  // Intro (panorámica/pausa/acercamiento): corta acá, ya con el fondo
  // dibujado -- todavía no corresponde mostrar trazo, marcador, etiquetas,
  // marca de velocidad máxima, pines ni la barra de estadísticas (eso
  // arranca recién con el primer cuadro real del seguimiento).
  if (soloFondo) {
    ctx.restore();
    ctx.restore();
    return;
  }

  // El trazo se dibuja tramo a tramo (no una sola polyline) para poder
  // colorear cada segmento según la velocidad real ahí -- más dorado/claro
  // en los tramos rápidos, más bronce/oscuro en los lentos. El grosor se
  // compensa por camara.escala (transformación activa en este bloque, ver
  // el ctx.scale de más arriba) para que se vea constante en pantalla --
  // las coordenadas x/y de cada segmento NO se tocan, siguen en espacio de
  // mapa como siempre.
  ctx.lineWidth = 6 / camara.escala;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (let k = 0; k < frame.puntosTrazo.length - 1; k++) {
    // El segmento k conecta datos.puntos[k] -> datos.puntos[k+1] (el último,
    // sintético, conecta datos.puntos[k] -> el punto interpolado en vivo,
    // pero pertenece al MISMO tramo original k+1 -- ver comentario de
    // indiceBase en FrameAnimado). clasificacionTramos[k+1] es exactamente
    // ese tramo -- si es "saltoGps", no se dibuja (mismo criterio que
    // dividirEnTramosParaDibujo en el mapa en vivo: corta el trazo acá,
    // retoma en el siguiente segmento válido, sin unir con una línea recta).
    if (clasificacionTramos[k + 1] === "saltoGps") continue;
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
// Wrapper delgado: dueño exclusivo del ciclo de vida del cache temporal de
// tiles (ver CacheTilesLRU) -- lo crea acá y garantiza con try/finally que se
// libere al terminar, tanto si generarVideoRecorridoInterno termina bien
// como si tira una excepción en cualquier punto (video demasiado corto,
// MediaRecorder no soportado, fallo de grabación, etc.). El resto de la
// lógica (intro, mosaicos, cámara, outro, MediaRecorder) sigue exactamente
// igual, solo movida a la función interna de abajo.
export async function generarVideoRecorrido(
  datos: DatosTarjetaRecorrido,
  opciones: OpcionesVideoRecorrido = {},
): Promise<Blob> {
  const cacheTiles = crearCacheTilesLRU(LIMITE_CACHE_TILES_SEGUIMIENTO);
  try {
    return await generarVideoRecorridoInterno(datos, opciones, cacheTiles);
  } finally {
    // Resumen final REAL de esta generación (no estimado) -- se imprime acá,
    // en el wrapper, para garantizar que corre exactamente una vez, tanto en
    // éxito como en error (ver los contadores reales pedidos: total fetch,
    // cache hits/misses, 429, timeouts, 404, otros fallos, mosaicos OK/null).
    console.log(`[video] RESUMEN ${JSON.stringify(cacheTiles.contadores)}`);
    limpiarCacheTilesLRU(cacheTiles);
  }
}

async function generarVideoRecorridoInterno(
  datos: DatosTarjetaRecorrido,
  opciones: OpcionesVideoRecorrido,
  cacheTiles: CacheTilesLRU,
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

  // Instrumentación temporal -- confirma con el propio runtime, no con
  // suposiciones, qué build está corriendo de verdad (ver el pedido de
  // descartar bundle/cache viejo). Si esto no aparece en la consola con
  // estos valores, el navegador/WebView está ejecutando JS de antes de este
  // cambio -- no hay ningún service worker con fetch() en la app (revisado:
  // public/sw.js solo escucha push/notificationclick) que pueda estar
  // sirviendo un bundle viejo, así que sería cache HTTP normal del
  // navegador/CDN.
  console.log(
    `[video] build activo -- arquitectura=tiles-z17 LIMITE_CACHE_TILES_SEGUIMIENTO=${LIMITE_CACHE_TILES_SEGUIMIENTO} ZOOM_SEGUIMIENTO=${ZOOM_SEGUIMIENTO} ESCALA_SEGUIMIENTO=${ESCALA_SEGUIMIENTO} LIMITE_REFERENCIA_MEMORIA_TILES_MB=${LIMITE_REFERENCIA_MEMORIA_TILES_MB}`,
  );

  const [logoGrandeDataUrl, mapa, avatarDataUrl] = await Promise.all([
    cargarImagenComoDataUrl("/logo-legion-roller.png"),
    generarMapaReal(datos.puntos, ANCHO_VIDEO, ALTO_VIDEO, false),
    avatarUrl ? cargarImagenComoDataUrl(avatarUrl) : Promise.resolve(null),
  ]);

  // Segundo mapa, más detallado, para el tramo en que la cámara persigue de
  // cerca (ver dibujarFondoMapaVideo/generarMapaDetallado) -- depende del
  // zoom que haya elegido el panorámico, así que se pide después. Si falla
  // (sin conexión, recorrido demasiado grande para el tope de tiles) queda
  // null y el video sigue exactamente como antes: acercamiento digital sobre
  // el panorámico, sin cortar la generación.
  const mapaDetallado = mapa ? await generarMapaDetallado(mapa, ANCHO_VIDEO, ALTO_VIDEO) : null;
  const factorDetalle = mapa && mapaDetallado ? 2 ** (mapaDetallado.zoom - mapa.zoom) : 1;

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
  const [mapaImg, mapaDetalladoImg, fotoFinalImg, fotosPinImg, avatarImg, logoGrandeImg] = await Promise.all([
    cargarImagenOpcional(mapa?.dataUrl ?? null),
    cargarImagenOpcional(mapaDetallado?.dataUrl ?? null),
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

  // Clasificación GPS por tramo (geo.ts, sin tocar su lógica) -- ÚNICA fuente
  // de verdad, calculada una vez y compartida por el trazado (corta la línea
  // en un tramo saltoGps) y el selector de mosaicos (no avanza el índice con
  // un tramo saltoGps) -- ver dibujarFrame más abajo. datos.puntos no se
  // toca ni se filtra en ningún punto, esto es solo una clasificación
  // paralela ya validada en la ronda anterior.
  const clasificacionTramos = clasificarTramos(datos.puntos);

  // Conversión geográfica entre la grilla de ZOOM_SEGUIMIENTO y la del
  // panorámico -- UNA sola fuente de verdad, reutilizada por
  // calcularMosaicosSeguimiento, estadoCamara (escala del seguimiento y del
  // arranque del outro) y calcularCamaraZ17. Si no hay panorámica (sin
  // conexión), 1 es un valor seguro que no rompe ninguna cuenta -- ese caso
  // ya cae al respaldo vectorial completo, sin mosaicos ni escala dinámica.
  const factorSeguimiento = mapa ? 2 ** (ZOOM_SEGUIMIENTO - mapa.zoom) : 1;

  // Corredor de tiles Z17 de la cámara de seguimiento (ver diseño
  // aprobado, "Opción C -- tiles Z17 directos"): a diferencia del viejo
  // esquema de mosaicos, esto se calcula directamente sobre datos.puntos
  // reales (sin simplificar) -- cada tile es una descarga chica e
  // independiente, así que no hay costo por punto que amerite reducir la
  // resolución de la ruta primero.
  const corredorTilesZ17 = mapa ? construirCorredorTilesZ17(datos.puntos, clasificacionTramos) : new Set<string>();
  // Instrumentación temporal: qué fondo se dibujó REALMENTE en el cuadro
  // anterior (ver dibujarCuadroVideo/dibujarTextoDiagnosticoFondo) -- para
  // loguear en consola solo al cambiar, no 30 veces por segundo.
  const refDiagnosticoFondo: { valor: string | null } = { valor: null };
  // Diagnóstico temporal (investigación de congelamientos, ver [render-diag]
  // en el loop principal más abajo) -- snapshot mutado por dibujarCuadroVideo
  // en CADA cuadro (no solo al cambiar).
  const refDiagnosticoFrame: { valor: DiagnosticoFrame | null } = { valor: null };
  let tilesZ17Residentes: Map<string, ImageBitmap> = new Map();
  if (corredorTilesZ17.size > 0) {
    // Fase A (ver diseño aprobado): descarga y decodifica TODOS los tiles
    // del corredor -- no solo los primeros -- antes de dibujar el primer
    // cuadro y bien antes de arrancar MediaRecorder (ver más abajo). Nunca
    // se descarga ni decodifica un tile durante Fase B (ver dibujarFrame):
    // si falta uno ahí, es un error de preparación, no un fetch pendiente.
    tilesZ17Residentes = await prepararTilesZ17(corredorTilesZ17, cacheTiles.contadores);
  }

  const { punto: puntoVelMax, indice: indiceVelMax, kmh: kmhVelMax } = velocidadMaximaConPunto(datos.puntos);

  // Instrumentación temporal: diagnóstico puntual del segmento que produce
  // kmhVelMax (la velocidad máxima YA REPORTADA -- ver velocidadMaximaConPunto
  // en geo.ts, que ya filtra con clasificarTramos/VELOCIDAD_PLAUSIBLE_MAX_KMH=45
  // antes de llegar acá) más la lista COMPLETA, sin filtrar, de todos los
  // segmentos crudos por sobre 45 km/h -- para distinguir pico aislado, hueco
  // de grabación, racha rápida real o error GPS evidente. Solo lee datos.puntos
  // y velocidadMaximaConPunto -- no cambia velocidadesKmh, clasificarTramos,
  // el trazado ni ningún otro sistema.
  if (indiceVelMax > 0 && puntoVelMax) {
    const iv = indiceVelMax;
    const antesDelAnterior = datos.puntos[Math.max(0, iv - 2)];
    const anterior = datos.puntos[iv - 1];
    const actual = datos.puntos[iv];
    const siguiente = datos.puntos[Math.min(datos.puntos.length - 1, iv + 1)];
    const distKm = distanciaHaversineKm(anterior, actual);
    const dtSeg = (actual.timestamp - anterior.timestamp) / 1000;
    console.warn(`[vel-max] indice=${iv}/${datos.puntos.length - 1} kmhReportado=${kmhVelMax.toFixed(1)}`);
    console.warn(
      `[vel-max] punto antes-del-anterior: lat=${antesDelAnterior.lat.toFixed(6)} lon=${antesDelAnterior.lon.toFixed(6)} t=${antesDelAnterior.timestamp}`,
    );
    console.warn(`[vel-max] punto anterior: lat=${anterior.lat.toFixed(6)} lon=${anterior.lon.toFixed(6)} t=${anterior.timestamp}`);
    console.warn(`[vel-max] punto actual (del salto): lat=${actual.lat.toFixed(6)} lon=${actual.lon.toFixed(6)} t=${actual.timestamp}`);
    console.warn(`[vel-max] punto siguiente: lat=${siguiente.lat.toFixed(6)} lon=${siguiente.lon.toFixed(6)} t=${siguiente.timestamp}`);
    console.warn(
      `[vel-max] anterior->actual: distancia=${distKm.toFixed(4)}km dt=${dtSeg.toFixed(2)}s velocidad=${kmhVelMax.toFixed(1)}km/h`,
    );
  } else {
    console.warn(`[vel-max] velocidadMaximaConPunto no encontró ningún tramo confiable (indiceVelMax=${indiceVelMax})`);
  }

  const UMBRAL_DIAGNOSTICO_KMH = 45;
  const segmentosRapidos: { indice: number; distKm: number; dtSeg: number; kmh: number }[] = [];
  for (let iSeg = 1; iSeg < datos.puntos.length; iSeg++) {
    const distKmSeg = distanciaHaversineKm(datos.puntos[iSeg - 1], datos.puntos[iSeg]);
    const dtSegRaw = (datos.puntos[iSeg].timestamp - datos.puntos[iSeg - 1].timestamp) / 1000;
    const kmhSeg = dtSegRaw > 0 ? (distKmSeg / dtSegRaw) * 3600 : Infinity;
    if (kmhSeg > UMBRAL_DIAGNOSTICO_KMH) segmentosRapidos.push({ indice: iSeg, distKm: distKmSeg, dtSeg: dtSegRaw, kmh: kmhSeg });
  }
  segmentosRapidos.sort((a, b) => b.kmh - a.kmh);
  console.warn(`[vel-max] segmentos crudos (sin filtrar) por sobre ${UMBRAL_DIAGNOSTICO_KMH}km/h: ${segmentosRapidos.length}`);
  segmentosRapidos.forEach((s) => {
    console.warn(`[vel-max]   ${s.indice} | ${s.distKm.toFixed(4)}km | ${s.dtSeg.toFixed(2)}s | ${s.kmh.toFixed(1)}km/h`);
  });

  // Instrumentación temporal: corre la clasificación REAL de
  // clasificarTramos() (geo.ts, sin tocar su lógica -- se llama tal cual) y,
  // para diseñar la clasificación compartida video/mosaicos/velocidad,
  // muestra el veredicto real de cada segmento >45km/h más el chequeo de
  // desplazamiento neto (punto antes de la racha -> punto después) que
  // clasifica cada racha como rapidoValido o saltoGps. Solo lectura -- no
  // cambia clasificarTramos, velocidadesKmh, el trazado ni los mosaicos.
  const clasificacionTramosDiag = clasificarTramos(datos.puntos);
  console.warn(`[clasificacion] veredicto real por segmento (>45km/h):`);
  segmentosRapidos.forEach((s) => {
    console.warn(
      `[clasificacion]   ${s.indice} | ${s.distKm.toFixed(4)}km | ${s.dtSeg.toFixed(2)}s | ${s.kmh.toFixed(1)}km/h | ${clasificacionTramosDiag[s.indice]}`,
    );
  });
  let iRacha = 1;
  while (iRacha < clasificacionTramosDiag.length) {
    if (clasificacionTramosDiag[iRacha] === "normal") {
      iRacha++;
      continue;
    }
    const etiquetaRacha = clasificacionTramosDiag[iRacha];
    let finRacha = iRacha;
    while (finRacha + 1 < clasificacionTramosDiag.length && clasificacionTramosDiag[finRacha + 1] === etiquetaRacha) {
      finRacha++;
    }
    const hayDespues = finRacha + 1 < datos.puntos.length;
    const antesRacha = datos.puntos[iRacha - 1];
    const despuesRacha = datos.puntos[Math.min(datos.puntos.length - 1, finRacha + 1)];
    const distNetaKm = distanciaHaversineKm(antesRacha, despuesRacha);
    const dtNetoSeg = (despuesRacha.timestamp - antesRacha.timestamp) / 1000;
    const kmhNeto = dtNetoSeg > 0 ? (distNetaKm / dtNetoSeg) * 3600 : Infinity;
    console.warn(
      `[clasificacion] racha [${iRacha}-${finRacha}] = ${etiquetaRacha} -- neto punto[${iRacha - 1}]->punto[${Math.min(datos.puntos.length - 1, finRacha + 1)}]: distancia=${distNetaKm.toFixed(4)}km dt=${dtNetoSeg.toFixed(2)}s kmhNeto=${kmhNeto.toFixed(1)} (${hayDespues ? "hay punto despues" : "SIN punto despues -- se acepta por defecto"})`,
    );
    iRacha = finRacha + 1;
  }

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
  // Estado de cámara persistido entre cuadros (ver suavizarCamara) --
  // exclusivo del seguimiento, suavizarCamara no se toca en el outro (ver
  // diseño aprobado: la continuidad ahí se logra con estadoCamara solo,
  // sin una segunda suavización). direccionAnticipacionRef en cambio SÍ se
  // sigue leyendo (y actualizando, de forma idempotente) en el outro -- ver
  // el bloque `else` de dibujarFrame más abajo.
  const camaraSuavizadaRef: { valor: CamaraSuavizada | null } = { valor: null };
  const direccionAnticipacionRef: { valor: DireccionAnticipacion | null } = { valor: null };
  // Opción 5 -- estado del hueco de cobertura en curso, si hay uno (ver
  // EstadoHueco/calcularCamaraHueco). "ninguno" el resto del video.
  const huecoRef: { valor: EstadoHueco } = {
    valor: { fase: "ninguno", indiceDestino: null, camaraAmplia: null, escalaActual: null, cuadrosDesdeConvergencia: null },
  };
  // Diagnóstico temporal (solo para entender por qué el hueco grande no
  // vuelve a Z17 -- ver [hueco-diag] más abajo). Cuenta cuadros consecutivos
  // en fase "regresando" para throttlear el log; se resetea cada vez que se
  // entra de nuevo a "regresando". No participa de ninguna decisión.
  const diagnosticoRegresandoRef: { valor: number } = { valor: 0 };
  // Diagnóstico temporal (investigación de la transición MOSAICO->OUTRO,
  // ver [outro-diag] más abajo): última cámara real del seguimiento (se
  // actualiza cada cuadro mientras enSeguimiento) y si ya se logueó la
  // comparación del primer cuadro del outro contra ese valor -- ninguno de
  // los dos participa en ninguna decisión geométrica.
  const ultimaCamaraSeguimientoRef: { valor: EstadoCamara | null } = { valor: null };
  const transicionOutroLogueadaRef: { valor: boolean } = { valor: false };
  const cuadrosOutroRef: { valor: number } = { valor: 0 };
  const INTERVALO_LOG_OUTRO_DIAG_FRAMES = 10;

  function dibujarFrame(fraccionTotal: number, mostrarFotoFinal: boolean, pulsoVelMax = 0) {
    const fraccionTrazo = Math.min(1, fraccionTotal / FRACCION_TRAZO_COMPLETO);
    const frame = estadoEnFraccion(datos, distanciaAcumuladaKm, fraccionTrazo);
    const focoActual = frame.posicionActual ?? datos.puntos[datos.puntos.length - 1];
    const focoTrazandoPx = { x: x(focoActual.lon), y: y(focoActual.lat) };

    const enSeguimiento = fraccionTotal <= FRACCION_TRAZO_COMPLETO;
    let camara: EstadoCamara;
    let camaraZ17: { x: number; y: number } | null = null;
    // Peso (0..1) con el que se dibuja Z17 este cuadro -- null mientras no
    // corresponda dibujarlo (ver dibujarCuadroVideo/dibujarTilesZ17).
    let pesoZ17: number | null = null;
    // Escala para dibujarTilesZ17 -- ESCALA_SEGUIMIENTO en seguimiento
    // normal ("ninguno"), o camara.escala/factorSeguimiento mientras la
    // cámara sigue convergiendo tras un hueco ("convergiendo", ver más
    // abajo). Sin efecto fuera del tramo de seguimiento (outro), donde
    // camaraZ17/pesoZ17 quedan null y este valor no se usa.
    let escalaCropSeguimiento = ESCALA_SEGUIMIENTO;

    if (enSeguimiento) {
      // Punto de mira desplazado hacia adelante en la ruta (ver
      // calcularFocoConAnticipacion) -- estadoCamara sigue siendo la MISMA
      // función de siempre (clamp a los bordes del mapa incluido, ahora
      // referido a la escala dinámica del seguimiento), solo que acá recibe
      // el foco ya desplazado en vez del crudo.
      const anticipacion = calcularFocoConAnticipacion(
        focoTrazandoPx,
        datos,
        distanciaAcumuladaKm,
        fraccionTrazo,
        x,
        y,
        direccionAnticipacionRef.valor,
        factorSeguimiento * ESCALA_SEGUIMIENTO,
      );
      direccionAnticipacionRef.valor = anticipacion.direccion;
      const objetivoCercanoNormal = estadoCamara(fraccionTotal, anticipacion.foco, focoCentroPx, factorSeguimiento);

      // Opción 5 (hueco de cobertura): el objetivo real de este frame es el
      // de seguimiento cercano de siempre, SALVO mientras haya un hueco en
      // curso -- ahí el objetivo pasa a ser el encuadre amplio (fase
      // "en_hueco") o, ya de vuelta, el mismo objetivo cercano normal pero
      // con la escala todavía convergiendo (fase "regresando"). La escala se
      // suaviza a mano (mismo FACTOR_SUAVIZADO_CAMARA que ya usa la posición
      // en suavizarCamara, que no interpola escala) -- ver EstadoHueco.
      let objetivoCrudo: EstadoCamara = objetivoCercanoNormal;
      if (huecoRef.valor.fase === "en_hueco" && huecoRef.valor.camaraAmplia && huecoRef.valor.escalaActual !== null) {
        const camaraAmplia = huecoRef.valor.camaraAmplia;
        const escalaActual = huecoRef.valor.escalaActual + (camaraAmplia.escala - huecoRef.valor.escalaActual) * FACTOR_SUAVIZADO_CAMARA;
        huecoRef.valor = { ...huecoRef.valor, escalaActual };
        objetivoCrudo = { cx: camaraAmplia.cx, cy: camaraAmplia.cy, escala: escalaActual };
      } else if (
        (huecoRef.valor.fase === "regresando" || huecoRef.valor.fase === "convergiendo") &&
        huecoRef.valor.escalaActual !== null
      ) {
        const escalaActual =
          huecoRef.valor.escalaActual + (objetivoCercanoNormal.escala - huecoRef.valor.escalaActual) * FACTOR_SUAVIZADO_CAMARA;
        huecoRef.valor = { ...huecoRef.valor, escalaActual };
        objetivoCrudo = { cx: objetivoCercanoNormal.cx, cy: objetivoCercanoNormal.cy, escala: escalaActual };
      }

      camara = suavizarCamara(objetivoCrudo, camaraSuavizadaRef.valor, fraccionTotal);
      camaraSuavizadaRef.valor = { cx: camara.cx, cy: camara.cy };

      // Cámara de tiles Z17: solo aplica durante el trazo (nunca en el
      // tramo final, que sigue usando la panorámica de siempre). A
      // diferencia del esquema de mosaicos, acá NO hay ningún "índice
      // activo" que avanzar -- la pregunta en cada frame es simplemente
      // "¿están preparados todos los tiles del viewport en esta posición
      // de cámara?" (coberturaCompletaZ17, contra el corredor planeado en
      // Fase A). Si la respuesta es sí, se dibuja Z17; si no, se cae a la
      // panorámica de hueco. Fase A (prepararTilesZ17) ya dejó
      // tilesZ17Residentes completo de antemano, así que este bloque
      // (Fase B) solo lee de ahí, nunca escribe.
      if (corredorTilesZ17.size > 0 && mapa) {
        // Cuenta cuadros de "convergiendo" para el crossfade visual
        // PANORAMICA_HUECO->Z17 (ver CROSSFADE_HUECO_Z17_FRAMES) -- se
        // incrementa acá, ANTES de que el bloque de "regresando" de abajo
        // pueda recién ahora poner cuadrosDesdeConvergencia en 0 en este
        // mismo frame (la transición regresando->convergiendo), así el
        // primer cuadro dibujado con Z17 reactivado usa exactamente 0, no 1.
        if (huecoRef.valor.fase === "convergiendo" && huecoRef.valor.cuadrosDesdeConvergencia !== null) {
          huecoRef.valor = { ...huecoRef.valor, cuadrosDesdeConvergencia: huecoRef.valor.cuadrosDesdeConvergencia + 1 };
        }
        // Transiciones de fase de la Opción 5, evaluadas con la cámara YA
        // calculada este mismo frame (ver diseño aprobado: mismo `camara`
        // para panorámica y para el chequeo de si Z17 ya puede reactivarse).
        // indiceDestino es ahora un índice de datos.puntos (posición GPS
        // real de destino), no un índice de mosaico -- ver detección más
        // abajo.
        if (huecoRef.valor.fase === "en_hueco" && huecoRef.valor.indiceDestino !== null) {
          const gxActual = lonAPixelX(focoActual.lon, ZOOM_SEGUIMIENTO);
          const gyActual = latAPixelY(focoActual.lat, ZOOM_SEGUIMIENTO);
          // Cobertura real en la posición GPS actual (no una distancia a un
          // centro/radio de mosaico, que ya no existe): apenas la posición
          // actual del recorrido tenga todos sus tiles preparados, dejamos
          // de alejar la cámara y pasamos a "regresando".
          const coberturaActual = coberturaCompletaZ17(
            { x: gxActual, y: gyActual },
            ESCALA_SEGUIMIENTO,
            corredorTilesZ17,
          );
          if (coberturaActual) {
            console.log(
              `[hueco] fraccionTotal=${fraccionTotal.toFixed(3)} en_hueco -> regresando (destino=${huecoRef.valor.indiceDestino})`,
            );
            huecoRef.valor = { ...huecoRef.valor, fase: "regresando" };
            diagnosticoRegresandoRef.valor = 0;
          }
        } else if (huecoRef.valor.fase === "regresando" && huecoRef.valor.indiceDestino !== null) {
          const camaraZ17Regreso = calcularCamaraZ17(camara, mapa, factorSeguimiento);
          // escalaCropTransicion = camara.escala/factorSeguimiento -- la
          // misma escala que la panorámica de este frame representa en
          // espacio Z17 (ver verificar_continuidad_hueco.ts: con ella el
          // recorte Z17 muestra exactamente la misma ventana geográfica que
          // la panorámica en cualquier valor de camara.escala; con
          // camara.escala puro había un salto ×factorSeguimiento). Converge
          // sola a ESCALA_SEGUIMIENTO cuando camara.escala llega a su
          // régimen estable -- sin umbral nuevo. SIN CAMBIOS respecto al
          // esquema de mosaicos -- solo cambia qué pregunta de cobertura se
          // le hace a esta cámara/escala.
          const escalaCropTransicion = camara.escala / factorSeguimiento;
          const coberturaRegreso = coberturaCompletaZ17(camaraZ17Regreso, escalaCropTransicion, corredorTilesZ17);

          // Diagnóstico temporal -- NO cambia ninguna decisión, solo lee y
          // registra el estado exacto de convergencia mientras la fase
          // "regresando" sigue esperando cobertura completa. Throttled a
          // cada 5 cuadros (más el primero y todo cuadro donde ya cubre)
          // para no inundar la consola en huecos largos.
          diagnosticoRegresandoRef.valor++;
          if (diagnosticoRegresandoRef.valor === 1 || diagnosticoRegresandoRef.valor % 5 === 0 || coberturaRegreso) {
            const rango = rangoTilesVisibles(camaraZ17Regreso, escalaCropTransicion);
            console.log(
              `[hueco-diag] fraccionTotal=${fraccionTotal.toFixed(3)} restanteHastaTrazoCompleto=${(FRACCION_TRAZO_COMPLETO - fraccionTotal).toFixed(3)} destino=${huecoRef.valor.indiceDestino} ` +
                `camara.cx=${camara.cx.toFixed(1)} camara.cy=${camara.cy.toFixed(1)} camara.escala=${camara.escala.toFixed(4)} escalaCropTransicion=${escalaCropTransicion.toFixed(4)} escalaActual=${huecoRef.valor.escalaActual?.toFixed(4)} ` +
                `camaraZ17=(${camaraZ17Regreso.x.toFixed(1)},${camaraZ17Regreso.y.toFixed(1)}) rangoTiles=[${rango.tileXMin},${rango.tileXMax}]x[${rango.tileYMin},${rango.tileYMax}] ` +
                `coberturaCompleta=${coberturaRegreso}`,
            );
          }

          // Única condición para reactivar Z17: todos los tiles del
          // viewport YA están preparados con la cámara actual (misma
          // cámara que se está usando para la panorámica este frame). Sin
          // umbral de escala/posición arbitrario.
          //
          // Pasa a "convergiendo", NO a "ninguno": la fuente Z17 ya puede
          // activarse (esto), pero camara.escala todavía puede seguir
          // convergiendo -- ver EstadoHueco/FaseHueco. indiceDestino/
          // camaraAmplia/escalaActual se conservan (no se limpian) porque
          // "convergiendo" sigue necesitando escalaActual en la selección de
          // objetivoCrudo, arriba.
          if (coberturaRegreso) {
            console.log(
              `[hueco] fraccionTotal=${fraccionTotal.toFixed(3)} regresando -> convergiendo (Z17 reactivado, destino=${huecoRef.valor.indiceDestino}, escalaCropTransicion=${escalaCropTransicion.toFixed(4)})`,
            );
            huecoRef.valor = { ...huecoRef.valor, fase: "convergiendo", cuadrosDesdeConvergencia: 0 };
          }
        }

        // "convergiendo" se trata igual que "ninguno" para todo propósito de
        // dibujo/detección (chequeo de cobertura, detección de un hueco
        // nuevo) -- la única diferencia entre ambas fases está arriba, en
        // qué escala usa objetivoCrudo. Acá solo cambia qué escala le
        // pasamos a coberturaCompletaZ17: la misma escalaCropTransicion
        // mientras seguimos "convergiendo" (para no saltar de golpe a
        // ESCALA_SEGUIMIENTO en el mismo frame en que se reactivó la
        // fuente), o ESCALA_SEGUIMIENTO puro una vez que ya estamos en
        // seguimiento normal ("ninguno"). Sin condición de salida explícita
        // "convergiendo" -> "ninguno": esta expresión converge sola a
        // ESCALA_SEGUIMIENTO a medida que camara.escala converge a su
        // régimen estable (factorSeguimiento×ESCALA_SEGUIMIENTO).
        if (huecoRef.valor.fase === "ninguno" || huecoRef.valor.fase === "convergiendo") {
          const camaraZ17Candidata = calcularCamaraZ17(camara, mapa, factorSeguimiento);
          const escalaCropCandidata =
            huecoRef.valor.fase === "convergiendo" ? camara.escala / factorSeguimiento : ESCALA_SEGUIMIENTO;
          const coberturaOk = coberturaCompletaZ17(camaraZ17Candidata, escalaCropCandidata, corredorTilesZ17);

          if (coberturaOk) {
            camaraZ17 = camaraZ17Candidata;
            escalaCropSeguimiento = escalaCropCandidata;
            pesoZ17 =
              huecoRef.valor.fase === "convergiendo" &&
              huecoRef.valor.cuadrosDesdeConvergencia !== null &&
              huecoRef.valor.cuadrosDesdeConvergencia < CROSSFADE_HUECO_Z17_FRAMES
                ? clamp(huecoRef.valor.cuadrosDesdeConvergencia / CROSSFADE_HUECO_Z17_FRAMES, 0, 1)
                : 1;
          } else if (huecoRef.valor.fase === "ninguno") {
            // Hueco de cobertura recién detectado: buscamos hacia adelante,
            // sobre los puntos GPS reales (no un índice de mosaico), el
            // primer punto con tramo confiable (misma clasificacionTramos
            // que ya usa el trazado) y cobertura completa de tiles en
            // ESCALA_SEGUIMIENTO -- ese es el destino del hueco. Este mismo
            // frame se sigue dibujando con lo que ya estaba activo (sin
            // cambios visuales todavía) -- la panorámica arranca recién el
            // frame siguiente, cuando el objetivo de cámara ya apunta a
            // camaraAmplia.
            const indiceOrigen = frame.indiceBase ?? 0;
            let indiceDestino = indiceOrigen + 1;
            while (
              indiceDestino < datos.puntos.length - 1 &&
              (clasificacionTramos[indiceDestino] === "saltoGps" ||
                !coberturaCompletaZ17(
                  {
                    x: lonAPixelX(datos.puntos[indiceDestino].lon, ZOOM_SEGUIMIENTO),
                    y: latAPixelY(datos.puntos[indiceDestino].lat, ZOOM_SEGUIMIENTO),
                  },
                  ESCALA_SEGUIMIENTO,
                  corredorTilesZ17,
                ))
            ) {
              indiceDestino++;
            }
            const puntoOrigen = datos.puntos[indiceOrigen];
            const puntoDestino = datos.puntos[indiceDestino];
            const origenPx = { x: x(puntoOrigen.lon), y: y(puntoOrigen.lat) };
            const destinoPx = { x: x(puntoDestino.lon), y: y(puntoDestino.lat) };
            const camaraAmplia = calcularCamaraHueco(origenPx, destinoPx, camara.escala);
            huecoRef.valor = {
              fase: "en_hueco",
              indiceDestino,
              camaraAmplia,
              escalaActual: camara.escala,
              cuadrosDesdeConvergencia: null,
            };
            console.log(
              `[hueco] fraccionTotal=${fraccionTotal.toFixed(3)} detectado -- origen=${indiceOrigen} destino=${indiceDestino} camaraAmplia.escala=${camaraAmplia.escala.toFixed(3)}`,
            );
            // Con Fase A, todos los tiles del corredor ya están preparados
            // de antemano (ver prepararTilesZ17) -- no hace falta disparar
            // ningún fetch/prefetch acá.
          }
        }
        // Si huecoRef.valor.fase es "en_hueco" o "regresando": camaraZ17
        // queda null y pesoZ17 queda null (declarados arriba) --
        // dibujarCuadroVideo recibe modoHuecoActivo=true (ver su llamada
        // más abajo) y dibuja PANORAMICA_HUECO (mapaImg solo, camino
        // independiente de PANORAMICA_OUTRO), con la MISMA `camara` de
        // este frame. "convergiendo" NO cae acá -- ya quedó cubierta
        // arriba junto con "ninguno", con su propio crossfade hacia Z17
        // mientras cuadrosDesdeConvergencia < CROSSFADE_HUECO_Z17_FRAMES.
      }
      // Diagnóstico temporal (ver [outro-diag] más abajo): última cámara
      // real del seguimiento, para comparar contra el primer cuadro del
      // outro. No participa de ninguna decisión.
      ultimaCamaraSeguimientoRef.valor = camara;
    } else {
      // Outro (ver diseño aprobado de continuidad seguimiento->outro): el
      // primer cuadro arranca con el MISMO foco anticipado con el que
      // terminó el seguimiento, desvaneciéndose hacia focoTrazandoPx (sin
      // anticipación) con la misma curva `t` que ya gobierna el
      // alejamiento -- ni un temporizador nuevo ni una segunda
      // suavización (suavizarCamara sigue completamente fuera de acá).
      //
      // calcularFocoConAnticipacion NO se modifica -- con fraccionTrazo=1
      // (el mismo valor que ya usa fraccionTrazo arriba en este outro) cae
      // en su propia rama "sin punto adelante confiable" (dist=0 exacto,
      // ver su comentario) y devuelve la MISMA dirección congelada que ya
      // tenía direccionAnticipacionRef -- sin estado nuevo para conservar
      // la anticipación.
      const anticipacionOutro = calcularFocoConAnticipacion(
        focoTrazandoPx,
        datos,
        distanciaAcumuladaKm,
        1,
        x,
        y,
        direccionAnticipacionRef.valor,
        factorSeguimiento * ESCALA_SEGUIMIENTO,
      );
      direccionAnticipacionRef.valor = anticipacionOutro.direccion;
      const tAlejamiento = progresoAlejamientoOutro(fraccionTotal);
      const focoOutro = {
        x: focoTrazandoPx.x + (anticipacionOutro.foco.x - focoTrazandoPx.x) * (1 - tAlejamiento),
        y: focoTrazandoPx.y + (anticipacionOutro.foco.y - focoTrazandoPx.y) * (1 - tAlejamiento),
      };
      camara = estadoCamara(fraccionTotal, focoOutro, focoCentroPx, factorSeguimiento);

      // Diagnóstico temporal -- confirma en consola que el salto
      // estructural de ~70px desapareció (ver diseño aprobado) y que el
      // residual de anticipación decae a 0 hacia t=1.
      if (!transicionOutroLogueadaRef.valor && ultimaCamaraSeguimientoRef.valor) {
        transicionOutroLogueadaRef.valor = true;
        const antes = ultimaCamaraSeguimientoRef.valor;
        const deltaCentroBasePx = Math.hypot(camara.cx - antes.cx, camara.cy - antes.cy);
        const deltaCentroPantallaPx = Math.hypot((camara.cx - antes.cx) * camara.escala, (camara.cy - antes.cy) * camara.escala);
        console.log(
          `[outro-diag] transición seguimiento->outro -- ` +
            `deltaCentroBasePx=${deltaCentroBasePx.toFixed(2)} deltaCentroPantallaPx=${deltaCentroPantallaPx.toFixed(2)} ` +
            `escalaAntes=${antes.escala.toFixed(4)} escalaDespues=${camara.escala.toFixed(4)} deltaEscala=${(camara.escala - antes.escala).toFixed(4)}`,
        );
      }
      if (cuadrosOutroRef.valor < INTERVALO_LOG_OUTRO_DIAG_FRAMES) {
        cuadrosOutroRef.valor++;
        const residual = {
          x: (anticipacionOutro.foco.x - focoTrazandoPx.x) * (1 - tAlejamiento),
          y: (anticipacionOutro.foco.y - focoTrazandoPx.y) * (1 - tAlejamiento),
        };
        const residualAnticipacionPantallaPx = Math.hypot(residual.x, residual.y) * camara.escala;
        console.log(
          `[outro-diag] t=${tAlejamiento.toFixed(4)} residualAnticipacionPantallaPx=${residualAnticipacionPantallaPx.toFixed(2)} ` +
            `focoBase=(${focoTrazandoPx.x.toFixed(2)},${focoTrazandoPx.y.toFixed(2)}) ` +
            `focoAnticipado=(${anticipacionOutro.foco.x.toFixed(2)},${anticipacionOutro.foco.y.toFixed(2)}) ` +
            `focoOutro=(${focoOutro.x.toFixed(2)},${focoOutro.y.toFixed(2)})`,
        );
      }
    }

    dibujarCuadroVideo(
      ctx!,
      datos,
      mapaImg,
      mapaDetalladoImg,
      factorDetalle,
      x,
      y,
      focoCentroPx,
      frame,
      fraccionTotal,
      config,
      mostrarFotoFinal,
      camara,
      factorSeguimiento * ESCALA_SEGUIMIENTO,
      camaraZ17,
      escalaCropSeguimiento,
      huecoRef.valor.fase === "en_hueco" || huecoRef.valor.fase === "regresando",
      pesoZ17,
      pulsoVelMax,
      suavizadoEtiquetas,
      tilesZ17Residentes,
      false,
      refDiagnosticoFondo,
      refDiagnosticoFrame,
      clasificacionTramos,
    );
  }

  // --- Intro: panorámica limpia -> pausa -> acercamiento suave hasta la
  // posición/escala EXACTAS del arranque del seguimiento ---
  //
  // A propósito no toca el eje fraccionTotal (que gobierna trazo, etiquetas
  // de sector y la marca de velocidad máxima, ver alphaEtiqueta/el disparo
  // de vel. máxima más abajo): en vez de "robarle" una porción al rango
  // existente [0, FRACCION_TRAZO_COMPLETO] (lo que desincronizaría esas tres
  // cosas), se agrega como cuadros EXTRA antes de que arranque el loop
  // principal -- mismo patrón que ya usaba la tarjeta de nombre/avatar
  // (dibujarOverlayIntro), que también se dibuja con fraccionTotal fijo en
  // 0. Todos estos cuadros de intro usan soloFondo=true en
  // dibujarCuadroVideo, así que nunca se alcanza a ver trazo, marcador,
  // etiquetas, marca de velocidad máxima ni la barra de estadísticas antes
  // de que el recorrido arranque de verdad.
  const focoInicioPx = { x: x(datos.puntos[0].lon), y: y(datos.puntos[0].lat) };
  const anticipacionInicio = calcularFocoConAnticipacion(
    focoInicioPx,
    datos,
    distanciaAcumuladaKm,
    0,
    x,
    y,
    null,
    factorSeguimiento * ESCALA_SEGUIMIENTO,
  );
  const camaraPanoramicaIntro: EstadoCamara = { cx: focoCentroPx.x, cy: focoCentroPx.y, escala: 1 };
  // Misma fórmula, mismos datos que el PRIMER cuadro real del seguimiento
  // (dibujarFrame(0, ...), fraccionTrazo=0) -- garantiza que el último
  // cuadro del acercamiento coincida exacto con el primero del loop, sin
  // salto perceptible.
  const camaraFinIntro = estadoCamara(0, anticipacionInicio.foco, focoCentroPx, factorSeguimiento);
  const frameIntro = estadoEnFraccion(datos, distanciaAcumuladaKm, 0);

  function dibujarFondoIntro(camara: EstadoCamara, pesoZ17Intro: number) {
    const camaraZ17 = mapa && corredorTilesZ17.size > 0 ? calcularCamaraZ17(camara, mapa, factorSeguimiento) : null;
    dibujarCuadroVideo(
      ctx!,
      datos,
      mapaImg,
      mapaDetalladoImg,
      factorDetalle,
      x,
      y,
      focoCentroPx,
      frameIntro,
      0,
      config,
      false,
      camara,
      factorSeguimiento * ESCALA_SEGUIMIENTO,
      camaraZ17,
      // Intro (acercamiento panorámica -> Z17): fuera del alcance de esta
      // corrección -- se preserva camara.escala tal cual, comportamiento
      // idéntico al de antes de esta ronda, sin tocar.
      camara.escala,
      // Sin huecos posibles antes de que arranque el trazo real.
      false,
      camaraZ17 !== null ? pesoZ17Intro : null,
      0,
      suavizadoEtiquetas,
      tilesZ17Residentes,
      true,
      refDiagnosticoFondo,
      refDiagnosticoFrame,
      clasificacionTramos,
    );
  }

  // Primer cuadro dibujado ANTES de arrancar a grabar (panorámica quieta),
  // para no capturar un instante en blanco.
  dibujarFondoIntro(camaraPanoramicaIntro, 0);

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
  // Instrumentación (ver criterio de éxito #2 y #3 del diseño Fase A/Fase B
  // aprobado): tiempo real total desde que arranca MediaRecorder hasta que
  // termina de capturar -- se fija recién después de mediaRecorder.start()
  // más abajo, pero el closure de onstop lo lee al vuelo (let, no const).
  let tInicioGrabacionMs = 0;
  const grabacionLista = new Promise<Blob>((resolve, reject) => {
    mediaRecorder.onstop = () => {
      const tCapturaMs = performance.now() - tInicioGrabacionMs;
      console.log(`[fase-b] MediaRecorder start() -> stop() = ${(tCapturaMs / 1000).toFixed(2)}s`);
      resolve(new Blob(chunks, { type: "video/webm" }));
    };
    mediaRecorder.onerror = () => reject(new Error("Falló la grabación del video."));
  });

  mediaRecorder.start();
  tInicioGrabacionMs = performance.now();

  const intervaloMs = 1000 / fps;

  // Pausa quieta en la panorámica -- le da tiempo al ojo de ubicar el
  // recorrido completo antes de que la cámara empiece a moverse.
  dibujarFondoIntro(camaraPanoramicaIntro, 0);
  await new Promise((r) => setTimeout(r, DURACION_PAUSA_INTRO_SEG * 1000));

  if (nombreUsuario && nombreUsuario.trim()) {
    const nombreLimpio = nombreUsuario.trim();
    dibujarFondoIntro(camaraPanoramicaIntro, 0);
    dibujarOverlayIntro(ctx, avatarImg, nombreLimpio, 1);
    await new Promise((r) => setTimeout(r, duracionIntroSeg * 1000));

    // Desvanecido gradual hacia la panorámica limpia (el mismo cuadro de
    // intro ya dibujado abajo) en vez de cortar de golpe de la portada.
    const framesFundido = Math.max(1, Math.round(FUNDIDO_INTRO_SEG * fps));
    for (let i = 1; i <= framesFundido; i++) {
      dibujarFondoIntro(camaraPanoramicaIntro, 0);
      dibujarOverlayIntro(ctx, avatarImg, nombreLimpio, 1 - i / framesFundido);
      await new Promise((r) => setTimeout(r, intervaloMs));
    }
  }

  // Acercamiento progresivo: interpola cámara (panorámica -> cercana) y hace
  // crossfade del fondo (panorámica -> primer mosaico) al mismo tiempo, con
  // la misma curva de suavizado (suavizar()) que ya usa el alejamiento del
  // outro. El último cuadro coincide EXACTO con camaraFinIntro -- misma
  // fórmula que el primer cuadro real del loop de abajo (ver su comentario
  // más arriba), así que no hay salto entre el fin del intro y el arranque
  // del seguimiento.
  const framesAcercamiento = Math.max(1, Math.round(DURACION_ACERCAMIENTO_INTRO_SEG * fps));
  for (let i = 1; i <= framesAcercamiento; i++) {
    const t = suavizar(i / framesAcercamiento);
    const camaraPaso: EstadoCamara = {
      cx: camaraPanoramicaIntro.cx + (camaraFinIntro.cx - camaraPanoramicaIntro.cx) * t,
      cy: camaraPanoramicaIntro.cy + (camaraFinIntro.cy - camaraPanoramicaIntro.cy) * t,
      escala: camaraPanoramicaIntro.escala + (camaraFinIntro.escala - camaraPanoramicaIntro.escala) * t,
    };
    dibujarFondoIntro(camaraPaso, t);
    await new Promise((r) => setTimeout(r, intervaloMs));
  }

  const totalFrames = Math.round(duracionAnimSeg * fps);
  let pausaVelMaxHecha = false;
  // Diagnóstico temporal (investigación de por qué un video a 30fps termina
  // con ~80% de cuadros duplicados, ver PROGRESS.md/sesión de diagnóstico):
  // mide, con reloj real (performance.now(), no fraccionTotal), cuánto
  // tarda CADA vuelta del loop -- si tarda bien por encima de intervaloMs
  // (=1000/fps), esta iteración concreta bloqueó el hilo principal (o
  // esperó algo) más de lo que el video "cree" que pasó, mientras
  // canvas.captureStream(fps) sigue muestreando el canvas a reloj real por
  // su cuenta -- exactamente el mecanismo que produciría cuadros
  // duplicados sin que fraccionTotal lo refleje. tiempoInicioLoopMs es el
  // reloj real desde que arranca ESTE loop (no toda la generación), así
  // tiempoVideoMs se puede comparar directo contra duracionAnimSeg*1000.
  const tiempoInicioLoopMs = performance.now();
  let tiempoFrameAnteriorMs = tiempoInicioLoopMs;
  const INTERVALO_LOG_RENDER_DIAG_FRAMES = 15; // ~2 veces por segundo a 30fps
  const UMBRAL_STALL_MS = intervaloMs + 50;
  for (let f = 0; f <= totalFrames; f++) {
    const fraccionTotal = f / totalFrames;
    const tiempoAntesMs = performance.now();
    const deltaDesdeAnteriorMs = tiempoAntesMs - tiempoFrameAnteriorMs;
    const esStall = deltaDesdeAnteriorMs > UMBRAL_STALL_MS;
    dibujarFrame(fraccionTotal, false);
    onProgreso?.(fraccionTotal);
    const diag = refDiagnosticoFrame.valor;
    if (f % INTERVALO_LOG_RENDER_DIAG_FRAMES === 0 || esStall) {
      (esStall ? console.warn : console.log)(
        `${esStall ? "[render-diag] *** STALL, la iteración anterior tardó más de lo esperado ***" : "[render-diag]"} ` +
          `frame=${f}/${totalFrames} tiempoVideoMs=${(tiempoAntesMs - tiempoInicioLoopMs).toFixed(0)} tAbsMs=${tiempoAntesMs.toFixed(0)} fraccionTotal=${fraccionTotal.toFixed(4)} ` +
          `deltaDesdeAnteriorMs=${deltaDesdeAnteriorMs.toFixed(1)} (esperado=${intervaloMs.toFixed(1)}) ` +
          `indiceBase=${diag?.indiceBase ?? "?"} lat=${diag?.lat?.toFixed(6) ?? "?"} lon=${diag?.lon?.toFixed(6) ?? "?"} ` +
          `camara.cx=${diag?.camaraCx?.toFixed(1) ?? "?"} camara.cy=${diag?.camaraCy?.toFixed(1) ?? "?"} camara.escala=${diag?.camaraEscala?.toFixed(4) ?? "?"} ` +
          `tiempoFondoMs=${diag?.tiempoFondoMs?.toFixed(2) ?? "?"} tiempoDrawTilesMs=${diag?.tiempoDrawTilesMs?.toFixed(2) ?? "?"} ` +
          `camaraZ17=(${diag?.camaraZ17X?.toFixed(1) ?? "?"},${diag?.camaraZ17Y?.toFixed(1) ?? "?"}) escalaCrop=${diag?.escalaCropSeguimiento?.toFixed(4) ?? "?"} ` +
          `tilesVisibles=${diag?.tilesVisibles ?? "?"} tilesFaltantes=${diag?.tilesFaltantes ?? "?"} ` +
          `fondo=${diag?.descriptorFondo ?? "?"}`,
      );
    }

    // [tile-z17-frame]: instrumentación exacta pedida en el diseño aprobado
    // para el prototipo de tiles Z17 -- la línea informativa se loguea cada
    // vez que dibujarTilesZ17 tarda más de 10ms (aislado de cualquier otra
    // cosa que pase ese cuadro), y la de *** STALL *** cuando la vuelta
    // COMPLETA del loop (dibujarFrame + espera anterior) se pasó del
    // intervalo esperado por más de 20ms -- pueden darse las dos en el
    // mismo cuadro, son chequeos independientes.
    const drawTilesMs = diag?.tiempoDrawTilesMs ?? null;
    if (drawTilesMs !== null && drawTilesMs > 10) {
      console.log(
        `[tile-z17-frame] frame=${f} tilesVisibles=${diag?.tilesVisibles ?? "?"} drawTilesMs=${drawTilesMs.toFixed(1)} ` +
          `camaraZ17=(${diag?.camaraZ17X?.toFixed(1) ?? "?"},${diag?.camaraZ17Y?.toFixed(1) ?? "?"}) escalaCrop=${diag?.escalaCropSeguimiento?.toFixed(4) ?? "?"}`,
      );
    }
    if (deltaDesdeAnteriorMs > intervaloMs + 20) {
      console.warn(
        `[tile-z17-frame] *** STALL *** frame=${f} totalFrameMs=${deltaDesdeAnteriorMs.toFixed(1)} drawTilesMs=${drawTilesMs?.toFixed(1) ?? "?"}`,
      );
    }

    tiempoFrameAnteriorMs = tiempoAntesMs;
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

  // Instrumentación (ver criterio de éxito #3 del diseño Fase A/Fase B
  // aprobado): compara el tiempo REAL que tardó este loop contra su
  // duración lógica nominal (duracionAnimSeg) -- con Fase A ya habiendo
  // preparado todo de antemano, dibujarFrame() en este loop no debería
  // hacer fetch/toDataURL/decode/espera de ningún tipo, así que esta
  // diferencia debería quedar cerca de 0 (a diferencia de los ~187s reales
  // medidos para un video de ~11s lógicos antes de este cambio).
  const tiempoLoopRealMs = performance.now() - tiempoInicioLoopMs;
  console.log(
    `[fase-b] loop de seguimiento terminado -- tiempoRealMs=${tiempoLoopRealMs.toFixed(0)} ` +
      `duracionNominalMs=${(duracionAnimSeg * 1000).toFixed(0)} diferencia=${(tiempoLoopRealMs - duracionAnimSeg * 1000).toFixed(0)}ms`,
  );

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

