"use client";

import { useEffect, useRef, useState } from "react";
import { IconRefresh, IconRotate2, IconSparkles, IconX } from "@tabler/icons-react";
import { DURACION_MAXIMA_VIDEO_HISTORIA_SEG } from "@/lib/historias";
import { ANCHO_HISTORIA, ALTO_HISTORIA, FILTROS_FOTO, type FiltroFoto } from "@/components/Historias/FiltrosFoto";
import { Toast } from "@/components/Toast";

export function soportaCamaraEnVivo(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== "undefined"
  );
}

const TIPOS_VIDEO_CANDIDATOS = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];

// "Captura Express" (a diferencia de la cámara nativa, que sí sabe la
// orientación real porque escribe el tag EXIF leyendo el acelerómetro) no
// tiene forma de detectar que el teléfono está girado a través de la
// orientación de la PANTALLA: si el usuario tiene el bloqueo de rotación
// activado (lo más común), la pantalla nunca gira aunque el teléfono sí, y
// el cuadro de la cámara queda grabado "acostado". Se probaron varios
// métodos de detección automática vía acelerómetro (deviceorientation,
// devicemotion con umbral de confianza, distintas asignaciones de eje), pero
// ninguno resultó confiable de forma consistente entre pruebas reales en el
// mismo equipo -- por eso se descartó la detección automática por completo y
// se dejó solo la corrección MANUAL (botón de girar más abajo), que es 100%
// predecible sin depender de sensores.
function sumarAngulos(a: 0 | 90 | 180 | 270, b: 0 | 90 | 180 | 270): 0 | 90 | 180 | 270 {
  return (((a + b) % 360) as 0 | 90 | 180 | 270);
}

interface Embellecimiento {
  id: string;
  nombre: string;
  css: string;
}

// Separado de FILTROS_FOTO (color) a propósito: son dos decisiones distintas
// para quien graba — "qué tono" vs. "cuánto suavizar la piel" — así que
// viven en controles distintos (fila abajo vs. botón aparte a la derecha)
// en vez de mezclarse en una sola lista larga.
const EMBELLECIMIENTOS: Embellecimiento[] = [
  { id: "ninguno", nombre: "Ninguno", css: "none" },
  { id: "ligero", nombre: "Ligero", css: "blur(0.4px) brightness(1.05) contrast(0.95) saturate(1.05)" },
  { id: "medio", nombre: "Medio", css: "blur(0.8px) brightness(1.08) contrast(0.9) saturate(1.08)" },
  { id: "glow", nombre: "Glow", css: "blur(0.5px) brightness(1.12) contrast(0.88) sepia(0.1) saturate(1.15)" },
];

// Solo se pide facingMode — sin width/height/aspectRatio "ideal": pedir una
// proporción angosta (9:16) hace que varios celulares apliquen un recorte de
// hardware (zoom) al sensor para acercarse a esa forma, en vez de solo
// reescalar, dejando la vista previa notoriamente más cerca de lo real. No
// hace falta: el recorte a 1080x1920 ya se hace en software al dibujar cada
// cuadro en el canvas (dibujarCuadro más abajo) y en prepararFotoHistoria
// para la foto, así que la cámara puede entregar su campo de visión normal.
async function obtenerStreamCamara(frontal: boolean): Promise<MediaStream> {
  const facingMode = frontal ? "user" : "environment";
  const video: MediaTrackConstraints = { facingMode };
  try {
    return await navigator.mediaDevices.getUserMedia({ video, audio: true });
  } catch {
    // Varios navegadores rechazan todo el pedido si el micrófono no se puede
    // conceder — se reintenta solo con video (queda sin audio, pero la
    // cámara sigue siendo utilizable para foto y video mudo).
    return await navigator.mediaDevices.getUserMedia({ video });
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
  soloFoto = false,
}: {
  onCapturado: (archivo: File) => void;
  onCerrar: () => void;
  onPermisoBloqueado: () => void;
  // Usado desde el chat (adjuntar "Captura Express"): oculta el selector
  // Foto/Video, dejando solo el modo foto — el chat ya tiene su propio
  // adjunto de video separado (selector de archivo nativo), no hace falta
  // duplicar ese camino acá.
  soloFoto?: boolean;
}) {
  const contenedorRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const grabadoraRef = useRef<MediaRecorder | null>(null);
  const fragmentosRef = useRef<Blob[]>([]);
  const idIntervaloRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const idLimiteRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idCuadroRef = useRef<number | null>(null);
  // Grados que hay que rotar el cuadro capturado para que quede derecho --
  // 100% manual (botón de girar más abajo), sin detección automática (ver
  // comentario arriba de por qué se descartó el acelerómetro).
  const [anguloManual, setAnguloManual] = useState<0 | 90 | 180 | 270>(0);

  const [modo, setModo] = useState<"foto" | "video">("foto");
  const [listo, setListo] = useState(false);
  const [error, setError] = useState("");
  const [grabando, setGrabando] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const [camaraFrontal, setCamaraFrontal] = useState(false);
  const [sinCamaraAlterna, setSinCamaraAlterna] = useState(false);
  const [filtro, setFiltro] = useState<FiltroFoto>(FILTROS_FOTO[0]);
  const [embellecimiento, setEmbellecimiento] = useState<Embellecimiento>(EMBELLECIMIENTOS[0]);
  const [mostrarEmbellecimiento, setMostrarEmbellecimiento] = useState(false);

  // El filtro de color y el embellecimiento son dos funciones CSS `filter`
  // independientes — se combinan en un solo string para dibujar (ctx.filter
  // solo acepta un valor). "none" se descarta de la combinación porque mezclado
  // con otras funciones ya no es válido como "sin filtro".
  function filtroCombinado(): string {
    const partes = [filtro.css, embellecimiento.css].filter((c) => c !== "none");
    return partes.length > 0 ? partes.join(" ") : "none";
  }

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
      if (idCuadroRef.current) cancelAnimationFrame(idCuadroRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Bloqueo de orientación mientras la cámara está abierta: sin esto, si el
  // celular tiene "Girar pantalla automática" activado, el navegador rota
  // toda esta vista (pensada para formato vertical) al girar el teléfono —
  // algo aparte y sin relación con el botón manual de "Girar imagen" de más
  // abajo. El bloqueo del navegador solo funciona en pantalla completa y no
  // existe en Safari/iOS, así que se ignora en silencio si falla, dejando el
  // botón manual como respaldo universal.
  useEffect(() => {
    // "lock"/"unlock" no están en los tipos DOM de TypeScript (API todavía
    // no estandarizada, ausente en Safari) — se accede vía un tipo local.
    const orientacion = screen.orientation as
      | (ScreenOrientation & { lock?: (o: string) => Promise<void>; unlock?: () => void })
      | undefined;
    const contenedor = contenedorRef.current;
    (async () => {
      try {
        // `await undefined` (cuando el método no existe en este navegador)
        // no lanza excepción -- a diferencia de encadenar `.then()` directo
        // sobre el resultado de un `?.()`, que si el método no existe deja
        // `undefined` y revienta al intentar leer `.then` de él.
        await contenedor?.requestFullscreen?.();
        await orientacion?.lock?.("portrait");
      } catch (err) {
        console.warn("Cámara Express: no se pudo bloquear la orientación", err);
      }
    })();
    return () => {
      orientacion?.unlock?.();
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    };
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
    const angulo = anguloManual;
    const rotado = angulo === 90 || angulo === 270;
    const canvas = document.createElement("canvas");
    canvas.width = rotado ? video.videoHeight : video.videoWidth;
    canvas.height = rotado ? video.videoWidth : video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.filter = filtroCombinado();
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((angulo * Math.PI) / 180);
    ctx.drawImage(video, -video.videoWidth / 2, -video.videoHeight / 2, video.videoWidth, video.videoHeight);
    ctx.restore();
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
    if (idCuadroRef.current) cancelAnimationFrame(idCuadroRef.current);
    grabadoraRef.current?.stop();
    setGrabando(false);
  }

  // Graba desde un canvas 1080x1920 que va dibujando cada cuadro de la
  // cámara ya encajado (contain-fit, con relleno negro) en vez de grabar
  // directo el stream crudo: la cámara casi nunca entrega justo 9:16 pese al
  // "ideal" pedido en obtenerStreamCamara, y sin este paso el video queda
  // como una franja angosta rodeada de negro (igual que ya se resuelve para
  // la foto en FiltrosFoto.tsx, pero acá en vivo cuadro por cuadro).
  function iniciarGrabacion() {
    const stream = streamRef.current;
    const video = videoRef.current;
    if (!stream || !video) return;

    const canvas = document.createElement("canvas");
    canvas.width = ANCHO_HISTORIA;
    canvas.height = ALTO_HISTORIA;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Escala para CUBRIR el lienzo completo (recorta lo que sobre) en vez de
    // encajar con relleno negro — mismo criterio que prepararFotoHistoria en
    // FiltrosFoto.tsx, así el video nunca queda con bordes negros horneados
    // en la imagen, sin importar la proporción real que entregue la cámara.
    function dibujarCuadro() {
      if (!ctx) return;
      if (video && video.videoWidth) {
        // Igual que en tomarFoto: si el teléfono está girado según el
        // acelerómetro, el ancho/alto "efectivo" (post-rotación) es el que
        // hay que cubrir con el lienzo -- pero el drawImage sigue usando las
        // dimensiones ORIGINALES del video, rotado alrededor del centro.
        const angulo = anguloManual;
        const rotado = angulo === 90 || angulo === 270;
        const anchoEfectivo = rotado ? video.videoHeight : video.videoWidth;
        const altoEfectivo = rotado ? video.videoWidth : video.videoHeight;
        const escala = Math.max(ANCHO_HISTORIA / anchoEfectivo, ALTO_HISTORIA / altoEfectivo);
        const anchoDestino = video.videoWidth * escala;
        const altoDestino = video.videoHeight * escala;
        ctx.filter = filtroCombinado();
        ctx.save();
        ctx.translate(ANCHO_HISTORIA / 2, ALTO_HISTORIA / 2);
        ctx.rotate((angulo * Math.PI) / 180);
        ctx.drawImage(video, -anchoDestino / 2, -altoDestino / 2, anchoDestino, altoDestino);
        ctx.restore();
      } else {
        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, ANCHO_HISTORIA, ALTO_HISTORIA);
      }
      idCuadroRef.current = requestAnimationFrame(dibujarCuadro);
    }

    const canvasConStream = canvas as HTMLCanvasElement & { captureStream: (fps?: number) => MediaStream };
    const streamCanvas = canvasConStream.captureStream(30);
    const streamGrabacion = new MediaStream([...streamCanvas.getVideoTracks(), ...stream.getAudioTracks()]);

    const mimeType = TIPOS_VIDEO_CANDIDATOS.find((t) => MediaRecorder.isTypeSupported(t)) ?? "video/webm";
    const grabadora = new MediaRecorder(streamGrabacion, { mimeType });
    fragmentosRef.current = [];
    grabadora.ondataavailable = (ev) => {
      if (ev.data.size > 0) fragmentosRef.current.push(ev.data);
    };
    grabadora.onstop = () => {
      const blob = new Blob(fragmentosRef.current, { type: "video/webm" });
      onCapturado(new File([blob], `historia-video-${Date.now()}.webm`, { type: "video/webm" }));
    };
    grabadoraRef.current = grabadora;
    dibujarCuadro();
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
    <div ref={contenedorRef} className="fixed inset-0 z-50 bg-black" data-no-swipe>
      {error ? (
        <div className="flex h-full flex-col items-center justify-center gap-4 px-6">
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
        // La cámara frontal se ve reflejada como espejo (igual que la vista
        // previa nativa de cualquier celular) — la foto/video que se guarda
        // no queda espejado, porque canvas/MediaRecorder leen el cuadro real
        // de la cámara, no el CSS aplicado acá.
        //
        // La corrección de rotación (anguloManual) NO se aplica acá en vivo a
        // propósito -- se probó y quedaba recortada/deforme dentro del
        // encuadre fijo de la vista previa. Solo se aplica al capturar
        // (tomarFoto/dibujarCuadro), igual que siempre.
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="absolute inset-0 z-0 h-full w-full object-cover"
          style={{
            ...(camaraFrontal ? { transform: "scaleX(-1)" } : null),
            filter: filtroCombinado(),
          }}
        />
      )}

      {/*
        Controles flotando directo sobre la cámara (fondo circular
        semitransparente por ícono), estilo cámara nativa, en vez de barras
        negras sólidas arriba/abajo — mismo patrón que la app de cámara del
        celular.
      */}
      <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between p-3">
        <button
          type="button"
          onClick={cerrar}
          aria-label="Cerrar cámara"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white"
        >
          <IconX size={20} />
        </button>
        {grabando && (
          <span className="rounded-full bg-black/50 px-3 py-1 text-xs text-white">
            {segundos}s / {DURACION_MAXIMA_VIDEO_HISTORIA_SEG}s
          </span>
        )}
        {!error ? (
          <div className="flex items-center gap-2">
            {/* Corrección de orientación 100% manual (sin detección
                automática, ver comentario arriba): gira 90° a la izquierda
                cada toque. */}
            <button
              type="button"
              onClick={() => setAnguloManual((a) => sumarAngulos(a, 270))}
              disabled={grabando}
              aria-label="Girar imagen a la izquierda"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white disabled:opacity-40"
            >
              <IconRotate2 size={20} />
            </button>
            <button
              type="button"
              onClick={girarCamara}
              disabled={!listo || grabando}
              aria-label="Girar cámara"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white disabled:opacity-40"
            >
              <IconRefresh size={20} />
            </button>
          </div>
        ) : (
          <div className="w-9" />
        )}
      </div>

      {!error && !grabando && (
        <div className="absolute right-3 top-16 z-10 flex items-center gap-2">
          {mostrarEmbellecimiento && (
            <div className="flex flex-col gap-1 rounded-app bg-black/55 p-1" data-no-swipe>
              {EMBELLECIMIENTOS.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => {
                    setEmbellecimiento(e);
                    setMostrarEmbellecimiento(false);
                  }}
                  className={`whitespace-nowrap rounded-app px-2.5 py-1 text-[11px] ${
                    embellecimiento.id === e.id ? "bg-fill-primary text-on-primary" : "text-white"
                  }`}
                >
                  {e.nombre}
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => setMostrarEmbellecimiento((v) => !v)}
            aria-label="Embellecimiento"
            className={`flex h-9 w-9 items-center justify-center rounded-full text-white ${
              embellecimiento.id !== "ninguno" ? "bg-fill-primary" : "bg-black/40"
            }`}
          >
            <IconSparkles size={18} />
          </button>
        </div>
      )}

      {!error && (
        <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-4 p-4 pb-6">
          {/* El filtro se aplica en vivo (CSS acá + ctx.filter al dibujar en
              tomarFoto/dibujarCuadro), así que lo que se ve en el encuadre es
              exactamente lo que queda grabado — a diferencia del editor
              posterior (EditorHistoria/FiltrosFoto), donde el filtro de video
              hoy solo es vista previa y no queda horneado en el archivo. */}
          {!grabando && (
            <div className="flex w-full gap-2 overflow-x-auto rounded-full bg-black/40 px-2 py-1.5" data-no-swipe>
              {FILTROS_FOTO.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFiltro(f)}
                  className={`shrink-0 rounded-full px-3 py-1 text-xs ${
                    filtro.id === f.id ? "bg-fill-primary text-on-primary" : "text-white"
                  }`}
                >
                  {f.nombre}
                </button>
              ))}
            </div>
          )}

          {!grabando && !soloFoto && (
            <div className="flex gap-1 rounded-full bg-black/40 p-1">
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
