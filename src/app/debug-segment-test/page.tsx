"use client";

// DIAGNÓSTICO TEMPORAL -- prueba aislada de MediaRecorder.pause()/resume()
// para validar si sirve de base a la Opción C (render por segmentos) del
// video 2D. No importa nada de lib/tarjetaRecorrido.ts a propósito -- no
// toca tiles Z17, cámara, GPS ni ninguna otra lógica real. Eliminar esta
// página una vez resuelta la validación.
//
// Secuencia: graba ~2s -> pause() -> espera 3s reales (simula preparación
// de un segmento) -> resume() -> graba otros ~2s -> stop(). El archivo
// final debería durar ~4s (2s + 2s), NO ~7s con 3s de cuadro congelado en
// el medio -- eso es exactamente lo que hay que confirmar visualmente y
// con video.duration.

import { useRef, useState, type SyntheticEvent } from "react";

const ANCHO = 360;
const ALTO = 640;
const FPS = 24;
const INTERVALO_MS = 1000 / FPS;
const DURACION_TRAMO_SEG = 2;
const DURACION_PAUSA_SEG = 3;

function elegirMimeType(): string {
  const candidatos = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  for (const candidato of candidatos) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(candidato)) return candidato;
  }
  return "video/webm";
}

export default function DebugSegmentTestPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [corriendo, setCorriendo] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [duracionMedidaSeg, setDuracionMedidaSeg] = useState<number | null>(null);

  function log(linea: string) {
    console.log(linea);
    setLogs((prev) => [...prev, linea]);
  }

  function dibujarCuadro(ctx: CanvasRenderingContext2D, frame: number, fase: string) {
    const t = frame / FPS;
    ctx.fillStyle = fase === "tramo1" ? "#1b3a5c" : "#5c1b3a";
    ctx.fillRect(0, 0, ANCHO, ALTO);
    const x = (frame * 6) % ANCHO;
    ctx.fillStyle = "#ffcc33";
    ctx.beginPath();
    ctx.arc(x, ALTO / 2, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "24px monospace";
    ctx.fillText(`frame=${frame}`, 16, 60);
    ctx.fillText(`t=${t.toFixed(2)}s`, 16, 90);
    ctx.fillText(fase, 16, 120);
  }

  async function correrPrueba() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = ANCHO;
    canvas.height = ALTO;

    setLogs([]);
    setVideoUrl(null);
    setDuracionMedidaSeg(null);
    setCorriendo(true);

    const stream = canvas.captureStream(FPS);
    const mediaRecorder = new MediaRecorder(stream, { mimeType: elegirMimeType() });
    const chunks: BlobPart[] = [];
    let errorRecorder: Event | null = null;

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    mediaRecorder.onpause = () => log("[segment-test] evento onpause disparado");
    mediaRecorder.onresume = () => log("[segment-test] evento onresume disparado");
    mediaRecorder.onerror = (e) => {
      errorRecorder = e;
      log(`[segment-test] *** ERROR *** ${String(e)}`);
    };

    const grabacionLista = new Promise<Blob>((resolve, reject) => {
      mediaRecorder.onstop = () => {
        if (errorRecorder) reject(new Error("Error en MediaRecorder durante la prueba."));
        else resolve(new Blob(chunks, { type: "video/webm" }));
      };
    });

    const tInicioMs = performance.now();
    log("[segment-test] recorder start");
    mediaRecorder.start();

    let frame = 0;
    const framesPorTramo = Math.round(DURACION_TRAMO_SEG * FPS);

    for (let i = 0; i < framesPorTramo; i++) {
      dibujarCuadro(ctx, frame++, "tramo1");
      await new Promise((r) => setTimeout(r, INTERVALO_MS));
    }

    log("[segment-test] pause solicitado");
    mediaRecorder.pause();
    log(`[segment-test] pause confirmado state=${mediaRecorder.state}`);

    log("[segment-test] preparación simulada inicio");
    const tPrepInicioMs = performance.now();
    await new Promise((r) => setTimeout(r, DURACION_PAUSA_SEG * 1000));
    const tPrepMs = performance.now() - tPrepInicioMs;
    log(`[segment-test] preparación simulada fin tiempoRealMs=${tPrepMs.toFixed(0)}`);

    log("[segment-test] resume solicitado");
    mediaRecorder.resume();
    log(`[segment-test] resume confirmado state=${mediaRecorder.state}`);

    for (let i = 0; i < framesPorTramo; i++) {
      dibujarCuadro(ctx, frame++, "tramo2");
      await new Promise((r) => setTimeout(r, INTERVALO_MS));
    }

    log("[segment-test] recorder stop");
    mediaRecorder.stop();

    try {
      const blob = await grabacionLista;
      const tTotalMs = performance.now() - tInicioMs;
      log(`[segment-test] duración real total=${(tTotalMs / 1000).toFixed(2)}s`);
      const url = URL.createObjectURL(blob);
      setVideoUrl(url);
    } catch (err) {
      log(`[segment-test] *** FALLÓ LA PRUEBA *** ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setCorriendo(false);
    }
  }

  function alCargarMetadatosVideo(e: SyntheticEvent<HTMLVideoElement>) {
    const dur = e.currentTarget.duration;
    setDuracionMedidaSeg(dur);
    log(`[segment-test] duración medida del archivo resultante=${dur.toFixed(2)}s`);
  }

  return (
    <div style={{ padding: 16, fontFamily: "monospace", color: "#eee", background: "#111", minHeight: "100vh" }}>
      <h1 style={{ fontSize: 16 }}>Prueba aislada: MediaRecorder pause/resume</h1>
      <p style={{ fontSize: 12, opacity: 0.8 }}>
        Diagnóstico temporal -- no toca tiles Z17, cámara ni GPS. Secuencia: 2s grabación + pause() + 3s de
        espera simulada + resume() + 2s grabación + stop(). El archivo final debería durar ~4s, no ~7s con
        un cuadro congelado en el medio.
      </p>
      <button onClick={correrPrueba} disabled={corriendo} style={{ padding: "8px 16px", fontSize: 14, marginBottom: 12 }}>
        {corriendo ? "Corriendo..." : "Iniciar prueba"}
      </button>
      <div>
        <canvas ref={canvasRef} style={{ width: 180, height: 320, border: "1px solid #555" }} />
      </div>
      {videoUrl && (
        <div style={{ marginTop: 12 }}>
          <video src={videoUrl} controls playsInline onLoadedMetadata={alCargarMetadatosVideo} style={{ width: 180 }} />
          {duracionMedidaSeg !== null && (
            <p style={{ fontSize: 14, color: duracionMedidaSeg < 6 ? "#7CFC00" : "#ff5555" }}>
              Duración medida del archivo: {duracionMedidaSeg.toFixed(2)}s (esperado ~4s, no ~7s)
            </p>
          )}
        </div>
      )}
      <pre style={{ fontSize: 11, whiteSpace: "pre-wrap", marginTop: 12 }}>{logs.join("\n")}</pre>
    </div>
  );
}
