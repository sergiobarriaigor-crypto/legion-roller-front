// V2 -- Fase 1 (motor cartográfico): tiles híbridos satélite+etiquetas.
//
// Mismos dos servicios Esri que ya usa V1 (tarjetaRecorrido.ts) y el mapa en
// vivo (MapaView.tsx) -- World_Imagery (foto) + Reference/World_Boundaries_
// and_Places (calles/nombres, transparente), sin API key. Acá se componen
// EN UN SOLO ImageBitmap por tile (no dos bitmaps separados) -- la memoria
// residente por tile sigue siendo la de un tile 256x256 (~0.25MB), lo
// híbrido cuesta una petición de red y una composición de canvas extra por
// tile durante la preparación, no memoria extra en el render.
export const TILE_SATELITE_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
export const TILE_ETIQUETAS_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}";

const TAM_TILE = 256;
const TIMEOUT_TILE_MS = 8000;

export function urlTile(plantilla: string, zoom: number, x: number, y: number): string {
  return plantilla.replace("{z}", String(zoom)).replace("{y}", String(y)).replace("{x}", String(x));
}

async function fetchConTimeout(url: string): Promise<Response | null> {
  const controlador = new AbortController();
  const idTimeout = setTimeout(() => controlador.abort(), TIMEOUT_TILE_MS);
  try {
    const res = await fetch(url, { signal: controlador.signal });
    return res.ok ? res : null;
  } catch {
    return null;
  } finally {
    clearTimeout(idTimeout);
  }
}

async function decodificarBlobComoBitmap(res: Response): Promise<ImageBitmap | null> {
  try {
    const blob = await res.blob();
    return await createImageBitmap(blob);
  } catch {
    return null;
  }
}

export interface ContadoresTilesHibridos {
  fetchSatelite: number;
  fetchEtiquetas: number;
  falloSatelite: number;
  falloEtiquetas: number;
}

export function crearContadoresTilesHibridos(): ContadoresTilesHibridos {
  return { fetchSatelite: 0, fetchEtiquetas: 0, falloSatelite: 0, falloEtiquetas: 0 };
}

// Descarga y decodifica AMBAS capas en paralelo para un mismo tile
// {zoom,x,y}, las compone en un canvas offscreen (satélite primero,
// etiquetas encima -- mismo orden que ya usa generarMapaEnZoom en V1) y
// devuelve UN solo ImageBitmap ya compuesto. Si falla el satélite, el tile
// entero es null (no hay nada que mostrar). Si falla solo la capa de
// etiquetas, se compone igual con satélite solo -- las etiquetas son un
// agregado visual, no la base.
export async function cargarTileHibrido(
  zoom: number,
  tx: number,
  ty: number,
  contadores?: ContadoresTilesHibridos,
): Promise<ImageBitmap | null> {
  const urlSat = urlTile(TILE_SATELITE_URL, zoom, tx, ty);
  const urlEtq = urlTile(TILE_ETIQUETAS_URL, zoom, tx, ty);

  if (contadores) {
    contadores.fetchSatelite++;
    contadores.fetchEtiquetas++;
  }

  const [resSat, resEtq] = await Promise.all([fetchConTimeout(urlSat), fetchConTimeout(urlEtq)]);

  if (!resSat) {
    if (contadores) contadores.falloSatelite++;
    return null;
  }
  const [bitmapSat, bitmapEtq] = await Promise.all([
    decodificarBlobComoBitmap(resSat),
    resEtq ? decodificarBlobComoBitmap(resEtq) : Promise.resolve(null),
  ]);
  if (!bitmapSat) {
    if (contadores) contadores.falloSatelite++;
    return null;
  }
  if (!bitmapEtq && contadores) contadores.falloEtiquetas++;

  const canvas = document.createElement("canvas");
  canvas.width = TAM_TILE;
  canvas.height = TAM_TILE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return bitmapSat;
  ctx.drawImage(bitmapSat, 0, 0);
  if (bitmapEtq) ctx.drawImage(bitmapEtq, 0, 0);
  bitmapSat.close();
  bitmapEtq?.close();
  return createImageBitmap(canvas);
}

// Descarga/compone un conjunto de tiles (identificados "tx/ty") con
// concurrencia acotada -- mismo patrón worker-pool que prepararSegmentoTilesZ17
// en V1. Uso genérico: sirve tanto para la grilla ancha como para Z17,
// parametrizado por `zoom`.
export async function prepararTilesHibridos(
  claves: Set<string>,
  zoom: number,
  concurrencia: number,
  contadores?: ContadoresTilesHibridos,
): Promise<Map<string, ImageBitmap>> {
  const lista = [...claves];
  const residentes = new Map<string, ImageBitmap>();
  let siguiente = 0;

  async function trabajador(): Promise<void> {
    while (siguiente < lista.length) {
      const clave = lista[siguiente++];
      const [txStr, tyStr] = clave.split("/");
      const bitmap = await cargarTileHibrido(zoom, Number(txStr), Number(tyStr), contadores);
      if (bitmap) residentes.set(clave, bitmap);
    }
  }

  const trabajadores = Array.from({ length: Math.min(concurrencia, Math.max(lista.length, 1)) }, () => trabajador());
  await Promise.all(trabajadores);
  return residentes;
}
