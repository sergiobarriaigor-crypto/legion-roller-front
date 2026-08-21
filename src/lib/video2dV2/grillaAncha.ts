// V2 -- Fase 1: elige un zoom "ancho" (bajo, distinto de ZOOM_SEGUIMIENTO=17)
// tal que la ruta completa entre en pocos tiles -- mismo criterio que
// elegirZoom() de V1 (probar del zoom más detallado al más alejado, quedarse
// con el primero que entra), pero contando TILES en vez de dimensiones de
// canvas, porque acá el resultado son tiles individuales a componer con
// tilesHibridos.ts, no un PNG grande pre-compuesto.
import { lonAPixelX, latAPixelY, TAM_TILE, type PuntoLonLat } from "./proyeccion";

// Techo de tiles de la grilla ancha -- generosamente chico a propósito: la
// idea es que esta grilla cubra la ruta COMPLETA con memoria despreciable
// (unos pocos MB) y quede residente toda la generación, sin necesidad de
// segmentarla. Si una ruta necesitara más para este techo, se sigue
// bajando el zoom (menos detalle, pero la ruta entera sigue entrando).
const OBJETIVO_TILES_ANCHO = 96;
const ZOOM_ANCHO_MIN = 2;
const ZOOM_ANCHO_MAX = 16; // nunca 17 -- no debe solaparse con la grilla Z17
const MARGEN_FRACCION = 0.15; // aire alrededor del bbox, no pegado a los bordes

export interface GrillaAnchaResultado {
  zoom: number;
  claves: Set<string>; // "tx/ty"
  tileXMin: number;
  tileXMax: number;
  tileYMin: number;
  tileYMax: number;
}

function calcularRangoTiles(
  minLon: number,
  maxLon: number,
  minLat: number,
  maxLat: number,
  zoom: number,
  aspectoVideo: number,
): { tileXMin: number; tileXMax: number; tileYMin: number; tileYMax: number } {
  const x0 = lonAPixelX(minLon, zoom);
  const x1 = lonAPixelX(maxLon, zoom);
  const y0 = latAPixelY(maxLat, zoom); // maxLat -> menor y (arriba de la imagen)
  const y1 = latAPixelY(minLat, zoom);
  const margenPx = Math.max(x1 - x0, y1 - y0) * MARGEN_FRACCION;
  let anchoPx = x1 - x0 + margenPx * 2;
  let altoPx = y1 - y0 + margenPx * 2;
  const centroX = (x0 + x1) / 2;
  const centroY = (y0 + y1) / 2;
  // Expandir el rango al aspecto real del video (ANCHO_VIDEO/ALTO_VIDEO) --
  // sin esto, cuando el aspecto del bbox de la ruta no coincide con el del
  // video, la dimensión "sobrante" (la que NO limita la escala que hace
  // entrar todo el bbox) termina necesitando más tiles de los que este
  // rango alcanzó a cubrir -- eso es exactamente lo que causaba tiles
  // faltantes en la panorámica inicial/final.
  if (anchoPx / altoPx < aspectoVideo) anchoPx = altoPx * aspectoVideo;
  else altoPx = anchoPx / aspectoVideo;
  return {
    tileXMin: Math.floor((centroX - anchoPx / 2) / TAM_TILE),
    tileXMax: Math.floor((centroX + anchoPx / 2) / TAM_TILE),
    tileYMin: Math.floor((centroY - altoPx / 2) / TAM_TILE),
    tileYMax: Math.floor((centroY + altoPx / 2) / TAM_TILE),
  };
}

export function elegirGrillaAncha(puntos: PuntoLonLat[], anchoVideoPx: number, altoVideoPx: number): GrillaAnchaResultado {
  const aspectoVideo = anchoVideoPx / altoVideoPx;
  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const p of puntos) {
    if (p.lon < minLon) minLon = p.lon;
    if (p.lon > maxLon) maxLon = p.lon;
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
  }

  // Barrido ASCENDENTE (del zoom más alejado al más detallado): tanto
  // nTiles como anchoWidePx crecen monótonamente con el zoom para un mismo
  // recorrido (más detalle = más píxeles = más tiles para cubrir la misma
  // extensión geográfica), así que el PRIMER zoom (el más bajo, el más
  // barato) que ya cubre el ancho/alto del video es automáticamente el más
  // chico posible que lo logra -- a diferencia de un barrido descendente,
  // que puede "pasarse" de largo y aterrizar en un zoom que sobra-cubre el
  // video por un margen grande (eso fue exactamente el bug real: barriendo
  // de detallado a alejado, el primer zoom que entraba bajo el techo de
  // tiles resultaba con anchoWidePx muy por encima del video, dejando
  // escalaCropAnchaQueEntra << 1 y por lo tanto el "encuadre de toda la
  // ruta" pedía MÁS área geográfica de la que esa grilla ancha realmente
  // tenía preparada -- de ahí los tiles faltantes en la panorámica).
  let mejorResultado: GrillaAnchaResultado | null = null;
  for (let zoom = ZOOM_ANCHO_MIN; zoom <= ZOOM_ANCHO_MAX; zoom++) {
    const rango = calcularRangoTiles(minLon, maxLon, minLat, maxLat, zoom, aspectoVideo);
    const nTiles = (rango.tileXMax - rango.tileXMin + 1) * (rango.tileYMax - rango.tileYMin + 1);
    const anchoWidePx = (rango.tileXMax - rango.tileXMin + 1) * TAM_TILE;
    mejorResultado = { zoom, claves: new Set(), ...rango };
    // anchoWidePx >= anchoVideoPx garantiza escalaCropAnchaQueEntra <= 1
    // (sin bleed de Z17 en la panorámica); nTiles <= OBJETIVO queda como
    // resguardo -- en la práctica, en el zoom donde recién se cumple la
    // primera condición, nTiles ya es "un video de tiles" (chico), nunca
    // el techo real.
    if (anchoWidePx >= anchoVideoPx && nTiles <= OBJETIVO_TILES_ANCHO) break;
  }
  // mejorResultado siempre queda asignado (el loop corre al menos una vez) --
  // si ni el zoom máximo alcanza a cubrir el video bajo el techo de tiles
  // (ruta patológicamente grande), se usa igual el último candidato
  // (mejor esfuerzo, con posible bleed residual).
  const resultado = mejorResultado as GrillaAnchaResultado;
  for (let ty = resultado.tileYMin; ty <= resultado.tileYMax; ty++) {
    for (let tx = resultado.tileXMin; tx <= resultado.tileXMax; tx++) resultado.claves.add(`${tx}/${ty}`);
  }
  return resultado;
}
