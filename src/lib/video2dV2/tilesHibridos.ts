// V2 -- Fase 1 (motor cartográfico): tiles híbridos satélite+etiquetas.
//
// World_Imagery (foto, mismo servicio que ya usa V1/MapaView.tsx) + una
// capa de etiquetas, sin API key. Acá se componen EN UN SOLO ImageBitmap
// por tile (no dos bitmaps separados) -- la memoria residente por tile
// sigue siendo la de un tile 256x256 (~0.25MB), lo híbrido cuesta una
// petición de red y una composición de canvas extra por tile durante la
// preparación, no memoria extra en el render.
export const TILE_SATELITE_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

// Fuente de la capa de etiquetas -- ABSTRAÍDA en esta única constante a
// propósito: cualquier reemplazo futuro es un cambio de una sola línea acá,
// sin tocar cargarTileHibrido/prepararTilesHibridos ni ningún otro archivo.
//
// Se probó primero Reference/World_Boundaries_and_Places (nombres de
// lugares/límites administrativos) -- confirmado con fetch real que
// devuelve tiles vacíos (0 píxeles no transparentes) en Z13-Z17 en Puerto
// Montt: es una capa de escala regional, nunca iba a tener calles a este
// nivel de detalle.
//
// Reference/World_Transportation sí tiene contenido real verificado en
// Z15/Z16/Z17 en Puerto Montt (confirmado con fetch + conteo de píxeles +
// inspección visual: nombres de calle legibles como "Calle Gallardo",
// "Calle Bernardo O'Higgins"). Esta ruta de prueba corta en particular
// (zona menos densa) tiene cobertura dispareja -- 2 de 9 tiles Z17 con
// contenido, el resto vacíos -- pero eso es la geografía real de esa zona
// puntual, no una falla de la capa (confirmado con zonas más urbanas).
//
// Esri cataloga World_Transportation como servicio "mature/legacy" con
// retiro planeado para 2028 -- si eso ocurre, reemplazar SOLO esta
// constante por la fuente que corresponda en ese momento.
export const TILE_ETIQUETAS_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}";

const TAM_TILE = 256;
const TIMEOUT_TILE_MS = 8000;

// Refuerzo de legibilidad SOLO para el zoom de seguimiento cercano (Z17,
// mismo valor que ZOOM_SEGUIMIENTO en camaraV2.ts -- reimplementado acá
// como constante local a propósito, mismo criterio que el resto del
// proyecto, para no cruzar un import hacia camaraV2.ts desde este archivo
// puramente de tiles). Diagnóstico real (fetch + análisis de píxeles de
// tiles Z17 con contenido): World_Transportation ya se compone casi
// opaco (alpha~230-255 en su núcleo) -- el problema de legibilidad en
// Z17 es de CONTRASTE de color (trazo oscuro sobre foto satelital),
// no de opacidad. Un halo claro detrás del trazo (drop-shadow, que usa
// el alfa del propio bitmap) lo resuelve sin tocar posición, geometría
// ni fuente de las etiquetas. Valor elegido tras comparar 3 intensidades
// sobre tiles reales exigentes (calles sobre techos/asfalto oscuros y
// sobre vegetación densa): 3px/alpha 0.55 ya despega el texto del fondo
// oscuro sin generar un brillo blanco visible en calles sobre fondos
// claros (a diferencia de una versión más fuerte, descartada por eso).
// La grilla ancha/panorámica no lo necesitaba (ver diagnóstico) y queda
// sin cambios.
const ZOOM_SEGUIMIENTO_V2 = 17;
const HALO_ETIQUETAS_Z17 = "drop-shadow(0px 0px 3px rgba(255,255,255,0.55))";

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
  if (bitmapEtq) {
    if (zoom === ZOOM_SEGUIMIENTO_V2) {
      ctx.save();
      ctx.filter = HALO_ETIQUETAS_Z17;
      ctx.drawImage(bitmapEtq, 0, 0);
      ctx.restore();
    } else {
      ctx.drawImage(bitmapEtq, 0, 0);
    }
  }
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
