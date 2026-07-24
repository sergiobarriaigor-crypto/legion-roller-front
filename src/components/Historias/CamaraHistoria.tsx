"use client";

import { useEffect, useRef, useState } from "react";
import { IconRefresh, IconX } from "@tabler/icons-react";
import { DURACION_MAXIMA_VIDEO_HISTORIA_SEG } from "@/lib/historias";
import { Toast } from "@/components/Toast";

export function soportaCamaraEnVivo(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== "undefined"
  );
}

const TIPOS_VIDEO_CANDIDATOS = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];

async function obtenerStreamCamara(frontal: boolean): Promise<MediaStream> {
  const facingMode = frontal ? "user" : "environment";
  try {
    return await navigator.mediaDevices.getUserMedia({ video: { facingMode }, audio: true });
  } catch {
    // Varios navegadores rechazan todo el pedido si el micrófono no se puede
    // conceder — se reintenta solo con video (queda sin audio, pero la
    // cámara sigue siendo utilizable para foto y video mudo).
    return await navigator.mediaDevices.getUserMedia({ video: { facingMode } });
  }
}

// Cámara propia dentro de la página (getUserMedia + MediaRecorder) en vez de
// delegar a la app de cámara nativa del celular: la nativa no deja imponer un
// límite de grabación en vivo (ver BarraHistorias.tsx para el porqué), así
// que para Video se necesita control total desde JS — acá se corta sola al
// llegar a DURACION_MAXIMA_VIDEO_HISTORIA_SEG, sin pasar por VideoTrimmer.
export function CamaraHistoria({
  onCapturado,
  onCerrar,
  onPermisoBloqueado,
}: {
  onCapturado: (archivo: File) => void;
  onCerrar: () => void;
  onPermisoBloqueado: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const grabadoraRef = useRef<MediaRecorder | null>(null);
  const fragmentosRef = useRef<Blob[]>([]);
  const idIntervaloRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const idLimiteRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [modo, setModo] = useState<"foto" | "video">("foto");
  const [listo, setListo] = useState(false);
  const [error, setError] = useState("");
  const [grabando, setGrabando] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const [camaraFrontal, setCamaraFrontal] = useState(false);
  const [sinCamaraAlterna, setSinCamaraAlterna] = useState(false);

  useEffect(() => {
    let cancelado = false;

    (async () => {
      try {
        const stream = await obtenerStreamCamara(false);
        if (cancelado) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setListo(true);
      } catch (err) {
        const nombre = err instanceof Error ? err.name : "";
        if (nombre === "NotAllowedError" || nombre === "SecurityError") {
          onPermisoBloqueado();
          onCerrar();
        } else {
          setError("No se pudo acceder a la cámara de este dispositivo.");
        }
      }
    })();

    return () => {
      cancelado = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (idIntervaloRef.current) clearInterval(idIntervaloRef.current);
      if (idLimiteRef.current) clearTimeout(idLimiteRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Gira entre trasera/frontal soltando la cámara actual ANTES de pedir la
  // otra: casi ningún celular puede tener dos cámaras activas a la vez (un
  // solo chip de cámara), así que pedir la nueva con la vieja todavía
  // abierta falla siempre, aunque el equipo sí tenga ambas cámaras. Si la
  // nueva falla igual, se intenta recuperar la que estaba andando para no
  // dejar la vista sin cámara.
  async function girarCamara() {
    if (!listo || grabando) return;
    const anteriorFrontal = camaraFrontal;
    const nuevaFrontal = !camaraFrontal;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    try {
      const stream = await obtenerStreamCamara(nuevaFrontal);
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setCamaraFrontal(nuevaFrontal);
    } catch {
      setSinCamaraAlterna(true);
      try {
        const streamAnterior = await obtenerStreamCamara(anteriorFrontal);
        streamRef.current = streamAnterior;
        if (videoRef.current) videoRef.current.srcObject = streamAnterior;
      } catch {
        setError("No se pudo acceder a la cámara de este dispositivo.");
      }
    }
  }

  function cerrar() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    onCerrar();
  }

  function tomarFoto() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        onCapturado(new File([blob], `historia-foto-${Date.now()}.jpg`, { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.9,
    );
  }

  function detenerGrabacion() {
    if (idIntervaloRef.current) clearInterval(idIntervaloRef.current);
    if (idLimiteRef.current) clearTimeout(idLimiteRef.current);
    grabadoraRef.current?.stop();
    setGrabando(false);
  }

  function iniciarGrabacion() {
    const stream = streamRef.current;
    if (!stream) return;
    const mimeType = TIPOS_VIDEO_CANDIDATOS.find((t) => MediaRecorder.isTypeSupported(t)) ?? "video/webm";
    const grabadora = new MediaRecorder(stream, { mimeType });
    fragmentosRef.current = [];
    grabadora.ondataavailable = (ev) => {
      if (ev.data.size > 0) fragmentosRef.current.push(ev.data);
    };
    grabadora.onstop = () => {
      const blob = new Blob(fragmentosRef.current, { type: "video/webm" });
      onCapturado(new File([blob], `historia-video-${Date.now()}.webm`, { type: "video/webm" }));
    };
    grabadoraRef.current = grabadora;
    grabadora.start();
    setGrabando(true);
    setSegundos(0);

    idIntervaloRef.current = setInterval(() => setSegundos((s) => s + 1), 1000);
    idLimiteRef.current = setTimeout(detenerGrabacion, DURACION_MAXIMA_VIDEO_HISTORIA_SEG * 1000);
  }

  function alPresionarCaptura() {
    if (modo === "foto") {
      tomarFoto();
      return;
    }
    if (grabando) {
      detenerGrabacion();
    } else {
      iniciarGrabacion();
    }
  }

  const circunferencia = 2 * Math.PI * 46;
  const progreso = Math.min(1, segundos / DURACION_MAXIMA_VIDEO_HISTORIA_SEG);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black" data-no-swipe>
      <div className="flex items-center justify-between p-3">
        <button type="button" onClick={cerrar} className="text-white" aria-label="Cerrar cámara">
          <IconX size={22} />
        </button>
        {grabando && (
          <span className="rounded-full bg-black/50 px-3 py-1 text-xs text-white">
            {segundos}s / {DURACION_MAXIMA_VIDEO_HISTORIA_SEG}s
          </span>
        )}
        {!error ? (
          <button
            type="button"
            onClick={girarCamara}
            disabled={!listo || grabando}
            aria-label="Girar cámara"
            className="text-white disabled:opacity-40"
          >
            <IconRefresh size={22} />
          </button>
        ) : (
          <div className="w-[22px]" />
        )}
      </div>

      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        {error ? (
          <div className="flex flex-col items-center gap-4 px-6">
            <p className="text-center text-sm text-fill-warning">{error}</p>
            <button
              type="button"
              onClick={cerrar}
              className="rounded-app border border-white/30 px-4 py-2 text-sm text-white"
            >
              Cerrar
            </button>
          </div>
        ) : (
          // La cámara frontal se ve reflejada como espejo (igual que la
          // vista previa nativa de cualquier celular) — la foto/video que se
          // guarda no queda espejado, porque canvas/MediaRecorder leen el
          // cuadro real de la cámara, no el CSS aplicado acá.
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="h-full w-full object-cover"
            style={camaraFrontal ? { transform: "scaleX(-1)" } : undefined}
          />
        )}
      </div>

      {!error && (
        <div className="flex flex-col items-center gap-4 p-4">
          {!grabando && (
            <div className="flex gap-1 rounded-full bg-white/10 p-1">
              <button
                type="button"
                onClick={() => setModo("foto")}
                className={`rounded-full px-4 py-1.5 text-sm ${
                  modo === "foto" ? "bg-fill-primary text-on-primary" : "text-white"
                }`}
              >
                Foto
              </button>
              <button
                type="button"
                onClick={() => setModo("video")}
                className={`rounded-full px-4 py-1.5 text-sm ${
                  modo === "video" ? "bg-fill-primary text-on-primary" : "text-white"
                }`}
              >
                Video
              </button>
            </div>
          )}

          <button
            type="button"
            disabled={!listo}
            onClick={alPresionarCaptura}
            aria-label={modo === "foto" ? "Tomar foto" : grabando ? "Detener grabación" : "Grabar video"}
            className="relative flex h-16 w-16 items-center justify-center rounded-full border-4 border-white disabled:opacity-40"
          >
            {grabando ? (
              <span className="h-6 w-6 rounded-sm bg-fill-warning" />
            ) : (
              <span className={`h-12 w-12 rounded-full ${modo === "video" ? "bg-fill-warning" : "bg-white"}`} />
            )}
            {grabando && (
              <svg className="absolute -inset-1 -rotate-90" viewBox="0 0 100 100">
                <circle
                  cx="50"
                  cy="50"
                  r="46"
                  fill="none"
                  stroke="white"
                  strokeWidth="4"
                  strokeDasharray={circunferencia}
                  strokeDashoffset={circunferencia * (1 - progreso)}
                />
              </svg>
            )}
          </button>
        </div>
      )}

      {sinCamaraAlterna && (
        <Toast
          mensaje="Este dispositivo no tiene otra cámara disponible."
          onDismiss={() => setSinCamaraAlterna(false)}
          duracionMs={2500}
        />
      )}
    </div>
  );
}
