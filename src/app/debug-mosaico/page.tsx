"use client";

// PÁGINA TEMPORAL DE DIAGNÓSTICO -- eliminar junto con
// generarDiagnosticoMosaico() en lib/tarjetaRecorrido.ts una vez resuelta la
// alineación de mosaicos del video 2D. No forma parte del flujo real de la
// app (no hay ningún link hacia acá).

import { useEffect, useRef, useState } from "react";
import { generarDiagnosticoMosaico } from "@/lib/tarjetaRecorrido";

interface Caso {
  titulo: string;
  despX: number;
  despY: number;
}

const CASOS: Caso[] = [
  { titulo: "1) Centro exacto (despZ17 = 0,0)", despX: 0, despY: 0 },
  { titulo: "2) Desplazamiento +100 Z17 en X", despX: 100, despY: 0 },
  { titulo: "3) Desplazamiento +100 Z17 en Y", despX: 0, despY: 100 },
];

function BloqueCaso({ caso }: { caso: Caso }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [texto, setTexto] = useState("Generando...");

  useEffect(() => {
    let cancelado = false;
    generarDiagnosticoMosaico(caso.despX, caso.despY).then((r) => {
      if (cancelado) return;
      setTexto(r.texto);
      const el = canvasRef.current;
      if (el) {
        el.width = r.canvas.width;
        el.height = r.canvas.height;
        const ctx = el.getContext("2d");
        ctx?.drawImage(r.canvas, 0, 0);
      }
    });
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <h2 style={{ color: "#fff", fontFamily: "monospace" }}>{caso.titulo}</h2>
      <canvas ref={canvasRef} style={{ width: 270, height: 480, border: "2px solid #e7c168", background: "#000" }} />
      <pre
        style={{
          color: "#39ff6a",
          background: "#000",
          padding: 8,
          fontSize: 11,
          maxWidth: 480,
          whiteSpace: "pre-wrap",
        }}
      >
        {texto}
      </pre>
    </div>
  );
}

export default function DebugMosaicoPage() {
  return (
    <div style={{ background: "#111", minHeight: "100vh", padding: 24 }}>
      <h1 style={{ color: "#fff", fontFamily: "monospace" }}>Diagnóstico de mosaico Z17 (temporal)</h1>
      <p style={{ color: "#aaa", fontFamily: "monospace", maxWidth: 700 }}>
        Un solo mosaico Z17, una coordenada conocida, un recorte, un canvas 720x1280. Sin panorámica, cadena de
        mosaicos, cámara suavizada, crossfade, fallback, intro/outro, etiquetas ni estadísticas. La cruz roja marca el
        centro exacto (360,640) -- en el caso 1 la coordenada de prueba debe caer visualmente ahí.
      </p>
      <div style={{ display: "flex", gap: 32, flexWrap: "wrap", marginTop: 16 }}>
        {CASOS.map((c) => (
          <BloqueCaso key={c.titulo} caso={c} />
        ))}
      </div>
    </div>
  );
}
