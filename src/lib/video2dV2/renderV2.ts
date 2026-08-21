// V2 -- Fase 1: renderer único de tiles híbridos, sirve tanto para la
// grilla ancha como para la grilla Z17 -- misma fórmula de pantalla ya
// demostrada algebraicamente en V1 (screen = mitad + escala×(gTile-camara)),
// generalizada acá para no depender de ninguna escala/zoom fijo.
import { TAM_TILE } from "./proyeccion";

export interface RangoTilesVisibles {
  tileXMin: number;
  tileXMax: number;
  tileYMin: number;
  tileYMax: number;
}

export function rangoTilesVisibles(
  camara: { x: number; y: number },
  escalaCrop: number,
  anchoVideo: number,
  altoVideo: number,
): RangoTilesVisibles {
  const anchoVentana = anchoVideo / escalaCrop;
  const altoVentana = altoVideo / escalaCrop;
  return {
    tileXMin: Math.floor((camara.x - anchoVentana / 2) / TAM_TILE),
    tileXMax: Math.floor((camara.x + anchoVentana / 2 - 1) / TAM_TILE),
    tileYMin: Math.floor((camara.y - altoVentana / 2) / TAM_TILE),
    tileYMax: Math.floor((camara.y + altoVentana / 2 - 1) / TAM_TILE),
  };
}

export interface ResultadoDibujoTilesV2 {
  tilesVisibles: number;
  tilesFaltantes: number;
}

// Si un tile visible no está en `tilesResidentes`: error de preparación
// (no dispara ninguna descarga acá, igual que dibujarTilesZ17 en V1) --
// placeholder sólido + tilesFaltantes++, para que quede visible en el
// diagnóstico.
export function dibujarTilesHibridos(
  ctx: CanvasRenderingContext2D,
  tilesResidentes: Map<string, ImageBitmap>,
  camara: { x: number; y: number },
  escalaCrop: number,
  anchoVideo: number,
  altoVideo: number,
  alphaGlobal = 1,
): ResultadoDibujoTilesV2 {
  const { tileXMin, tileXMax, tileYMin, tileYMax } = rangoTilesVisibles(camara, escalaCrop, anchoVideo, altoVideo);
  let tilesVisibles = 0;
  let tilesFaltantes = 0;
  ctx.globalAlpha = alphaGlobal;
  for (let ty = tileYMin; ty <= tileYMax; ty++) {
    for (let tx = tileXMin; tx <= tileXMax; tx++) {
      const pantallaX = anchoVideo / 2 + (tx * TAM_TILE - camara.x) * escalaCrop;
      const pantallaY = altoVideo / 2 + (ty * TAM_TILE - camara.y) * escalaCrop;
      const tam = TAM_TILE * escalaCrop;
      const tile = tilesResidentes.get(`${tx}/${ty}`);
      if (!tile) {
        tilesFaltantes++;
        ctx.fillStyle = "#1a1108";
        ctx.fillRect(pantallaX, pantallaY, tam, tam);
        continue;
      }
      if (escalaCrop === 1) {
        ctx.drawImage(tile, pantallaX, pantallaY);
      } else {
        ctx.drawImage(tile, 0, 0, TAM_TILE, TAM_TILE, pantallaX, pantallaY, tam, tam);
      }
      tilesVisibles++;
    }
  }
  ctx.globalAlpha = 1;
  return { tilesVisibles, tilesFaltantes };
}
