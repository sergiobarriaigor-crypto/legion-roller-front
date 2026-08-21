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
const OBJETIVO_TILES_ANCHO = 24;
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
): { tileXMin: number; tileXMax: number; tileYMin: number; tileYMax: number } {
  const x0 = lonAPixelX(minLon, zoom);
  const x1 = lonAPixelX(maxLon, zoom);
  const y0 = latAPixelY(maxLat, zoom); // maxLat -> menor y (arriba de la imagen)
  const y1 = latAPixelY(minLat, zoom);
  const margenPx = Math.max(x1 - x0, y1 - y0) * MARGEN_FRACCION;
  return {
    tileXMin: Math.floor((x0 - margenPx) / TAM_TILE),
    tileXMax: Math.floor((x1 + margenPx) / TAM_TILE),
    tileYMin: Math.floor((y0 - margenPx) / TAM_TILE),
    tileYMax: Math.floor((y1 + margenPx) / TAM_TILE),
  };
}

export function elegirGrillaAncha(puntos: PuntoLonLat[]): GrillaAnchaResultado {
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

  let mejorResultado: GrillaAnchaResultado | null = null;
  for (let zoom = ZOOM_ANCHO_MAX; zoom >= ZOOM_ANCHO_MIN; zoom--) {
    const rango = calcularRangoTiles(minLon, maxLon, minLat, maxLat, zoom);
    const nTiles = (rango.tileXMax - rango.tileXMin + 1) * (rango.tileYMax - rango.tileYMin + 1);
    mejorResultado = { zoom, claves: new Set(), ...rango };
    if (nTiles <= OBJETIVO_TILES_ANCHO) break;
  }
  // mejorResultado siempre queda asignado (el loop corre al menos una vez) --
  // si ni el zoom mínimo entra bajo el techo, se usa igual (mejor esfuerzo).
  const resultado = mejorResultado as GrillaAnchaResultado;
  for (let ty = resultado.tileYMin; ty <= resultado.tileYMax; ty++) {
    for (let tx = resultado.tileXMin; tx <= resultado.tileXMax; tx++) resultado.claves.add(`${tx}/${ty}`);
  }
  return resultado;
}
