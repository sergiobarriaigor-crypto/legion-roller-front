"use client";

import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import {
  IconShare,
  IconUpload,
  IconCube3dSphere,
  IconX,
  IconPhoto,
  IconTrash,
  IconMusic,
  IconVolume,
  IconVolumeOff,
  IconCirclePlus,
} from "@tabler/icons-react";
import { apiGet, apiUpload, apiPost, ApiError } from "@/lib/api";
import {
  generarTarjetaRecorrido,
  generarVideoRecorrido,
  DURACION_VIDEO_ESTIMADA_SEG,
  type DatosTarjetaRecorrido,
} from "@/lib/tarjetaRecorrido";
import { EditorEncuadreFoto } from "@/components/EditorEncuadreFoto";
import {
  solicitarFlyover,
  estadoFlyoverPorRecorrido,
  estadoFlyoverPorId,
  type EstadoFlyover,
  type EstiloFlyover,
} from "@/lib/flyover";
import { useNoAutofill } from "@/lib/useNoAutofill";
import { compartirArchivoNativo } from "@/lib/compartirNativo";
import { useSession } from "@/context/SessionContext";
import { crearHistoria } from "@/lib/historias";
import { SelectorMusicaHistoria } from "@/components/Historias/SelectorMusicaHistoria";
import type { CancionHistoria } from "@/lib/musicaHistorias";

type Estado = "editando" | "publicando";
type Tab = "imagen" | "video" | "video3d";

export function CompartirRecorridoModal({
  datos,
  recorridoId,
  token,
  onClose,
  onPublicado,
}: {
  datos: DatosTarjetaRecorrido;
  recorridoId: number;
  token: string | null;
  onClose: () => void;
  onPublicado?: () => void;
}) {
  const { sesion } = useSession();
  // Foto de perfil para la portada del video (ver generarVideo) -- no viaja
  // en la sesión (esa solo guarda nombre/rol/token), así que se pide una
  // vez al abrir el modal, igual que hace MapaView.tsx para su propio uso.
  const [miFotoUrl, setMiFotoUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!token) return;
    apiGet<{ fotoUrl: string | null }>("/perfil/mio", token)
      .then((p) => setMiFotoUrl(p.fotoUrl))
      .catch(() => {});
  }, [token]);

  const [titulo, setTitulo] = useState("");
  const [comentario, setComentario] = useState("");
  const noAutofillTitulo = useNoAutofill();
  const noAutofillComentario = useNoAutofill();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [cargandoInicial, setCargandoInicial] = useState(true);
  const [estado, setEstado] = useState<Estado>("editando");
  const [error, setError] = useState("");
  // Solo importa para "video3d": ese caso hace un fetch() del mp4 (puede
  // pesar varios MB) antes de poder compartirlo -- sin este estado, el botón
  // no daba ninguna señal mientras tanto y parecía que "no hacía nada".
  const [compartiendo, setCompartiendo] = useState(false);
  const blobUrlRef = useRef<string | null>(null);
  const generacionIdRef = useRef(0);
  const primeraVezRef = useRef(true);

  // Video para redes sociales: es una pieza aparte (no depende de
  // título/comentario, que no se dibujan en la tarjeta), se genera una sola
  // vez bajo demanda al entrar a la pestaña "Video" — a diferencia de la
  // imagen no se regenera solo, porque tarda varios segundos reales.
  const [tab, setTab] = useState<Tab>("imagen");
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
  const [generandoVideo, setGenerandoVideo] = useState(false);
  const [progresoVideo, setProgresoVideo] = useState(0);
  const [errorVideo, setErrorVideo] = useState("");
  const videoBlobUrlRef = useRef<string | null>(null);
  // Fotos opcionales del video (nunca obligatorias, ver tarjetaRecorrido.ts)
  // -- se eligen ANTES de generar, en la pantalla de configuración de la
  // pestaña "Video". Las dos secciones son independientes entre sí (se puede
  // elegir una, la otra, ambas, o ninguna): "Foto de cierre" (0 o 1, a
  // pantalla completa en el cuadro final) y "Fotos en el mapa" (0 a 3, pines
  // repartidos por distancia). Cada foto elegida pasa primero por un editor
  // de encuadre (arrastrar/zoom, ver EditorEncuadreFoto) antes de sumarse --
  // archivoEditandoFoto es el File crudo mientras ese editor está abierto,
  // tipoFotoEditando indica a cuál de las dos secciones pertenece (define el
  // aspecto del recorte: vertical para la de cierre, circular para el pin).
  const [fotoFinalDataUrl, setFotoFinalDataUrl] = useState<string | null>(null);
  const [fotosPinDataUrl, setFotosPinDataUrl] = useState<string[]>([]);
  const [archivoEditandoFoto, setArchivoEditandoFoto] = useState<File | null>(null);
  const [tipoFotoEditando, setTipoFotoEditando] = useState<"final" | "pin" | null>(null);
  const inputFotoFinalRef = useRef<HTMLInputElement>(null);
  const inputFotoPinRef = useRef<HTMLInputElement>(null);

  // Música de fondo opcional para el video (mismo catálogo/selector que ya
  // usan las Historias, ver SelectorMusicaHistoria) -- se elige ANTES de
  // generar, igual que las fotos. Sin canción, el video sale mudo como
  // siempre.
  const [musicaElegida, setMusicaElegida] = useState<{ cancion: CancionHistoria; inicioSeg: number } | null>(null);
  const [mostrarSelectorMusica, setMostrarSelectorMusica] = useState(false);
  // La vista previa arranca silenciada (autoplay con audio suele bloquearlo
  // el navegador) -- este botón deja escuchar la mezcla real antes de
  // publicarla en cualquier lado.
  const [previewSilenciado, setPreviewSilenciado] = useState(true);

  // Publicar el video (a diferencia de la imagen, que solo tiene "Publicar
  // en Post") también puede ir a Historia -- estado aparte porque ambas
  // acciones son independientes entre sí (no se bloquean mutuamente).
  const [publicandoHistoria, setPublicandoHistoria] = useState(false);

  // Menú "+" de opciones para compartir (Imagen/Video) -- reemplaza los
  // botones apilados de antes por un menú flotante chico, anclado al botón,
  // con las opciones que apliquen a la pestaña activa. posMenuCompartir se
  // mide en el momento de abrir (coordenadas reales del botón en pantalla)
  // para que el menú aparezca justo arriba de él.
  const [menuCompartirAbierto, setMenuCompartirAbierto] = useState(false);
  const [posMenuCompartir, setPosMenuCompartir] = useState<{ top: number; left: number } | null>(null);
  const botonCompartirRef = useRef<HTMLButtonElement>(null);

  // Video 3D (flyover): a diferencia del video de arriba, se renderiza en el
  // servidor (navegador headless + MapLibre) porque muchos celulares no
  // soportan WebGL/GPU -- tarda 1-3 min, así que en vez de una barra de
  // progreso bloqueante se dispara el pedido y se hace polling del estado,
  // permitiendo que el usuario cierre el modal mientras tanto (el aviso de
  // "listo" llega igual por push).
  const [estadoFlyover, setEstadoFlyover] = useState<EstadoFlyover | null>(null);
  const [cargandoFlyover, setCargandoFlyover] = useState(false);
  const [errorFlyover, setErrorFlyover] = useState("");
  const [estiloFlyover, setEstiloFlyover] = useState<EstiloFlyover>("edificios");
  const pollingFlyoverRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Genera la tarjeta apenas se abre el modal (sin espera), y la vuelve a
  // generar cuando el usuario cambia el título/comentario, pero con un
  // pequeño debounce (600ms sin escribir) — regenerar en cada tecla hacía
  // parpadear toda la vista previa a cada carácter. Mientras se regenera,
  // la imagen anterior se mantiene visible; recién se reemplaza cuando la
  // nueva está lista, así nunca queda en blanco.
  useEffect(() => {
    const demora = primeraVezRef.current ? 0 : 600;
    primeraVezRef.current = false;

    const timeoutId = setTimeout(() => {
      const idGeneracion = ++generacionIdRef.current;
      generarTarjetaRecorrido({ ...datos, titulo: titulo || undefined, comentario: comentario || undefined })
        .then((nuevoBlob) => {
          if (generacionIdRef.current !== idGeneracion) return; // ya hay una más nueva en curso
          if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
          const url = URL.createObjectURL(nuevoBlob);
          blobUrlRef.current = url;
          setBlob(nuevoBlob);
          setPreviewUrl(url);
        })
        .catch(() => {
          if (generacionIdRef.current === idGeneracion) {
            setError("No se pudo generar la tarjeta del recorrido.");
          }
        })
        .finally(() => {
          if (generacionIdRef.current === idGeneracion) setCargandoInicial(false);
        });
    }, demora);

    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [titulo, comentario]);

  useEffect(() => {
    return () => {
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
      if (videoBlobUrlRef.current) URL.revokeObjectURL(videoBlobUrlRef.current);
      detenerPollingFlyover();
    };
  }, []);

  function detenerPollingFlyover() {
    if (pollingFlyoverRef.current) {
      clearInterval(pollingFlyoverRef.current);
      pollingFlyoverRef.current = null;
    }
  }

  function iniciarPollingFlyover(id: number) {
    detenerPollingFlyover();
    pollingFlyoverRef.current = setInterval(async () => {
      if (!token) return;
      try {
        const estado = await estadoFlyoverPorId(id, token);
        setEstadoFlyover(estado);
        if (estado.estado === "listo" || estado.estado === "error") {
          detenerPollingFlyover();
        }
      } catch {
        detenerPollingFlyover();
      }
    }, 4000);
  }

  async function consultarEstadoFlyoverInicial() {
    if (!token) return;
    setCargandoFlyover(true);
    try {
      const estado = await estadoFlyoverPorRecorrido(recorridoId, token);
      setEstadoFlyover(estado);
      if (estado && (estado.estado === "pendiente" || estado.estado === "procesando")) {
        iniciarPollingFlyover(estado.id);
      }
    } catch {
      // Sin video previo (o error de red) -- se deja en null, el usuario puede generar uno nuevo.
    } finally {
      setCargandoFlyover(false);
    }
  }

  async function generarFlyover() {
    if (!token || cargandoFlyover) return;
    setCargandoFlyover(true);
    setErrorFlyover("");
    try {
      const estado = await solicitarFlyover(recorridoId, token, estiloFlyover);
      setEstadoFlyover(estado);
      if (estado.estado === "pendiente" || estado.estado === "procesando") {
        iniciarPollingFlyover(estado.id);
      }
    } catch (err) {
      setErrorFlyover(
        err instanceof ApiError ? err.message : "No se pudo iniciar la generación del video 3D.",
      );
    } finally {
      setCargandoFlyover(false);
    }
  }

  async function generarVideo() {
    if (videoBlob || generandoVideo) return;
    setGenerandoVideo(true);
    setErrorVideo("");
    setProgresoVideo(0);
    try {
      const nuevoBlob = await generarVideoRecorrido(datos, {
        onProgreso: setProgresoVideo,
        fotoFinalDataUrl: fotoFinalDataUrl ?? undefined,
        fotosPinDataUrl: fotosPinDataUrl.length ? fotosPinDataUrl : undefined,
        avatarUrl: miFotoUrl,
        nombreUsuario: sesion?.nombre,
        musicaUrl: musicaElegida?.cancion.archivo,
        musicaInicioSeg: musicaElegida?.inicioSeg,
      });
      if (videoBlobUrlRef.current) URL.revokeObjectURL(videoBlobUrlRef.current);
      const url = URL.createObjectURL(nuevoBlob);
      videoBlobUrlRef.current = url;
      setVideoBlob(nuevoBlob);
      setVideoUrl(url);
    } catch (err) {
      console.error("[video-error]", err);
      setErrorVideo("No se pudo generar el video en este navegador. Probá desde el celular.");
    } finally {
      setGenerandoVideo(false);
    }
  }

  function generarVideoDeNuevo() {
    if (videoBlobUrlRef.current) URL.revokeObjectURL(videoBlobUrlRef.current);
    videoBlobUrlRef.current = null;
    setVideoBlob(null);
    setVideoUrl(null);
    setErrorVideo("");
  }

  function manejarSeleccionFotoFinal(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo) return;
    setTipoFotoEditando("final");
    setArchivoEditandoFoto(archivo);
  }

  function manejarSeleccionFotoPin(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo) return;
    setTipoFotoEditando("pin");
    setArchivoEditandoFoto(archivo);
  }

  function confirmarFotoEditada(dataUrl: string) {
    if (tipoFotoEditando === "final") {
      setFotoFinalDataUrl(dataUrl);
    } else {
      setFotosPinDataUrl((prev) => [...prev, dataUrl].slice(0, 3));
    }
    setArchivoEditandoFoto(null);
    setTipoFotoEditando(null);
  }

  function quitarFotoPin(indice: number) {
    setFotosPinDataUrl((prev) => prev.filter((_, i) => i !== indice));
  }

  function elegirTab(nuevoTab: Tab) {
    setTab(nuevoTab);
    if (nuevoTab === "video3d" && estadoFlyover === null && !cargandoFlyover) {
      consultarEstadoFlyoverInicial();
    }
  }

  function alternarMenuCompartir() {
    if (menuCompartirAbierto) {
      setMenuCompartirAbierto(false);
      return;
    }
    const rect = botonCompartirRef.current?.getBoundingClientRect();
    if (rect) setPosMenuCompartir({ top: rect.top - 8, left: rect.left + rect.width / 2 });
    setMenuCompartirAbierto(true);
  }

  function ejecutarYcerrar(accion: () => void) {
    setMenuCompartirAbierto(false);
    accion();
  }

  async function publicarEnPost() {
    const esVideo = tab === "video";
    const archivo = esVideo ? videoBlob : blob;
    if (!token || !archivo) return;
    setEstado("publicando");
    setError("");
    try {
      const nombreArchivo = esVideo ? "recorrido.webm" : "recorrido.png";
      const subida = await apiUpload<{ url: string }>("/uploads", archivo, token, nombreArchivo);
      await apiPost(
        "/posts",
        {
          titulo: titulo.trim() || "Mi recorrido en Legión Roller",
          resena: comentario.trim() || "¡Otro recorrido completado! 🛼",
          ubicacion: datos.sector,
          ...(esVideo ? { tipo: "video", videoUrl: subida.url } : { fotos: [subida.url] }),
        },
        token,
      );
      onPublicado?.();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo publicar el recorrido.");
      setEstado("editando");
    }
  }

  // Solo tiene sentido en la pestaña "Video" -- no existe un equivalente
  // "compartir la imagen en Historia" porque las Historias de esta app son
  // siempre foto/video capturado por el usuario, no una tarjeta generada.
  async function compartirEnHistoria() {
    if (!token || !videoBlob) return;
    setPublicandoHistoria(true);
    setError("");
    try {
      const subida = await apiUpload<{ url: string }>("/uploads", videoBlob, token, "recorrido.webm");
      await crearHistoria({ tipo: "video", mediaUrl: subida.url, ubicacion: datos.sector }, token);
      onPublicado?.();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo compartir en tu historia.");
    } finally {
      setPublicandoHistoria(false);
    }
  }

  async function compartirEnRedes() {
    setError("");
    setCompartiendo(true);
    try {
      await compartirEnRedesInterno();
    } finally {
      setCompartiendo(false);
    }
  }

  async function compartirEnRedesInterno() {
    let blobActivo: Blob | null;
    let nombreArchivo: string;
    let tipoArchivo: string;

    if (tab === "video3d") {
      if (!estadoFlyover?.videoUrl) return;
      try {
        const controlador = new AbortController();
        const idTimeout = setTimeout(() => controlador.abort(), 20000);
        try {
          const res = await fetch(estadoFlyover.videoUrl, { signal: controlador.signal });
          if (!res.ok) throw new Error("respuesta no OK");
          blobActivo = await res.blob();
        } finally {
          clearTimeout(idTimeout);
        }
      } catch {
        setError("No se pudo descargar el video 3D para compartir. Probá de nuevo.");
        return;
      }
      nombreArchivo = "recorrido-3d-legion-roller.mp4";
      tipoArchivo = "video/mp4";
    } else {
      const esVideo = tab === "video";
      blobActivo = esVideo ? videoBlob : blob;
      nombreArchivo = esVideo ? "recorrido-legion-roller.webm" : "recorrido-legion-roller.png";
      tipoArchivo = esVideo ? "video/webm" : "image/png";
    }
    if (!blobActivo) return;

    const archivo = new File([blobActivo], nombreArchivo, { type: tipoArchivo });
    const textoCompartir = [titulo.trim(), comentario.trim()].filter(Boolean).join("\n");

    // En la app nativa (Capacitor), la Web Share API y el fallback de
    // descarga de más abajo fallan en silencio -- ver compartirNativo.ts.
    if (Capacitor.isNativePlatform()) {
      try {
        await compartirArchivoNativo(archivo, { titulo: titulo || "Mi recorrido", texto: textoCompartir });
      } catch {
        setError("No se pudo compartir el archivo. Probá de nuevo.");
      }
      return;
    }

    try {
      if (
        typeof navigator.share === "function" &&
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [archivo] })
      ) {
        await navigator.share({ files: [archivo], title: titulo || "Mi recorrido", text: textoCompartir });
        return;
      }
    } catch {
      // el usuario canceló el panel de compartir, o el navegador lo rechazó: seguimos con la descarga
    }

    // Si no hay soporte para compartir archivos (navegador de escritorio, etc.),
    // descargamos el archivo para que el usuario lo comparta a mano.
    const enlace = document.createElement("a");
    enlace.href = URL.createObjectURL(blobActivo);
    enlace.download = nombreArchivo;
    enlace.click();
    URL.revokeObjectURL(enlace.href);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6"
      onClick={onClose}
    >
      <div
        className="card flex w-full max-w-xs flex-col gap-3 p-5"
        style={{ maxHeight: "88vh", overflowY: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-accent">Compartir recorrido</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="text-text-secondary">
            <IconX size={18} />
          </button>
        </div>

        <div className="flex gap-1.5 rounded-app bg-surface-2 p-1">
          <button
            type="button"
            onClick={() => elegirTab("imagen")}
            className={`flex-1 rounded-app py-1.5 text-xs font-semibold ${
              tab === "imagen" ? "bg-fill-primary text-on-primary" : "text-text-secondary"
            }`}
          >
            Imagen
          </button>
          <button
            type="button"
            onClick={() => elegirTab("video")}
            className={`flex-1 rounded-app py-1.5 text-xs font-semibold ${
              tab === "video" ? "bg-fill-primary text-on-primary" : "text-text-secondary"
            }`}
          >
            Video
          </button>
          <button
            type="button"
            onClick={() => elegirTab("video3d")}
            className={`flex flex-1 items-center justify-center gap-1 rounded-app py-1.5 text-xs font-semibold ${
              tab === "video3d" ? "bg-fill-primary text-on-primary" : "text-text-secondary"
            }`}
          >
            <IconCube3dSphere size={13} />
            3D
          </button>
        </div>

        {/* Mientras se eligen fotos/música (antes de generar), el contenido ya
            no entra en 320px fijos -- en vez de recortarlo (overflow-hidden),
            se le da scroll propio para esta sub-pantalla, así "Generar video"
            nunca queda tapado sin forma de llegar a él. La vista previa real
            (imagen, video ya generado, 3D) sigue con su tamaño fijo normal. */}
        <div
          className={`relative flex rounded-app bg-surface-2 ${
            tab === "video" && !generandoVideo && !videoUrl
              ? "items-start justify-center overflow-y-auto py-3"
              : "items-center justify-center overflow-hidden"
          }`}
          style={{ height: 320 }}
        >
          {tab === "imagen" && (
            <>
              {!previewUrl && <p className="text-xs text-text-secondary">Generando tarjeta...</p>}
              {previewUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewUrl} alt="Vista previa del recorrido" className="h-full w-full object-contain" />
              )}
            </>
          )}
          {tab === "video" && (
            <>
              {generandoVideo && (
                <p className="px-6 text-center text-xs text-text-secondary">
                  Generando video... {Math.round(progresoVideo * 100)}%
                </p>
              )}
              {!generandoVideo && videoUrl && (
                <>
                  <video
                    src={videoUrl}
                    className="h-full w-full object-contain"
                    autoPlay
                    loop
                    muted={previewSilenciado}
                    playsInline
                  />
                  {musicaElegida && (
                    <button
                      type="button"
                      onClick={() => setPreviewSilenciado((s) => !s)}
                      aria-label={previewSilenciado ? "Activar sonido" : "Silenciar"}
                      className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white"
                    >
                      {previewSilenciado ? <IconVolumeOff size={16} /> : <IconVolume size={16} />}
                    </button>
                  )}
                </>
              )}
              {!generandoVideo && !videoUrl && (
                <div className="flex flex-col items-center gap-3 px-6 text-center">
                  {errorVideo && <p className="text-xs text-fill-warning">{errorVideo}</p>}
                  <p className="text-xs text-text-secondary">
                    El mapa se dibuja solo, con tu velocidad máxima marcada en el recorrido.
                  </p>
                  <input
                    ref={inputFotoFinalRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={manejarSeleccionFotoFinal}
                  />
                  <input
                    ref={inputFotoPinRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={manejarSeleccionFotoPin}
                  />
                  {archivoEditandoFoto && (
                    <EditorEncuadreFoto
                      archivo={archivoEditandoFoto}
                      aspecto={tipoFotoEditando === "final" ? "vertical" : "circular"}
                      onConfirmar={confirmarFotoEditada}
                      onCancelar={() => {
                        setArchivoEditandoFoto(null);
                        setTipoFotoEditando(null);
                      }}
                    />
                  )}
                  {!archivoEditandoFoto && (
                    <>
                      {/* 3 tiles chicos en vez de 3 bloques apilados con
                          título -- cada uno agrega su tipo (deshabilitado al
                          llegar al máximo); lo ya elegido se ve en la tira de
                          miniaturas de abajo, no acá. */}
                      <div className="grid w-full grid-cols-3 gap-2">
                        <button
                          type="button"
                          disabled={!!fotoFinalDataUrl}
                          onClick={() => inputFotoFinalRef.current?.click()}
                          className="flex flex-col items-center gap-1 rounded-app border border-border-accent py-2 text-text-accent disabled:opacity-30"
                        >
                          <IconPhoto size={18} />
                          <span className="text-[10px]">Cierre</span>
                        </button>
                        <button
                          type="button"
                          disabled={fotosPinDataUrl.length >= 3}
                          onClick={() => inputFotoPinRef.current?.click()}
                          className="flex flex-col items-center gap-1 rounded-app border border-border-accent py-2 text-text-accent disabled:opacity-30"
                        >
                          <IconPhoto size={18} />
                          <span className="text-[10px]">En el mapa</span>
                        </button>
                        <button
                          type="button"
                          disabled={!!musicaElegida}
                          onClick={() => setMostrarSelectorMusica(true)}
                          className="flex flex-col items-center gap-1 rounded-app border border-border-accent py-2 text-text-accent disabled:opacity-30"
                        >
                          <IconMusic size={18} />
                          <span className="text-[10px]">Música</span>
                        </button>
                      </div>
                      {(fotoFinalDataUrl || fotosPinDataUrl.length > 0 || musicaElegida) && (
                        <div className="flex flex-wrap items-center justify-center gap-2">
                          {fotoFinalDataUrl && (
                            <div className="relative">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={fotoFinalDataUrl}
                                alt="Foto de cierre elegida"
                                className="h-10 w-10 rounded-app border border-border-accent object-cover"
                              />
                              <button
                                type="button"
                                onClick={() => setFotoFinalDataUrl(null)}
                                aria-label="Quitar foto de cierre"
                                className="absolute -right-1 -top-1 rounded-full bg-surface-2 p-0.5 text-text-secondary"
                              >
                                <IconTrash size={10} />
                              </button>
                            </div>
                          )}
                          {fotosPinDataUrl.map((foto, i) => (
                            <div key={i} className="relative">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={foto}
                                alt="Foto elegida"
                                className="h-10 w-10 rounded-full border border-border-accent object-cover"
                              />
                              <button
                                type="button"
                                onClick={() => quitarFotoPin(i)}
                                aria-label="Quitar foto"
                                className="absolute -right-1 -top-1 rounded-full bg-surface-2 p-0.5 text-text-secondary"
                              >
                                <IconTrash size={10} />
                              </button>
                            </div>
                          ))}
                          {musicaElegida && (
                            <div className="flex items-center gap-1 rounded-full border border-border-accent px-2 py-1 text-[10px] text-text-accent">
                              <IconMusic size={12} />
                              <span className="max-w-[70px] truncate">{musicaElegida.cancion.nombre}</span>
                              <button
                                type="button"
                                onClick={() => setMusicaElegida(null)}
                                aria-label="Quitar música"
                                className="text-text-secondary"
                              >
                                <IconTrash size={10} />
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={generarVideo}
                        className="btn-hero rounded-app px-4 py-1.5 text-xs"
                      >
                        Generar video
                      </button>
                    </>
                  )}
                </div>
              )}
            </>
          )}
          {tab === "video3d" && (
            <>
              {cargandoFlyover && (
                <p className="px-6 text-center text-xs text-text-secondary">Un momento...</p>
              )}
              {!cargandoFlyover && !estadoFlyover && !errorFlyover && (
                <div className="flex flex-col items-center gap-3 px-6 text-center">
                  <p className="text-xs text-text-secondary">
                    Se genera en el servidor -- funciona en cualquier celular, sin importar si
                    soporta 3D. Tarda 1-3 min; podés cerrar esta ventana y te avisamos cuando esté.
                  </p>
                  <div className="flex gap-1.5 rounded-app bg-surface-2 p-1">
                    <button
                      type="button"
                      onClick={() => setEstiloFlyover("edificios")}
                      className={`rounded-app px-3 py-1.5 text-xs font-semibold ${
                        estiloFlyover === "edificios"
                          ? "bg-fill-primary text-on-primary"
                          : "text-text-secondary"
                      }`}
                    >
                      Edificios 3D
                    </button>
                    <button
                      type="button"
                      onClick={() => setEstiloFlyover("satelital")}
                      className={`rounded-app px-3 py-1.5 text-xs font-semibold ${
                        estiloFlyover === "satelital"
                          ? "bg-fill-primary text-on-primary"
                          : "text-text-secondary"
                      }`}
                    >
                      Satelital
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={generarFlyover}
                    className="btn-hero rounded-app px-4 py-1.5 text-xs"
                  >
                    Generar video 3D
                  </button>
                </div>
              )}
              {!cargandoFlyover && errorFlyover && (
                <div className="flex flex-col items-center gap-2.5 px-6 text-center">
                  <p className="text-xs text-fill-warning">{errorFlyover}</p>
                  <button
                    type="button"
                    onClick={generarFlyover}
                    className="rounded-app border border-border-accent px-4 py-1.5 text-xs text-text-accent"
                  >
                    Reintentar
                  </button>
                </div>
              )}
              {!cargandoFlyover &&
                estadoFlyover &&
                (estadoFlyover.estado === "pendiente" || estadoFlyover.estado === "procesando") && (
                  <p className="px-6 text-center text-xs text-text-secondary">
                    Generando tu video 3D... puede tardar 1-3 min. Podés cerrar esta ventana, te
                    avisamos cuando esté listo.
                  </p>
                )}
              {!cargandoFlyover && estadoFlyover?.estado === "listo" && estadoFlyover.videoUrl && (
                <video
                  src={estadoFlyover.videoUrl}
                  className="h-full w-full object-contain"
                  autoPlay
                  loop
                  muted
                  playsInline
                />
              )}
              {!cargandoFlyover && estadoFlyover?.estado === "error" && (
                <div className="flex flex-col items-center gap-2.5 px-6 text-center">
                  <p className="text-xs text-fill-warning">No se pudo generar el video 3D.</p>
                  {estadoFlyover.errorMsg && (
                    // Errores de ffmpeg/Puppeteer llegan acá como texto técnico
                    // larguísimo (ver flyover-render.service.ts) -- antes se
                    // mostraba entero y tapaba toda la ventana; ahora queda
                    // contenido en una caja chica con scroll. El motivo real
                    // del fallo casi siempre queda al FINAL del mensaje (Node
                    // arma "Command failed: <comando completo>\n<stderr>", así
                    // que los primeros ~500 caracteres son solo el comando) --
                    // por eso se recorta desde el final, no desde el inicio.
                    <pre className="max-h-32 w-full overflow-y-auto whitespace-pre-wrap break-words rounded-app bg-surface-2 p-2 text-left text-[10px] text-text-muted">
                      {estadoFlyover.errorMsg.slice(-800)}
                    </pre>
                  )}
                  {/* Una vez que existe CUALQUIER intento anterior para esta ruta
                      (aunque haya sido error), este selector dejaba de mostrarse
                      -- "Reintentar" volvía a generar en silencio con el estilo
                      por defecto ("edificios"), sin importar cuál eligiera el
                      usuario antes. Se repite acá para poder cambiar de estilo
                      antes de reintentar. */}
                  <div className="flex gap-1.5 rounded-app bg-surface-2 p-1">
                    <button
                      type="button"
                      onClick={() => setEstiloFlyover("edificios")}
                      className={`rounded-app px-3 py-1.5 text-xs font-semibold ${
                        estiloFlyover === "edificios"
                          ? "bg-fill-primary text-on-primary"
                          : "text-text-secondary"
                      }`}
                    >
                      Edificios 3D
                    </button>
                    <button
                      type="button"
                      onClick={() => setEstiloFlyover("satelital")}
                      className={`rounded-app px-3 py-1.5 text-xs font-semibold ${
                        estiloFlyover === "satelital"
                          ? "bg-fill-primary text-on-primary"
                          : "text-text-secondary"
                      }`}
                    >
                      Satelital
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={generarFlyover}
                    className="rounded-app border border-border-accent px-4 py-1.5 text-xs text-text-accent"
                  >
                    Reintentar
                  </button>
                </div>
              )}
            </>
          )}
        </div>
        {/* Una vez que hay un video "listo" para esta ruta, esa pestaña
            siempre muestra ese video de entrada (ver arriba) -- sin este
            link no había forma de volver a elegir estilo y generar el otro,
            solo se podía ver el que ya existía. */}
        {tab === "video3d" && estadoFlyover?.estado === "listo" && (
          <button
            type="button"
            onClick={() => setEstadoFlyover(null)}
            className="self-center text-[11px] text-text-secondary underline"
          >
            Generar en otro estilo
          </button>
        )}
        {tab === "video" && videoUrl && (
          <button
            type="button"
            onClick={generarVideoDeNuevo}
            className="self-center text-[11px] text-text-secondary underline"
          >
            Generar de nuevo
          </button>
        )}

        <input
          type="text"
          autoComplete="off"
          {...noAutofillTitulo}
          placeholder="Título (opcional)"
          value={titulo}
          maxLength={60}
          onChange={(e) => setTitulo(e.target.value)}
          className="rounded-app border border-border bg-surface-2 px-3 py-2 text-sm text-text-primary outline-none"
        />
        <textarea
          autoComplete="off"
          {...noAutofillComentario}
          placeholder="Un breve comentario (opcional)"
          value={comentario}
          maxLength={140}
          rows={2}
          onChange={(e) => setComentario(e.target.value)}
          className="rounded-app border border-border bg-surface-2 px-3 py-2 text-sm text-text-primary outline-none"
        />

        {error && <p className="text-xs text-fill-warning">{error}</p>}

        {tab === "imagen" || tab === "video" ? (
          <div className="flex justify-center">
            <button
              ref={botonCompartirRef}
              type="button"
              onClick={alternarMenuCompartir}
              aria-label="Opciones para compartir"
              aria-expanded={menuCompartirAbierto}
              className="btn-hero flex h-11 w-11 items-center justify-center rounded-full text-lg"
            >
              <IconCirclePlus size={22} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={compartiendo || estadoFlyover?.estado !== "listo" || !estadoFlyover.videoUrl}
            onClick={compartirEnRedes}
            className="flex items-center justify-center gap-1.5 rounded-app border border-border-accent px-4 py-2 text-sm text-text-accent disabled:opacity-50"
          >
            <IconShare size={16} />
            {compartiendo ? "Preparando..." : "Compartir en redes sociales"}
          </button>
        )}

        <button type="button" onClick={onClose} className="text-xs text-text-secondary underline">
          {tab === "video3d" && (estadoFlyover?.estado === "pendiente" || estadoFlyover?.estado === "procesando")
            ? "Cerrar (el video se sigue generando)"
            : "Cancelar"}
        </button>
      </div>
      {/* Pantalla completa propia (mismo motivo que EditorEncuadreFoto): si
          esto se anidara dentro de la caja de 320px de la vista previa,
          quedaría cortado y sin forma de llegar al botón de confirmar --
          ver el bug que ya resolvimos ahí. El z-[60] lo pone por encima del
          backdrop del modal (z-50) sin depender del orden en el DOM. */}
      {mostrarSelectorMusica && (
        <div className="fixed inset-0 z-[60]" onClick={(e) => e.stopPropagation()}>
          <SelectorMusicaHistoria
            duracionHistoriaSeg={DURACION_VIDEO_ESTIMADA_SEG}
            onSeleccionar={(cancion, inicioSeg) => {
              setMusicaElegida({ cancion, inicioSeg });
              setMostrarSelectorMusica(false);
            }}
            onCerrar={() => setMostrarSelectorMusica(false)}
          />
        </div>
      )}
      {/* Menú "+" de compartir: anclado al botón (coordenadas medidas al
          abrir, ver alternarMenuCompartir), no pantalla completa -- el
          catcher fixed de atrás es solo para cerrar al tocar afuera. */}
      {menuCompartirAbierto && posMenuCompartir && (
        <div
          className="fixed inset-0 z-[60]"
          onClick={(e) => {
            e.stopPropagation();
            setMenuCompartirAbierto(false);
          }}
        >
          <div
            className="fixed z-[61] w-52 rounded-app border border-border-accent bg-surface-2 p-1.5 shadow-lg"
            style={{ top: posMenuCompartir.top, left: posMenuCompartir.left, transform: "translate(-50%, -100%)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              disabled={estado === "publicando" || (tab === "imagen" ? cargandoInicial || !blob : generandoVideo || !videoBlob)}
              onClick={() => ejecutarYcerrar(publicarEnPost)}
              className="flex w-full items-center gap-2 rounded-app px-3 py-2 text-left text-xs text-text-accent disabled:opacity-40"
            >
              <IconUpload size={15} />
              {estado === "publicando" ? "Publicando..." : "Publicar en Post"}
            </button>
            {tab === "video" && (
              <button
                type="button"
                disabled={publicandoHistoria || generandoVideo || !videoBlob}
                onClick={() => ejecutarYcerrar(compartirEnHistoria)}
                className="flex w-full items-center gap-2 rounded-app px-3 py-2 text-left text-xs text-text-accent disabled:opacity-40"
              >
                <IconCirclePlus size={15} />
                {publicandoHistoria ? "Compartiendo..." : "Compartir en Historia"}
              </button>
            )}
            <button
              type="button"
              disabled={compartiendo || (tab === "imagen" ? cargandoInicial || !blob : generandoVideo || !videoBlob)}
              onClick={() => ejecutarYcerrar(compartirEnRedes)}
              className="flex w-full items-center gap-2 rounded-app px-3 py-2 text-left text-xs text-text-accent disabled:opacity-40"
            >
              <IconShare size={15} />
              {compartiendo ? "Preparando..." : "Compartir en redes sociales"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
