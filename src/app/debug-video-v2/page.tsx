"use client";

// DIAGNÓSTICO TEMPORAL -- V2 Fase 2: coreografía completa de cámara
// (panorámica inicial -> paneo -> acercamiento -> seguimiento -> alejamiento
// -> paneo final -> panorámica final), sin MediaRecorder/audio/segmentación
// real/huecos todavía. Página aislada, sin link desde ninguna navegación
// real -- no toca V1 ni CompartirRecorridoModal.

import { useRef, useState } from "react";
import type { PuntoGps } from "@/lib/geo";
import { elegirGrillaAncha } from "@/lib/video2dV2/grillaAncha";
import { prepararTilesHibridos, crearContadoresTilesHibridos } from "@/lib/video2dV2/tilesHibridos";
import { dibujarTilesHibridos } from "@/lib/video2dV2/renderV2";
import {
  ANCHO_VIDEO,
  ALTO_VIDEO,
  ZOOM_SEGUIMIENTO,
  calcularVentanaCrossfade,
  pesoZ17DesdeEscala,
  construirRutaCoreografiaV2,
  construirCorredorZ17V2,
  construirCoberturaGrillaAnchaV2,
  calcularDuracionSeguimientoV2,
  duracionTotalV2,
  calcularFaseYCamaraV2,
  crearEstadoRecursivoV2,
  pasoSeguimientoV2,
  type RutaCoreografiaV2,
  type VentanaCrossfade,
  type ParametrosCoreografiaV2,
  type EstadoRecursivoSeguimientoV2,
  type FaseV2,
  type EstadoCamaraV2,
} from "@/lib/video2dV2/camaraV2";

// Ruta de prueba más larga que la de Fase 1 (~11km, Puerto Montt) -- una
// ruta corta (~2km) hacía que la escala "ancha" necesaria para encuadrar
// toda la ruta cayera DENTRO de la ventana de crossfade (Z17 se filtraba en
// la panorámica inicial/final, ver diagnóstico real de esta ronda). Con más
// distancia real, hay margen de sobra entre la escala ancha y el umbral de
// nitidez -- PuntoGps requiere timestamp aunque acá no se use su valor en
// sí, solo espaciados crecientes.
// Ruta de prueba orientada N-S (con leve zigzag E-O) -- a diferencia de la
// ruta horizontal anterior, esta se parece en aspecto al video 9:16, así
// que elegirGrillaAncha no necesita inflar una dimensión para encuadrarla,
// y el corredor Z17 de inicio/fin no explota en cantidad de tiles.
const RUTA_PRUEBA: PuntoGps[] = [
  { lon: -72.905, lat: -41.47, timestamp: 0 },
  { lon: -72.903, lat: -41.4676, timestamp: 200000 },
  { lon: -72.902, lat: -41.465, timestamp: 400000 },
  { lon: -72.904, lat: -41.4626, timestamp: 600000 },
  { lon: -72.906, lat: -41.46, timestamp: 800000 },
  { lon: -72.905, lat: -41.4576, timestamp: 1000000 },
  { lon: -72.903, lat: -41.455, timestamp: 1200000 },
  { lon: -72.902, lat: -41.4526, timestamp: 1400000 },
  { lon: -72.904, lat: -41.45, timestamp: 1600000 },
  { lon: -72.906, lat: -41.4476, timestamp: 1800000 },
  { lon: -72.905, lat: -41.445, timestamp: 2000000 },
  { lon: -72.903, lat: -41.4426, timestamp: 2200000 },
  { lon: -72.902, lat: -41.44, timestamp: 2400000 },
  { lon: -72.904, lat: -41.4376, timestamp: 2600000 },
];

const CONCURRENCIA = 6;

function resimularEstadoCompleto(
  ruta: RutaCoreografiaV2,
  fraccionObjetivo: number,
  pasos: number,
): { estado: EstadoRecursivoSeguimientoV2; camara: EstadoCamaraV2 } {
  const estado = crearEstadoRecursivoV2();
  let camara: EstadoCamaraV2 = { cx: ruta.puntosZ17[0].x, cy: ruta.puntosZ17[0].y, escala: 0.6 };
  for (let i = 1; i <= pasos; i++) {
    camara = pasoSeguimientoV2(ruta, (fraccionObjetivo * i) / pasos, estado);
  }
  return { estado, camara };
}

export default function DebugVideoV2Page() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [preparando, setPreparando] = useState(false);
  const [reproduciendo, setReproduciendo] = useState(false);
  const [tiempoSeg, setTiempoSeg] = useState(0);
  const [faseActual, setFaseActual] = useState<FaseV2 | null>(null);

  const [duracionA, setDuracionA] = useState(0.8);
  const [duracionBC, setDuracionBC] = useState(3.2);
  const [duracionD, setDuracionD] = useState(0); // se autocompleta al preparar
  const [duracionEF, setDuracionEF] = useState(3.2);
  const [duracionG, setDuracionG] = useState(1.0);
  const [finPaneoFraccion, setFinPaneoFraccion] = useState(0.7);
  const [inicioZoomFraccion, setInicioZoomFraccion] = useState(0.55);
  const [velocidad, setVelocidad] = useState(1);

  const rutaRef = useRef<RutaCoreografiaV2 | null>(null);
  const ventanaRef = useRef<VentanaCrossfade | null>(null);
  const tilesAnchaRef = useRef<Map<string, ImageBitmap>>(new Map());
  const tilesZ17Ref = useRef<Map<string, ImageBitmap>>(new Map());
  const zoomAnchoRef = useRef(0);
  const estadoSeguimientoRef = useRef<EstadoRecursivoSeguimientoV2>(crearEstadoRecursivoV2());
  const ultimaFaseRef = useRef<FaseV2 | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const ultimoTickMsRef = useRef(0);

  function log(linea: string) {
    console.log(linea);
    setLogs((prev) => [...prev.slice(-60), linea]);
  }

  function parametros(): ParametrosCoreografiaV2 {
    return {
      duracionPanoramicaInicialSeg: duracionA,
      duracionPaneoAcercamientoSeg: duracionBC,
      duracionSeguimientoSeg: duracionD,
      duracionAlejamientoPaneoSeg: duracionEF,
      duracionPanoramicaFinalSeg: duracionG,
      finPaneoFraccion,
      inicioZoomFraccion,
    };
  }

  async function prepararTodo() {
    setPreparando(true);
    setLogs([]);
    const tInicio = performance.now();

    const grillaAncha = elegirGrillaAncha(RUTA_PRUEBA, ANCHO_VIDEO, ALTO_VIDEO);
    zoomAnchoRef.current = grillaAncha.zoom;
    const ruta = construirRutaCoreografiaV2(RUTA_PRUEBA, grillaAncha);
    rutaRef.current = ruta;
    const ventana = calcularVentanaCrossfade(grillaAncha.zoom);
    ventanaRef.current = ventana;
    const duracionSeguimientoAuto = calcularDuracionSeguimientoV2(ruta.distanciaTotalKm);
    setDuracionD(duracionSeguimientoAuto);
    const params = { ...parametros(), duracionSeguimientoSeg: duracionSeguimientoAuto };

    const corredorZ17 = construirCorredorZ17V2(ruta, ventana);
    // Cobertura real de la grilla ancha (panorámica + paneo/zoom de
    // entrada y salida) -- se agrega al set del bbox, no lo reemplaza; el
    // zoom elegido (grillaAncha.zoom) queda intacto.
    const coberturaAncha = construirCoberturaGrillaAnchaV2(ruta, ventana, params, ventana.factorAncho);
    const clavesAncha = new Set([...grillaAncha.claves, ...coberturaAncha]);

    const contAncha = crearContadoresTilesHibridos();
    const contZ17 = crearContadoresTilesHibridos();
    const [tilesAncha, tilesZ17] = await Promise.all([
      prepararTilesHibridos(clavesAncha, grillaAncha.zoom, CONCURRENCIA, contAncha),
      prepararTilesHibridos(corredorZ17, ZOOM_SEGUIMIENTO, CONCURRENCIA, contZ17),
    ]);
    tilesAnchaRef.current = tilesAncha;
    tilesZ17Ref.current = tilesZ17;

    const tTotalMs = performance.now() - tInicio;
    const bytesPorTile = 256 * 256 * 4;
    const memAnchaMB = (tilesAncha.size * bytesPorTile) / 1_048_576;
    const memZ17MB = (tilesZ17.size * bytesPorTile) / 1_048_576;

    log(`[v2-camara] zoomAncho=${grillaAncha.zoom} factorAncho=${ventana.factorAncho.toFixed(6)}`);
    log(
      `[v2-camara] ventanaCrossfade escalaInferior=${ventana.escalaInferior.toFixed(4)} escalaCorte=${ventana.escalaCorte.toFixed(4)} escalaSuperior=${ventana.escalaSuperior.toFixed(4)}`,
    );
    log(
      `[v2-camara] grillaAncha tiles=${tilesAncha.size}/${clavesAncha.size} (bbox=${grillaAncha.claves.size} cobertura=${coberturaAncha.size}) memoriaMB=${memAnchaMB.toFixed(2)} fallos(sat/etq)=${contAncha.falloSatelite}/${contAncha.falloEtiquetas}`,
    );
    log(
      `[v2-camara] grillaZ17 tiles=${tilesZ17.size}/${corredorZ17.size} memoriaMB=${memZ17MB.toFixed(2)} fallos(sat/etq)=${contZ17.falloSatelite}/${contZ17.falloEtiquetas}`,
    );
    log(`[v2-camara] memoriaTotalMB=${(memAnchaMB + memZ17MB).toFixed(2)} tiempoPreparacionMs=${tTotalMs.toFixed(0)}`);
    log(`[v2-camara] distanciaTotalKm=${ruta.distanciaTotalKm.toFixed(3)} duracionSeguimientoSeg=${duracionSeguimientoAuto.toFixed(2)}`);
    log(
      `[v2-camara] centroide=(${ruta.centroide.cx.toFixed(1)},${ruta.centroide.cy.toFixed(1)},${ruta.centroide.escala.toFixed(5)}) ` +
        `inicioSeguimiento=(${ruta.inicioSeguimiento.cx.toFixed(1)},${ruta.inicioSeguimiento.cy.toFixed(1)},${ruta.inicioSeguimiento.escala.toFixed(4)}) ` +
        `finSeguimiento=(${ruta.finSeguimiento.cx.toFixed(1)},${ruta.finSeguimiento.cy.toFixed(1)},${ruta.finSeguimiento.escala.toFixed(4)})`,
    );

    // Verificación de continuidad matemática en los límites de fase --
    // evalúa la cámara justo antes/después de cada frontera y confirma que
    // cx/cy/escala no saltan.
    const fronteras = [
      params.duracionPanoramicaInicialSeg,
      params.duracionPanoramicaInicialSeg + params.duracionPaneoAcercamientoSeg,
      params.duracionPanoramicaInicialSeg + params.duracionPaneoAcercamientoSeg + params.duracionSeguimientoSeg,
      params.duracionPanoramicaInicialSeg + params.duracionPaneoAcercamientoSeg + params.duracionSeguimientoSeg + params.duracionAlejamientoPaneoSeg,
    ];
    for (const t of fronteras) {
      const antes = calcularFaseYCamaraV2(ruta, params, t - 0.001, crearEstadoRecursivoV2(), "resimular");
      const despues = calcularFaseYCamaraV2(ruta, params, t + 0.001, crearEstadoRecursivoV2(), "resimular");
      const saltoPx = Math.hypot(despues.camara.cx - antes.camara.cx, despues.camara.cy - antes.camara.cy);
      const saltoEscala = Math.abs(despues.camara.escala - antes.camara.escala);
      log(
        `[v2-continuidad] t=${t.toFixed(2)}s ${antes.fase}->${despues.fase} saltoPosicionPx=${saltoPx.toFixed(3)} saltoEscala=${saltoEscala.toFixed(6)}`,
      );
    }

    setPreparando(false);
    dibujarCuadro(ruta, ventana, params, 0);
  }

  function dibujarCuadro(
    ruta: RutaCoreografiaV2,
    ventana: VentanaCrossfade,
    params: ParametrosCoreografiaV2,
    t: number,
    modo: "incremental" | "resimular" = "resimular",
  ) {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    canvas.width = ANCHO_VIDEO;
    canvas.height = ALTO_VIDEO;

    const resultado = calcularFaseYCamaraV2(ruta, params, t, estadoSeguimientoRef.current, modo);
    setFaseActual(resultado.fase);

    if (ultimaFaseRef.current && ultimaFaseRef.current !== resultado.fase) {
      log(`[v2-fase] ${ultimaFaseRef.current} -> ${resultado.fase} en t=${t.toFixed(2)}s`);
    }
    ultimaFaseRef.current = resultado.fase;

    const { camara } = resultado;
    const peso = pesoZ17DesdeEscala(camara.escala, ventana);

    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, ANCHO_VIDEO, ALTO_VIDEO);

    const camaraAncha = { x: camara.cx * ventana.factorAncho, y: camara.cy * ventana.factorAncho };
    const escalaCropAncha = camara.escala / ventana.factorAncho;
    const resAncha = dibujarTilesHibridos(ctx, tilesAnchaRef.current, camaraAncha, escalaCropAncha, ANCHO_VIDEO, ALTO_VIDEO, 1);

    let resZ17 = { tilesVisibles: 0, tilesFaltantes: 0 };
    if (peso > 0) {
      resZ17 = dibujarTilesHibridos(
        ctx,
        tilesZ17Ref.current,
        { x: camara.cx, y: camara.cy },
        camara.escala,
        ANCHO_VIDEO,
        ALTO_VIDEO,
        peso,
      );
    }

    // Trazo de la ruta completa, transformado con la MISMA cámara Z17.
    ctx.strokeStyle = "#ffcc33";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ruta.puntosZ17.forEach((p, i) => {
      const sx = ANCHO_VIDEO / 2 + (p.x - camara.cx) * camara.escala;
      const sy = ALTO_VIDEO / 2 + (p.y - camara.cy) * camara.escala;
      if (i === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    });
    ctx.stroke();

    // Cruz en el centro (marca camara.cx/cy siempre).
    ctx.strokeStyle = "#ff2d2d";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(ANCHO_VIDEO / 2 - 20, ALTO_VIDEO / 2);
    ctx.lineTo(ANCHO_VIDEO / 2 + 20, ALTO_VIDEO / 2);
    ctx.moveTo(ANCHO_VIDEO / 2, ALTO_VIDEO / 2 - 20);
    ctx.lineTo(ANCHO_VIDEO / 2, ALTO_VIDEO / 2 + 20);
    ctx.stroke();

    ctx.fillStyle = "#39ff6a";
    ctx.font = "24px monospace";
    const lineas = [
      `fase=${resultado.fase} t=${t.toFixed(2)}s${resultado.fraccionTrazo !== null ? ` fraccionTrazo=${resultado.fraccionTrazo.toFixed(3)}` : ""}`,
      `cx=${camara.cx.toFixed(1)} cy=${camara.cy.toFixed(1)} escala=${camara.escala.toFixed(5)}`,
      `pesoZ17=${peso.toFixed(3)}`,
      `ancha: visibles=${resAncha.tilesVisibles} faltantes=${resAncha.tilesFaltantes}`,
      `z17: visibles=${resZ17.tilesVisibles} faltantes=${resZ17.tilesFaltantes}`,
    ];
    lineas.forEach((linea, i) => ctx.fillText(linea, 16, 40 + i * 30));

    if (resAncha.tilesFaltantes > 0 || resZ17.tilesFaltantes > 0) {
      log(`[v2-faltantes] t=${t.toFixed(2)}s fase=${resultado.fase} anchaFaltantes=${resAncha.tilesFaltantes} z17Faltantes=${resZ17.tilesFaltantes}`);
    }
  }

  function tick(tsMs: number) {
    const ruta = rutaRef.current;
    const ventana = ventanaRef.current;
    if (!ruta || !ventana) return;
    if (ultimoTickMsRef.current === 0) ultimoTickMsRef.current = tsMs;
    const deltaSeg = ((tsMs - ultimoTickMsRef.current) / 1000) * velocidad;
    ultimoTickMsRef.current = tsMs;

    const params = parametros();
    const duracionTotal = duracionTotalV2(params);
    let nuevoTiempo = tiempoSeg + deltaSeg;
    if (nuevoTiempo >= duracionTotal) {
      nuevoTiempo = duracionTotal;
      setReproduciendo(false);
    }
    setTiempoSeg(nuevoTiempo);
    dibujarCuadro(ruta, ventana, params, nuevoTiempo, "incremental");

    if (nuevoTiempo < duracionTotal) {
      animFrameRef.current = requestAnimationFrame(tick);
    }
  }

  function alternarReproduccion() {
    if (reproduciendo) {
      if (animFrameRef.current !== null) cancelAnimationFrame(animFrameRef.current);
      setReproduciendo(false);
      return;
    }
    if (!rutaRef.current) return;
    // Al reanudar, reconstruye el estado recursivo de seguimiento hasta el
    // tiempo actual -- para que, si el tiempo actual cae dentro de la fase
    // de seguimiento (por ejemplo tras usar el scrubber), la recursión
    // continúe de forma consistente en vez de arrancar de cero.
    const params = parametros();
    const tBC = params.duracionPanoramicaInicialSeg + params.duracionPaneoAcercamientoSeg;
    const tD = tBC + params.duracionSeguimientoSeg;
    if (tiempoSeg > tBC && tiempoSeg < tD) {
      const fraccionTrazo = (tiempoSeg - tBC) / (tD - tBC);
      const { estado } = resimularEstadoCompleto(rutaRef.current, fraccionTrazo, Math.max(30, Math.round(fraccionTrazo * 240)));
      estadoSeguimientoRef.current = estado;
    } else {
      estadoSeguimientoRef.current = crearEstadoRecursivoV2();
    }
    ultimoTickMsRef.current = 0;
    setReproduciendo(true);
    animFrameRef.current = requestAnimationFrame(tick);
  }

  function alMoverScrubber(valor: number) {
    if (reproduciendo) alternarReproduccion(); // pausa
    setTiempoSeg(valor);
    const ruta = rutaRef.current;
    const ventana = ventanaRef.current;
    if (ruta && ventana) dibujarCuadro(ruta, ventana, parametros(), valor, "resimular");
  }

  const duracionTotal = duracionTotalV2(parametros());

  return (
    <div style={{ padding: 16, fontFamily: "monospace", color: "#eee", background: "#111", minHeight: "100vh" }}>
      <h1 style={{ fontSize: 16 }}>V2 Fase 2: coreografía de cámara (sin MediaRecorder)</h1>
      <p style={{ fontSize: 12, opacity: 0.8 }}>
        Diagnóstico temporal -- no toca V1. Panorámica → paneo → acercamiento → seguimiento → alejamiento → paneo final →
        panorámica final, una sola cámara Z17.
      </p>

      <button onClick={prepararTodo} disabled={preparando} style={{ padding: "8px 16px", fontSize: 14, marginRight: 8 }}>
        {preparando ? "Preparando..." : "Preparar tiles"}
      </button>
      <button onClick={alternarReproduccion} disabled={!rutaRef.current} style={{ padding: "8px 16px", fontSize: 14 }}>
        {reproduciendo ? "Pausar" : "Reproducir"}
      </button>

      <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 8, fontSize: 12 }}>
        <label>
          Panorámica inicial (s)
          <input type="number" step={0.1} value={duracionA} onChange={(e) => setDuracionA(Number(e.target.value))} style={{ width: "100%" }} />
        </label>
        <label>
          Paneo+acercamiento (s)
          <input type="number" step={0.1} value={duracionBC} onChange={(e) => setDuracionBC(Number(e.target.value))} style={{ width: "100%" }} />
        </label>
        <label>
          Seguimiento (s)
          <input type="number" step={0.1} value={duracionD} onChange={(e) => setDuracionD(Number(e.target.value))} style={{ width: "100%" }} />
        </label>
        <label>
          Alejamiento+paneo (s)
          <input type="number" step={0.1} value={duracionEF} onChange={(e) => setDuracionEF(Number(e.target.value))} style={{ width: "100%" }} />
        </label>
        <label>
          Panorámica final (s)
          <input type="number" step={0.1} value={duracionG} onChange={(e) => setDuracionG(Number(e.target.value))} style={{ width: "100%" }} />
        </label>
        <label>
          Fin paneo (fracción)
          <input
            type="number"
            step={0.05}
            min={0.05}
            max={0.95}
            value={finPaneoFraccion}
            onChange={(e) => setFinPaneoFraccion(Number(e.target.value))}
            style={{ width: "100%" }}
          />
        </label>
        <label>
          Inicio zoom (fracción)
          <input
            type="number"
            step={0.05}
            min={0.05}
            max={0.95}
            value={inicioZoomFraccion}
            onChange={(e) => setInicioZoomFraccion(Number(e.target.value))}
            style={{ width: "100%" }}
          />
        </label>
        <label>
          Velocidad
          <input type="number" step={0.1} min={0.1} max={4} value={velocidad} onChange={(e) => setVelocidad(Number(e.target.value))} style={{ width: "100%" }} />
        </label>
      </div>

      <div style={{ marginTop: 8 }}>
        <label style={{ fontSize: 12 }}>
          Scrubber ({tiempoSeg.toFixed(2)}s / {duracionTotal.toFixed(2)}s) -- fase: {faseActual ?? "-"}
        </label>
        <input
          type="range"
          min={0}
          max={duracionTotal || 1}
          step={0.01}
          value={tiempoSeg}
          onChange={(e) => alMoverScrubber(Number(e.target.value))}
          style={{ width: "100%" }}
        />
      </div>

      <canvas ref={canvasRef} style={{ width: 360, height: 640, border: "1px solid #555", marginTop: 12 }} />

      <pre style={{ fontSize: 11, whiteSpace: "pre-wrap", marginTop: 12, maxHeight: 300, overflow: "auto" }}>{logs.join("\n")}</pre>
    </div>
  );
}
