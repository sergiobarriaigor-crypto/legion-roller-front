"use client";

// DIAGNÓSTICO TEMPORAL -- V2 Fase 1 (solo motor cartográfico). Página
// aislada, sin link desde ninguna navegación real, para validar
// visualmente que la grilla ancha y la grilla Z17 (tiles híbridos
// satélite+etiquetas) representan el MISMO lugar sin desplazamiento
// geográfico. No toca V1 (tarjetaRecorrido.ts) ni CompartirRecorridoModal
// en absoluto -- import exclusivo de lib/video2dV2/*.

import { useRef, useState } from "react";
import { lonAPixelX, latAPixelY, TAM_TILE, type PuntoLonLat } from "@/lib/video2dV2/proyeccion";
import { elegirGrillaAncha } from "@/lib/video2dV2/grillaAncha";
import { prepararTilesHibridos, crearContadoresTilesHibridos } from "@/lib/video2dV2/tilesHibridos";
import { dibujarTilesHibridos, rangoTilesVisibles } from "@/lib/video2dV2/renderV2";

// Ruta de prueba estática (misma zona que otros diagnósticos de esta sesión,
// Puerto Montt) -- no viene de datos reales de usuario, es solo geometría
// fija para poder probar elegirGrillaAncha/tilesHibridos de forma aislada.
const RUTA_PRUEBA: PuntoLonLat[] = [
  { lon: -72.9407, lat: -41.4707 },
  { lon: -72.9395, lat: -41.4688 },
  { lon: -72.9378, lat: -41.4665 },
  { lon: -72.9362, lat: -41.4649 },
  { lon: -72.9401, lat: -41.4721 },
  { lon: -72.9422, lat: -41.4739 },
  { lon: -72.9438, lat: -41.4752 },
  { lon: -72.9355, lat: -41.4631 },
  { lon: -72.9340, lat: -41.4612 },
  { lon: -72.9452, lat: -41.4768 },
];

const ZOOM_SEGUIMIENTO = 17;
const ANCHO_CANVAS = 360;
const ALTO_CANVAS = 640;
const CONCURRENCIA = 6;

export default function DebugVideoV2Page() {
  const canvasAnchaRef = useRef<HTMLCanvasElement | null>(null);
  const canvasZ17Ref = useRef<HTMLCanvasElement | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [corriendo, setCorriendo] = useState(false);

  function log(linea: string) {
    console.log(linea);
    setLogs((prev) => [...prev, linea]);
  }

  function dibujarCruz(ctx: CanvasRenderingContext2D) {
    ctx.strokeStyle = "#ff2d2d";
    ctx.lineWidth = 2;
    const cx = ANCHO_CANVAS / 2;
    const cy = ALTO_CANVAS / 2;
    ctx.beginPath();
    ctx.moveTo(cx - 16, cy);
    ctx.lineTo(cx + 16, cy);
    ctx.moveTo(cx, cy - 16);
    ctx.lineTo(cx, cy + 16);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, 16, 0, Math.PI * 2);
    ctx.stroke();
  }

  async function correrPrueba() {
    const canvasAncha = canvasAnchaRef.current;
    const canvasZ17 = canvasZ17Ref.current;
    if (!canvasAncha || !canvasZ17) return;
    const ctxAncha = canvasAncha.getContext("2d");
    const ctxZ17 = canvasZ17.getContext("2d");
    if (!ctxAncha || !ctxZ17) return;
    canvasAncha.width = ANCHO_CANVAS;
    canvasAncha.height = ALTO_CANVAS;
    canvasZ17.width = ANCHO_CANVAS;
    canvasZ17.height = ALTO_CANVAS;

    setLogs([]);
    setCorriendo(true);

    // Punto objetivo: el primer punto de la ruta -- se centra la cámara en
    // AMBAS grillas exactamente en este mismo lon/lat, para que la cruz roja
    // del centro marque el mismo lugar real en las dos imágenes.
    const objetivo = RUTA_PRUEBA[0];

    const tInicioTotal = performance.now();

    // --- Grilla ancha ---
    const tInicioAncha = performance.now();
    const grillaAncha = elegirGrillaAncha(RUTA_PRUEBA);
    const contadoresAncha = crearContadoresTilesHibridos();
    const tilesAncha = await prepararTilesHibridos(grillaAncha.claves, grillaAncha.zoom, CONCURRENCIA, contadoresAncha);
    const tAnchaMs = performance.now() - tInicioAncha;

    const camaraAncha = {
      x: lonAPixelX(objetivo.lon, grillaAncha.zoom),
      y: latAPixelY(objetivo.lat, grillaAncha.zoom),
    };
    const resultadoAncha = dibujarTilesHibridos(ctxAncha, tilesAncha, camaraAncha, 1, ANCHO_CANVAS, ALTO_CANVAS);
    dibujarCruz(ctxAncha);

    // --- Grilla Z17 ---
    const camaraZ17 = {
      x: lonAPixelX(objetivo.lon, ZOOM_SEGUIMIENTO),
      y: latAPixelY(objetivo.lat, ZOOM_SEGUIMIENTO),
    };
    const rangoZ17 = rangoTilesVisibles(camaraZ17, 1, ANCHO_CANVAS, ALTO_CANVAS);
    const clavesZ17 = new Set<string>();
    for (let ty = rangoZ17.tileYMin; ty <= rangoZ17.tileYMax; ty++) {
      for (let tx = rangoZ17.tileXMin; tx <= rangoZ17.tileXMax; tx++) clavesZ17.add(`${tx}/${ty}`);
    }
    const tInicioZ17 = performance.now();
    const contadoresZ17 = crearContadoresTilesHibridos();
    const tilesZ17 = await prepararTilesHibridos(clavesZ17, ZOOM_SEGUIMIENTO, CONCURRENCIA, contadoresZ17);
    const tZ17Ms = performance.now() - tInicioZ17;

    const resultadoZ17 = dibujarTilesHibridos(ctxZ17, tilesZ17, camaraZ17, 1, ANCHO_CANVAS, ALTO_CANVAS);
    dibujarCruz(ctxZ17);

    const tTotalMs = performance.now() - tInicioTotal;

    const bytesPorTile = TAM_TILE * TAM_TILE * 4;
    const memoriaAnchaMB = (tilesAncha.size * bytesPorTile) / 1_048_576;
    const memoriaZ17MB = (tilesZ17.size * bytesPorTile) / 1_048_576;

    log(`[v2-tiles] zoomAncho=${grillaAncha.zoom}`);
    log(
      `[v2-tiles] grillaAncha -- tilesPlanificados=${grillaAncha.claves.size} tilesPreparados=${tilesAncha.size} ` +
        `memoriaEstimadaMB=${memoriaAnchaMB.toFixed(2)} tiempoPreparacionMs=${tAnchaMs.toFixed(1)} ` +
        `tilesVisibles=${resultadoAncha.tilesVisibles} tilesFaltantes=${resultadoAncha.tilesFaltantes} ` +
        `fetch(sat/etq)=${contadoresAncha.fetchSatelite}/${contadoresAncha.fetchEtiquetas} ` +
        `fallos(sat/etq)=${contadoresAncha.falloSatelite}/${contadoresAncha.falloEtiquetas}`,
    );
    log(
      `[v2-tiles] grillaZ17 -- tilesPlanificados=${clavesZ17.size} tilesPreparados=${tilesZ17.size} ` +
        `memoriaEstimadaMB=${memoriaZ17MB.toFixed(2)} tiempoPreparacionMs=${tZ17Ms.toFixed(1)} ` +
        `tilesVisibles=${resultadoZ17.tilesVisibles} tilesFaltantes=${resultadoZ17.tilesFaltantes} ` +
        `fetch(sat/etq)=${contadoresZ17.fetchSatelite}/${contadoresZ17.fetchEtiquetas} ` +
        `fallos(sat/etq)=${contadoresZ17.falloSatelite}/${contadoresZ17.falloEtiquetas}`,
    );
    log(
      `[v2-tiles] total -- memoriaEstimadaMB=${(memoriaAnchaMB + memoriaZ17MB).toFixed(2)} tiempoTotalMs=${tTotalMs.toFixed(1)}`,
    );
    log(`[v2-tiles] objetivo lon=${objetivo.lon} lat=${objetivo.lat} -- la cruz roja debe marcar el MISMO lugar en ambas imágenes`);

    setCorriendo(false);
  }

  return (
    <div style={{ padding: 16, fontFamily: "monospace", color: "#eee", background: "#111", minHeight: "100vh" }}>
      <h1 style={{ fontSize: 16 }}>V2 Fase 1: grilla ancha vs grilla Z17 (tiles híbridos)</h1>
      <p style={{ fontSize: 12, opacity: 0.8 }}>
        Diagnóstico temporal -- no toca V1 ni CompartirRecorridoModal. Ambos canvas centran la cámara en el MISMO
        lon/lat (primer punto de la ruta de prueba) -- la cruz roja debe marcar el mismo lugar real en las dos
        imágenes, sin desplazamiento geográfico.
      </p>
      <button onClick={correrPrueba} disabled={corriendo} style={{ padding: "8px 16px", fontSize: 14, marginBottom: 12 }}>
        {corriendo ? "Corriendo..." : "Preparar y dibujar"}
      </button>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <div>
          <p style={{ fontSize: 12, marginBottom: 4 }}>Grilla ancha</p>
          <canvas ref={canvasAnchaRef} style={{ width: 180, height: 320, border: "1px solid #555" }} />
        </div>
        <div>
          <p style={{ fontSize: 12, marginBottom: 4 }}>Grilla Z17</p>
          <canvas ref={canvasZ17Ref} style={{ width: 180, height: 320, border: "1px solid #555" }} />
        </div>
      </div>
      <pre style={{ fontSize: 11, whiteSpace: "pre-wrap", marginTop: 12 }}>{logs.join("\n")}</pre>
    </div>
  );
}
