"use client";

import { useEffect, useRef, useState } from "react";
import { IconAt, IconCheck, IconDisc, IconMapPin, IconMusic, IconPhotoPlus, IconX } from "@tabler/icons-react";
import { apiUpload, ApiError } from "@/lib/api";
import {
  crearHistoria,
  serializarEstiloTexto,
  serializarFotosSticker,
  MAX_MENCIONES_POR_HISTORIA,
  MAX_FOTOS_STICKER_POR_HISTORIA,
  DURACION_MAXIMA_VIDEO_HISTORIA_SEG,
  DURACION_FOTO_HISTORIA_SEG,
  MARCO_FOTO_STICKER_DEFECTO,
  type EstiloTextoHistoria,
  type MarcoFotoStickerId,
} from "@/lib/historias";
import { reverseGeocodificar } from "@/lib/geocodificacion";
import { SelectorUbicacion } from "@/components/SelectorUbicacion";
import { useNoAutofill } from "@/lib/useNoAutofill";
import { useSession } from "@/context/SessionContext";
import { TextoSobreImagen } from "@/components/Historias/TextoSobreImagen";
import { BarraTextoHistoria } from "@/components/Historias/BarraTextoHistoria";
import { FILTROS_FOTO, FiltrosFoto, prepararFotoHistoria, type FiltroFoto } from "@/components/Historias/FiltrosFoto";
import { MencionSobreImagen } from "@/components/Historias/MencionSobreImagen";
import { SelectorMencion } from "@/components/Historias/SelectorMencion";
import { FotoStickerSobreImagen } from "@/components/Historias/FotoStickerSobreImagen";
import { SelectorMarcoFotoSticker } from "@/components/Historias/SelectorMarcoFotoSticker";
import { ZonaEliminarArrastre } from "@/components/Historias/ZonaEliminarArrastre";
import { SelectorMusicaHistoria } from "@/components/Historias/SelectorMusicaHistoria";
import { VideoTrimmer } from "@/components/VideoTrimmer";

const ESTILO_TEXTO_DEFECTO: Omit<EstiloTextoHistoria, "contenido"> = {
  x: 0.5,
  y: 0.5,
  escala: 1,
  rotacion: 0,
  fuente: "Arial, sans-serif",
  color: "#ffffff",
  alineacion: "center",
  fondo: "ninguno",
};

// Los .webm que graba MediaRecorder desde un canvas.captureStream() (Captura
// Express) suelen quedar con la duración del contenedor rota (Infinity/NaN)
// y el video se ve congelado en el primer cuadro hasta que se hace una
// búsqueda — bug conocido de Chrome/Android con este tipo de grabación en
// streaming. El arreglo estándar: forzar un seek al final y volver a 0, lo
// que obliga al navegador a indexar bien el archivo.
function repararVideoStreameado(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve) => {
    if (Number.isFinite(video.duration) && video.duration > 0) {
      resolve();
      return;
    }
    function alActualizarTiempo() {
      video.currentTime = 0;
      video.removeEventListener("timeupdate", alActualizarTiempo);
      resolve();
    }
    video.addEventListener("timeupdate", alActualizarTiempo);
    video.currentTime = 1e101;
  });
}

// El archivo ya llega elegido (BarraHistorias dispara el selector nativo de
// cámara/galería directamente al tocar "+"); este editor solo se encarga de
// validar, previsualizar, agregar texto sobre la imagen y publicar.
export function EditorHistoria({
  archivoInicial,
  token,
  onClose,
  onPublicado,
}: {
  archivoInicial: File;
  token: string | null;
  onClose: () => void;
  onPublicado: () => void;
}) {
  const { sesion } = useSession();
  const contenedorMediaRef = useRef<HTMLDivElement>(null);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [tipo, setTipo] = useState<"foto" | "video" | null>(null);
  const [estiloTexto, setEstiloTexto] = useState<EstiloTextoHistoria | null>(null);
  const [filtro, setFiltro] = useState<FiltroFoto>(FILTROS_FOTO[0]);
  const [menciones, setMenciones] = useState<
    { miembroId: number; nombre: string; x: number; y: number; escala: number }[]
  >([]);
  const [stickers, setStickers] = useState<
    {
      id: string;
      archivo: File;
      previewUrl: string;
      x: number;
      y: number;
      escala: number;
      rotacion: number;
      marco: MarcoFotoStickerId;
    }[]
  >([]);
  // Id de la foto-sticker cuyo selector de marco está abierto (se abre con un
  // toque corto sobre ella, ver onTocar en FotoStickerSobreImagen).
  const [marcoAbiertoId, setMarcoAbiertoId] = useState<string | null>(null);
  // Tacho de basura para eliminar arrastrando (foto-sticker o mención) —
  // compartido entre ambos tipos porque solo se arrastra uno a la vez.
  const [arrastreActivo, setArrastreActivo] = useState(false);
  const [arrastreSobreTacho, setArrastreSobreTacho] = useState(false);
  function onArrastreCambia(activo: boolean, sobreTacho: boolean) {
    setArrastreActivo(activo);
    setArrastreSobreTacho(sobreTacho);
  }
  const inputStickerRef = useRef<HTMLInputElement>(null);
  const [musica, setMusica] = useState<{ url: string; nombre: string; inicioSeg: number } | null>(null);
  // Duración real de la foto/video que se está publicando — la usa el
  // selector de música para saber si la canción elegida dura más que la
  // historia y hace falta pedir el fragmento (ver SelectorInicioMusica).
  // Siempre queda al día antes de que el botón de música sea tocable: se fija
  // junto con previewUrl en los 3 caminos que lo setean (foto, video directo,
  // video recortado).
  const [duracionMediaSeg, setDuracionMediaSeg] = useState(DURACION_FOTO_HISTORIA_SEG);
  const [mostrarSelectorMusica, setMostrarSelectorMusica] = useState(false);
  const audioPreviaRef = useRef<HTMLAudioElement>(null);
  const [mostrarSelectorMencion, setMostrarSelectorMencion] = useState(false);
  const [mostrarInputTexto, setMostrarInputTexto] = useState(false);
  const [borradorTexto, setBorradorTexto] = useState("");
  const noAutofillTexto = useNoAutofill();
  const [ubicacion, setUbicacion] = useState<string | undefined>(undefined);
  const [mostrarSelectorUbicacion, setMostrarSelectorUbicacion] = useState(false);
  const [error, setError] = useState("");
  const [publicando, setPublicando] = useState(false);
  const [publicado, setPublicado] = useState(false);
  const [mostrarRecorte, setMostrarRecorte] = useState(false);
  const [videoRecortadoBlob, setVideoRecortadoBlob] = useState<Blob | null>(null);

  // Vista previa en vivo de la música elegida — lo que se escucha acá al
  // editar es lo mismo que sonará al ver la historia (misma lógica que el
  // filtro de color, que también se previsualiza igual a como queda).
  useEffect(() => {
    const audio = audioPreviaRef.current;
    if (!audio) return;
    if (!musica) {
      audio.pause();
      return;
    }
    audio.src = musica.url;
    const alCargarMetadatos = () => {
      if (musica.inicioSeg) audio.currentTime = musica.inicioSeg;
    };
    audio.addEventListener("loadedmetadata", alCargarMetadatos);
    audio.play().catch(() => {});
    return () => audio.removeEventListener("loadedmetadata", alCargarMetadatos);
  }, [musica]);

  // Ubicación opcional: se autodetecta una vez al abrir el editor, geocodificando
  // la posición GPS real (Nominatim) en vez de un sector fijo — el usuario puede
  // quitarla o cambiarla si no la quiere.
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        reverseGeocodificar(pos.coords.latitude, pos.coords.longitude).then((lugar) => {
          if (lugar) setUbicacion(lugar.nombre);
        });
      },
      () => {
        // sin permiso o sin GPS: simplemente no se sugiere ubicación
      },
      { timeout: 5000 },
    );
  }, []);

  // Valida (duración de video) y prepara la vista previa del archivo recibido.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setError("");
    setFiltro(FILTROS_FOTO[0]);
    setMenciones([]);
    const url = URL.createObjectURL(archivoInicial);
    const esVideo = archivoInicial.type.startsWith("video/");

    if (!esVideo) {
      setPreviewUrl(url);
      setTipo("foto");
      setDuracionMediaSeg(DURACION_FOTO_HISTORIA_SEG);
      return () => URL.revokeObjectURL(url);
    }

    // Video: se valida la duración en el cliente ANTES de subir. Si supera el
    // máximo, en vez de rechazarlo se abre el editor de recorte (VideoTrimmer)
    // para que el usuario elija el fragmento a publicar, sin salir de la app.
    //
    // El timeout de respaldo existe porque en algunos equipos (decodificación
    // por hardware fallando, códec no soportado, etc.) el <video> ni dispara
    // "loadedmetadata" ni "error" — sin esto, el usuario se queda mirando la
    // pantalla sin ningún aviso de que algo salió mal.
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    let resuelto = false;
    const marcarNoLeible = () => {
      if (resuelto) return;
      resuelto = true;
      clearTimeout(timeoutId);
      setError(
        "No se pudo leer este video (formato no compatible o archivo dañado). Probá con otro archivo.",
      );
    };
    const timeoutId = setTimeout(marcarNoLeible, 10000);
    video.onloadedmetadata = async () => {
      if (resuelto) return;
      resuelto = true;
      clearTimeout(timeoutId);
      await repararVideoStreameado(video);
      if (video.duration > DURACION_MAXIMA_VIDEO_HISTORIA_SEG) {
        setMostrarRecorte(true);
        return;
      }
      setPreviewUrl(url);
      setTipo("video");
      setDuracionMediaSeg(video.duration);
    };
    video.onerror = marcarNoLeible;
    video.src = url;
    return () => {
      clearTimeout(timeoutId);
      URL.revokeObjectURL(url);
    };
  }, [archivoInicial]);

  function abrirEdicionTexto() {
    setBorradorTexto(estiloTexto?.contenido ?? "");
    setMostrarInputTexto(true);
  }

  function confirmarTexto() {
    const contenido = borradorTexto.trim();
    if (!contenido) {
      setEstiloTexto(null);
    } else if (estiloTexto) {
      setEstiloTexto({ ...estiloTexto, contenido });
    } else {
      setEstiloTexto({ contenido, ...ESTILO_TEXTO_DEFECTO });
    }
    setMostrarInputTexto(false);
  }

  function onElegirSticker(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    if (inputStickerRef.current) inputStickerRef.current.value = "";
    if (!archivo) return;
    // Nace en la mitad inferior (0.72), lejos del centro (0.5) donde por
    // defecto cae el texto — si nacieran cerca del centro, la Polaroid (que
    // es bastante más grande que un texto o una mención) tapaba el texto por
    // completo apenas se agregaba, dejándolo inalcanzable porque queda
    // debajo en el orden de dibujo. Además, un pequeño escalón vertical y una
    // rotación leve al azar por cada foto nueva, para que no queden todas
    // apiladas exactamente igual (efecto "tirada sobre la mesa").
    const y = Math.min(0.8, 0.72 + stickers.length * 0.05);
    const rotacion = Math.random() * 10 - 5;
    setStickers((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${prev.length}`,
        archivo,
        previewUrl: URL.createObjectURL(archivo),
        x: 0.5,
        y,
        escala: 1,
        rotacion,
        marco: MARCO_FOTO_STICKER_DEFECTO,
      },
    ]);
  }

  function quitarSticker(id: string) {
    setStickers((prev) => {
      const objetivo = prev.find((s) => s.id === id);
      if (objetivo) URL.revokeObjectURL(objetivo.previewUrl);
      return prev.filter((s) => s.id !== id);
    });
    setMarcoAbiertoId((prev) => (prev === id ? null : prev));
  }

  async function publicar() {
    if (!tipo) return;
    setPublicando(true);
    setError("");
    try {
      const archivoASubir: Blob =
        tipo === "video" && videoRecortadoBlob
          ? videoRecortadoBlob
          : tipo === "foto" && previewUrl
            ? await prepararFotoHistoria(previewUrl, filtro.css)
            : archivoInicial;
      const nombreArchivo = videoRecortadoBlob && archivoASubir === videoRecortadoBlob
        ? "recorte.webm"
        : archivoInicial.name;
      const [subida, ...subidasStickers] = await Promise.all([
        apiUpload<{ url: string }>("/uploads", archivoASubir, token, nombreArchivo),
        ...stickers.map((s) => apiUpload<{ url: string }>("/uploads", s.archivo, token, s.archivo.name)),
      ]);
      await crearHistoria(
        {
          tipo,
          mediaUrl: subida.url,
          texto: estiloTexto?.contenido || undefined,
          textoEstilo: estiloTexto ? serializarEstiloTexto(estiloTexto) : undefined,
          fotosSticker: stickers.length
            ? serializarFotosSticker(
                stickers.map((s, i) => ({
                  url: subidasStickers[i].url,
                  x: s.x,
                  y: s.y,
                  escala: s.escala,
                  rotacion: s.rotacion,
                  marco: s.marco,
                })),
              )
            : undefined,
          musicaUrl: musica?.url,
          musicaNombre: musica?.nombre,
          musicaInicioSeg: musica?.inicioSeg || undefined,
          ubicacion,
          menciones: menciones.length
            ? menciones.map((m) => ({ miembroId: m.miembroId, x: m.x, y: m.y, escala: m.escala }))
            : undefined,
        },
        token,
      );
      // Sin modal de confirmación: solo una animación breve antes de cerrar.
      setPublicado(true);
      setTimeout(onPublicado, 700);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo publicar la historia.");
      setPublicando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black" data-no-swipe>
      <div className="flex items-center justify-between p-3">
        <button type="button" onClick={onClose} className="text-text-secondary">
          <IconX size={22} />
        </button>
        <h2 className="text-sm font-semibold text-text-accent">Nueva historia</h2>
        <div className="w-[22px]" />
      </div>

      {publicado ? (
        <div className="animate-historia-exito flex flex-1 flex-col items-center justify-center gap-2">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-fill-primary text-on-primary">
            <IconCheck size={32} />
          </div>
          <p className="text-sm text-text-secondary">Historia publicada</p>
        </div>
      ) : error && !previewUrl ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6">
          <p className="text-center text-sm text-fill-warning">{error}</p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-app border border-border px-4 py-2 text-sm text-text-secondary"
          >
            Cerrar
          </button>
        </div>
      ) : !previewUrl ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-text-secondary">Cargando...</p>
        </div>
      ) : (
        <div className="relative flex min-h-0 flex-1 flex-col">
          <div ref={contenedorMediaRef} className="relative min-h-0 flex-1 overflow-hidden">
            {tipo === "video" ? (
              <video
                src={previewUrl}
                className="h-full w-full object-contain"
                autoPlay
                muted
                loop
                playsInline
                onLoadedMetadata={(e) => {
                  const v = e.currentTarget;
                  repararVideoStreameado(v).then(() => v.play().catch(() => {}));
                }}
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt="Vista previa de la historia"
                className="h-full w-full object-contain"
                style={{ filter: filtro.css }}
              />
            )}

            {ubicacion ? (
              <div className="absolute left-3 top-3 flex items-center gap-1 rounded-full bg-black/50 px-3 py-1 text-xs text-white">
                <IconMapPin size={14} />
                {ubicacion}
                <button
                  type="button"
                  onClick={() => setMostrarSelectorUbicacion(true)}
                  className="ml-1 underline"
                >
                  Cambiar
                </button>
                <button
                  type="button"
                  onClick={() => setUbicacion(undefined)}
                  className="text-text-secondary underline"
                >
                  Quitar
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setMostrarSelectorUbicacion(true)}
                className="absolute left-3 top-3 flex items-center gap-1 rounded-full bg-black/50 px-3 py-1 text-xs text-white"
              >
                <IconMapPin size={14} />
                Agregar ubicación
              </button>
            )}

            {/* Botón "Aa": único punto de entrada para escribir o reescribir el
                texto, siempre visible sobre la imagen (esquina opuesta a la
                ubicación) — igual que el editor de historias de Instagram. */}
            <button
              type="button"
              onClick={abrirEdicionTexto}
              aria-label="Agregar texto"
              className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-base font-bold text-white"
            >
              Aa
            </button>

            {/* Botón "@": misma dinámica que "Aa" (un toque abre el selector,
                el resultado queda arrastrable/pellizcable sobre la imagen),
                ubicado justo debajo para que se lea como parte del mismo
                grupo de controles. Hasta MAX_MENCIONES_POR_HISTORIA personas. */}
            <button
              type="button"
              onClick={() => {
                if (menciones.length >= MAX_MENCIONES_POR_HISTORIA) {
                  setError(`Puedes mencionar hasta ${MAX_MENCIONES_POR_HISTORIA} personas por historia.`);
                  return;
                }
                setMostrarSelectorMencion(true);
              }}
              aria-label="Mencionar a alguien"
              className="absolute right-3 top-14 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white"
            >
              <IconAt size={18} />
            </button>

            {/* Botón para pegar una foto "Polaroid" sobre la imagen (estilo
                Instagram), tercer control del mismo grupo que "Aa" y "@". */}
            <button
              type="button"
              onClick={() => {
                if (stickers.length >= MAX_FOTOS_STICKER_POR_HISTORIA) {
                  setError(`Puedes agregar hasta ${MAX_FOTOS_STICKER_POR_HISTORIA} fotos por historia.`);
                  return;
                }
                inputStickerRef.current?.click();
              }}
              aria-label="Agregar una foto sobre la imagen"
              className="absolute right-3 top-[6.25rem] z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white"
            >
              <IconPhotoPlus size={18} />
            </button>
            <input
              ref={inputStickerRef}
              type="file"
              accept="image/*"
              onChange={onElegirSticker}
              className="hidden"
            />

            {/* Cuarto control del mismo grupo — elegir música del catálogo
                propio de la app. Reemplaza cualquier pista ya elegida. */}
            <button
              type="button"
              onClick={() => setMostrarSelectorMusica(true)}
              aria-label="Agregar música"
              className={`absolute right-3 top-[9rem] z-10 flex h-9 w-9 items-center justify-center rounded-full text-white ${
                musica ? "bg-fill-primary" : "bg-black/50"
              }`}
            >
              <IconMusic size={18} />
            </button>
            {/* Se escucha en vivo mientras se edita — lo que se oye acá es lo
                mismo que sonará al publicar (igual criterio que el filtro de
                color, previsualizado tal cual queda). El <video> de arriba ya
                está silenciado siempre en este editor, así que no compite. */}
            <audio ref={audioPreviaRef} loop />

            {mostrarSelectorMusica && (
              <SelectorMusicaHistoria
                duracionHistoriaSeg={duracionMediaSeg}
                onCerrar={() => setMostrarSelectorMusica(false)}
                onSeleccionar={(c, inicioSeg) => {
                  setMusica({ url: c.archivo, nombre: c.nombre, inicioSeg });
                  setMostrarSelectorMusica(false);
                }}
              />
            )}

            {musica && (
              <div className="absolute inset-x-3 bottom-3 z-10 flex items-center gap-2 rounded-full bg-black/55 px-3 py-1.5">
                <IconDisc size={16} className="shrink-0 text-text-accent" />
                <p className="min-w-0 flex-1 truncate text-xs font-medium text-white">{musica.nombre}</p>
                <button
                  type="button"
                  onClick={() => setMusica(null)}
                  aria-label="Quitar música"
                  className="shrink-0 text-white/70"
                >
                  <IconX size={14} />
                </button>
              </div>
            )}

            {/* Las fotos-sticker van ANTES del texto a propósito: el texto debe
                quedar siempre arriba/legible sin importar dónde se arrastre
                cada elemento — si se dibujaran después, cualquier foto que
                pasara sobre el texto lo taparía sin poder recuperarlo (queda
                debajo también para los toques, no solo visualmente). */}
            {stickers.map((s) => (
              <FotoStickerSobreImagen
                key={s.id}
                url={s.previewUrl}
                x={s.x}
                y={s.y}
                escala={s.escala}
                rotacion={s.rotacion}
                marco={s.marco}
                onCambiar={(valores) =>
                  setStickers((prev) => prev.map((p) => (p.id === s.id ? { ...p, ...valores } : p)))
                }
                onQuitar={() => quitarSticker(s.id)}
                onTocar={() => setMarcoAbiertoId((prev) => (prev === s.id ? null : s.id))}
                onArrastreCambia={onArrastreCambia}
                contenedorRef={contenedorMediaRef}
              />
            ))}

            {estiloTexto && (
              <TextoSobreImagen
                estilo={estiloTexto}
                onChange={setEstiloTexto}
                contenedorRef={contenedorMediaRef}
              />
            )}

            {menciones.map((m) => (
              <MencionSobreImagen
                key={m.miembroId}
                nombre={m.nombre}
                x={m.x}
                y={m.y}
                escala={m.escala}
                onCambiar={(valores) =>
                  setMenciones((prev) =>
                    prev.map((p) => (p.miembroId === m.miembroId ? { ...p, ...valores } : p)),
                  )
                }
                onQuitar={() =>
                  setMenciones((prev) => prev.filter((p) => p.miembroId !== m.miembroId))
                }
                onArrastreCambia={onArrastreCambia}
                contenedorRef={contenedorMediaRef}
              />
            ))}

            <ZonaEliminarArrastre activo={arrastreActivo} sobreTacho={arrastreSobreTacho} />

            {mostrarSelectorMencion && (
              <SelectorMencion
                token={token}
                excluirIds={[sesion?.id, ...menciones.map((m) => m.miembroId)].filter(
                  (id): id is number => id != null,
                )}
                onCerrar={() => setMostrarSelectorMencion(false)}
                onSeleccionar={(m) => {
                  // Pequeño escalón vertical por cada mención nueva, para que
                  // no queden todas apiladas exactamente en el mismo punto.
                  const y = Math.min(0.85, 0.5 + menciones.length * 0.1);
                  setMenciones((prev) => [...prev, { miembroId: m.id, nombre: m.nombre, x: 0.5, y, escala: 1 }]);
                  setMostrarSelectorMencion(false);
                }}
              />
            )}

            {mostrarSelectorUbicacion && (
              <SelectorUbicacion
                onCerrar={() => setMostrarSelectorUbicacion(false)}
                onSeleccionar={(nombre) => {
                  setUbicacion(nombre);
                  setMostrarSelectorUbicacion(false);
                }}
              />
            )}

            {mostrarInputTexto && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/70 px-6">
                <textarea
                  autoFocus
                  autoComplete="off"
                  {...noAutofillTexto}
                  value={borradorTexto}
                  onChange={(e) => setBorradorTexto(e.target.value.slice(0, 200))}
                  placeholder="Escribe algo..."
                  rows={3}
                  className="w-full max-w-xs resize-none rounded-app border border-white/30 bg-transparent px-3 py-2 text-center text-lg text-white outline-none placeholder:text-white/50"
                />
                <button
                  type="button"
                  onClick={confirmarTexto}
                  className="btn-hero rounded-app px-5 py-2 text-sm"
                >
                  Listo
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2 p-3">
            {marcoAbiertoId &&
              (() => {
                const sticker = stickers.find((s) => s.id === marcoAbiertoId);
                if (!sticker) return null;
                return (
                  <SelectorMarcoFotoSticker
                    previewUrl={sticker.previewUrl}
                    marcoActual={sticker.marco}
                    onCambiar={(marco) =>
                      setStickers((prev) => prev.map((p) => (p.id === marcoAbiertoId ? { ...p, marco } : p)))
                    }
                    onCerrar={() => setMarcoAbiertoId(null)}
                  />
                );
              })()}
            {tipo === "foto" && (
              <FiltrosFoto previewUrl={previewUrl} filtroActual={filtro} onCambiar={setFiltro} />
            )}
            {estiloTexto && (
              <BarraTextoHistoria
                estilo={estiloTexto}
                onChange={setEstiloTexto}
                onEditarContenido={abrirEdicionTexto}
                onQuitar={() => setEstiloTexto(null)}
              />
            )}
            {error && <p className="text-xs text-fill-warning">{error}</p>}
            <button
              type="button"
              disabled={publicando}
              onClick={publicar}
              className="btn-hero rounded-app px-4 py-3 text-sm disabled:opacity-60"
            >
              {publicando ? "Publicando..." : "Compartir"}
            </button>
          </div>
        </div>
      )}

      {mostrarRecorte && (
        <VideoTrimmer
          archivo={archivoInicial}
          duracionMaxima={DURACION_MAXIMA_VIDEO_HISTORIA_SEG}
          onConfirmar={(blob, duracionSeg) => {
            setPreviewUrl(URL.createObjectURL(blob));
            setVideoRecortadoBlob(blob);
            setTipo("video");
            setDuracionMediaSeg(duracionSeg);
            setMostrarRecorte(false);
          }}
          onCancelar={onClose}
        />
      )}
    </div>
  );
}
