"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { IconMapPin, IconShare, IconUsers, IconVideo } from "@tabler/icons-react";
import { useSession } from "@/context/SessionContext";
import { apiGet, apiPost, apiDelete, apiUpload, ApiError } from "@/lib/api";
import type { Post } from "@/lib/posts";
import { CarruselFotos } from "@/components/Posts/CarruselFotos";
import { SelectorUbicacion } from "@/components/Posts/SelectorUbicacion";
import { ComentariosPost } from "@/components/Posts/ComentariosPost";
import { SelectorCompartirPost } from "@/components/Posts/SelectorCompartirPost";
import { VideoTrimmer } from "@/components/VideoTrimmer";
import { Avatar } from "@/components/Avatar";
import { BarraHistorias } from "@/components/Historias/BarraHistorias";

const MAX_FOTOS_POR_POST = 3;
const DURACION_MAXIMA_VIDEO_SEG = 50;

function tiempoRelativo(fecha: string): string {
  const minutos = Math.round((Date.now() - new Date(fecha).getTime()) / 60000);
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `hace ${horas}h`;
  return `hace ${Math.round(horas / 24)}d`;
}

// Mismo mensaje para todos los que ven el feed, no solo el autor — la
// vigencia de 7 días es transparente, como cualquier otro contenido efímero
// de la app (ver DIAS_VIGENCIA_POST en posts.service.ts).
function mensajeVencimiento(diasRestantes: number): string {
  if (diasRestantes >= 2) return `Vence en ${diasRestantes} días`;
  if (diasRestantes === 1) return "Vence mañana";
  return "Vence hoy";
}

// Comparte 1-3 fotos o el video como archivos reales (no un link) con el
// selector nativo del sistema — mismo patrón que compartirHistoria() en
// VisorHistorias.tsx, extendido a múltiples archivos.
async function compartirPost(p: Post) {
  try {
    const urls = p.tipo === "video" && p.videoUrl ? [p.videoUrl] : p.fotos;
    if (urls.length === 0) {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: p.titulo, text: p.resena });
      }
      return;
    }
    const archivos = await Promise.all(
      urls.map(async (url, i) => {
        const blob = await (await fetch(url)).blob();
        const extension = p.tipo === "video" ? "mp4" : "jpg";
        return new File([blob], `post-legion-roller-${i + 1}.${extension}`, { type: blob.type });
      }),
    );

    if (
      typeof navigator.share === "function" &&
      typeof navigator.canShare === "function" &&
      navigator.canShare({ files: archivos })
    ) {
      await navigator.share({ files: archivos, title: p.titulo, text: p.resena });
      return;
    }

    const enlace = document.createElement("a");
    enlace.href = URL.createObjectURL(archivos[0]);
    enlace.download = archivos[0].name;
    enlace.click();
    URL.revokeObjectURL(enlace.href);
  } catch {
    // el usuario canceló el panel de compartir, o el navegador lo rechazó
  }
}

export default function PostPage() {
  const { sesion } = useSession();
  const token = sesion?.token ?? null;
  const puedeInteractuar = sesion?.rol === "usuario" || sesion?.rol === "admin";
  const router = useRouter();
  const searchParams = useSearchParams();
  // Guarda "postId:comentarioId:reacciones" del último deep-link ya procesado
  // (no solo un booleano): si ya se estaba en /post y se toca otra
  // notificación desde la campana, el `router.push` de AppHeader.tsx es
  // navegación del lado del cliente — este componente sigue montado, así que
  // hace falta reaccionar al cambio de `searchParams`, no solo al montar
  // (mismo patrón que BarraHistorias.tsx).
  const ultimoDeepLinkRef = useRef<string | null>(null);

  const [posts, setPosts] = useState<Post[]>([]);
  const [misReacciones, setMisReacciones] = useState<number[]>([]);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(true);

  const [mostrarCompose, setMostrarCompose] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [resena, setResena] = useState("");
  const [ubicacion, setUbicacion] = useState<string | undefined>(undefined);
  const [mostrarSelectorUbicacion, setMostrarSelectorUbicacion] = useState(false);
  const [tipoMedia, setTipoMedia] = useState<"foto" | "video" | null>(null);
  const [fotos, setFotos] = useState<string[]>([]);
  const [videoUrl, setVideoUrl] = useState("");
  const [subiendoVideo, setSubiendoVideo] = useState(false);
  const [subiendoFotos, setSubiendoFotos] = useState(false);
  const [videoParaRecortar, setVideoParaRecortar] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const fotoInputRef = useRef<HTMLInputElement>(null);

  const [panelSocial, setPanelSocial] = useState<{
    postId: number;
    postAutorId: number;
    vista: "reacciones" | "comentarios";
    comentarioDestacadoId?: number;
  } | null>(null);
  const [postACompartir, setPostACompartir] = useState<Post | null>(null);

  async function cargar() {
    try {
      const lista = await apiGet<Post[]>("/posts", null);
      setPosts(lista);
      if (token) {
        const mias = await apiGet<number[]>("/posts/mis-reacciones", token);
        setMisReacciones(mias);
      }
      return lista;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cargar el feed.");
      return null;
    } finally {
      setCargando(false);
    }
  }

  // Deep-link desde la notificación de "te comentaron/respondieron/dieron me
  // gusta/compartieron" (ver AppHeader.tsx): abre directo el panel social del
  // post, en la pestaña de comentarios o de reacciones según corresponda.
  async function cargarYManejarDeepLink() {
    const postIdParam = searchParams.get("post");
    if (!postIdParam) return;
    const comentarioIdParam = searchParams.get("comentario");
    const reaccionesParam = searchParams.get("reacciones");
    const clave = `${postIdParam}:${comentarioIdParam ?? ""}:${reaccionesParam ?? ""}`;
    if (ultimoDeepLinkRef.current === clave) return;
    ultimoDeepLinkRef.current = clave;

    const lista = await cargar();
    if (!lista) return;

    const postId = Number(postIdParam);
    const post = lista.find((p) => p.id === postId);
    if (post) {
      setPanelSocial({
        postId: post.id,
        postAutorId: post.autorId,
        vista: reaccionesParam ? "reacciones" : "comentarios",
        comentarioDestacadoId: comentarioIdParam ? Number(comentarioIdParam) : undefined,
      });
    }
    router.replace("/post", { scroll: false });
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargarYManejarDeepLink();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Como los comentarios ahora se muestran en línea (no en un panel flotante
  // de pantalla completa), al abrir vía deep-link hace falta hacer scroll
  // hasta la tarjeta del post — el resaltado del comentario puntual lo hace
  // ComentariosPost.tsx una vez que carga su propio hilo.
  useEffect(() => {
    if (!panelSocial) return;
    document.getElementById(`post-${panelSocial.postId}`)?.scrollIntoView({ block: "start", behavior: "smooth" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelSocial?.postId]);

  // Ubicación completamente opcional y a pedido: solo se detecta/muestra si
  // el usuario toca "Agregar ubicación" — nunca en silencio al abrir el
  // compositor. El selector (estilo Instagram) ofrece lugares cercanos +
  // búsqueda manual; acá solo se guarda el nombre elegido, nunca coordenadas.
  function elegirUbicacion(nombre: string) {
    setUbicacion(nombre);
    setMostrarSelectorUbicacion(false);
  }

  function limpiarCompose() {
    setTitulo("");
    setResena("");
    setUbicacion(undefined);
    setTipoMedia(null);
    setFotos([]);
    setVideoUrl("");
    setVideoParaRecortar(null);
    setMostrarCompose(false);
    if (videoInputRef.current) videoInputRef.current.value = "";
    if (fotoInputRef.current) fotoInputRef.current.value = "";
  }

  // Se valida la duración en el cliente ANTES de subir, para no gastar ancho
  // de banda subiendo un archivo que de todas formas se va a rechazar (mismo
  // criterio que EditorHistoria.tsx, con el límite propio de Post: 50s). Si
  // supera el máximo, se abre el editor de recorte (VideoTrimmer) en vez de
  // rechazarlo directamente.
  function onVideoElegido(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    if (!archivo || !token) return;
    setError("");

    const url = URL.createObjectURL(archivo);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = async () => {
      URL.revokeObjectURL(url);
      if (video.duration > DURACION_MAXIMA_VIDEO_SEG) {
        setVideoParaRecortar(archivo);
        return;
      }
      await subirVideo(archivo, archivo.name);
    };
    video.src = url;
  }

  async function subirVideo(archivo: Blob, nombreArchivo: string) {
    if (!token) return;
    setSubiendoVideo(true);
    try {
      const subida = await apiUpload<{ url: string }>("/uploads", archivo, token, nombreArchivo);
      setVideoUrl(subida.url);
      setTipoMedia("video");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo subir el video.");
    } finally {
      setSubiendoVideo(false);
      if (videoInputRef.current) videoInputRef.current.value = "";
    }
  }

  // El selector nativo permite elegir hasta 3 fotos de una sola vez (atributo
  // `multiple`) — se suben todas en paralelo y se agregan al array apenas
  // terminan, sin paso de recorte (a diferencia de ImageUploadCrop, pensado
  // para una sola foto a la vez).
  async function onFotosElegidas(e: React.ChangeEvent<HTMLInputElement>) {
    const elegidos = Array.from(e.target.files ?? []);
    if (elegidos.length === 0 || !token) return;
    setError("");

    const espacioDisponible = MAX_FOTOS_POR_POST - fotos.length;
    const archivos = elegidos.slice(0, espacioDisponible);
    if (elegidos.length > espacioDisponible) {
      setError(`Solo se admiten ${MAX_FOTOS_POR_POST} fotos por publicación; se tomaron las primeras ${espacioDisponible}.`);
    }

    setSubiendoFotos(true);
    try {
      const subidas = await Promise.all(
        archivos.map((archivo) => apiUpload<{ url: string }>("/uploads", archivo, token, archivo.name)),
      );
      setFotos((prev) => [...prev, ...subidas.map((s) => s.url)]);
      setTipoMedia("foto");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudieron subir las fotos.");
    } finally {
      setSubiendoFotos(false);
      if (fotoInputRef.current) fotoInputRef.current.value = "";
    }
  }

  function quitarFoto(i: number) {
    setFotos((prev) => {
      const nuevas = prev.filter((_, idx) => idx !== i);
      if (nuevas.length === 0) setTipoMedia(null);
      return nuevas;
    });
  }

  function quitarVideo() {
    setVideoUrl("");
    setTipoMedia(null);
    if (videoInputRef.current) videoInputRef.current.value = "";
  }

  async function publicar(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !titulo || !resena) return;
    setEnviando(true);
    setError("");
    try {
      await apiPost(
        "/posts",
        {
          titulo,
          resena,
          ubicacion: ubicacion || undefined,
          tipo: tipoMedia ?? "foto",
          fotos: tipoMedia === "foto" && fotos.length > 0 ? fotos : undefined,
          videoUrl: tipoMedia === "video" ? videoUrl : undefined,
        },
        token,
      );
      limpiarCompose();
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo publicar.");
    } finally {
      setEnviando(false);
    }
  }

  async function reaccionar(postId: number) {
    if (!token) return;
    try {
      await apiPost(`/posts/${postId}/reaccion`, {}, token);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo reaccionar.");
    }
  }

  async function eliminar(postId: number) {
    if (!token) return;
    try {
      await apiDelete(`/posts/${postId}`, token);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo eliminar.");
    }
  }

  if (cargando) {
    return <p className="text-sm text-text-secondary">Cargando...</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <BarraHistorias />

      {puedeInteractuar && (
        <div className="card p-4">
          {!mostrarCompose ? (
            <button
              type="button"
              onClick={() => setMostrarCompose(true)}
              className="btn-hero w-full rounded-app px-4 py-3 text-sm"
            >
              Comparte tu experiencia
            </button>
          ) : (
            <form onSubmit={publicar} className="flex flex-col gap-2">
              <input
                type="text"
                placeholder="Título"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                className="rounded-app border border-border bg-surface-2 px-3 py-2 text-text-primary outline-none"
              />
              <textarea
                placeholder="Cuéntanos tu experiencia..."
                value={resena}
                onChange={(e) => setResena(e.target.value)}
                rows={3}
                className="rounded-app border border-border bg-surface-2 px-3 py-2 text-text-primary outline-none"
              />

              {ubicacion ? (
                <div className="flex w-fit items-center gap-1 rounded-full bg-surface-2 px-3 py-1 text-xs text-text-secondary">
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
                    className="text-fill-warning underline"
                  >
                    Quitar
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setMostrarSelectorUbicacion(true)}
                  className="flex w-fit items-center gap-1 rounded-full border border-border px-3 py-1 text-xs text-text-secondary"
                >
                  <IconMapPin size={14} />
                  Agregar ubicación
                </button>
              )}

              {tipoMedia === "video" ? (
                <div className="flex flex-col gap-1">
                  {subiendoVideo ? (
                    <p className="text-xs text-text-secondary">Subiendo video...</p>
                  ) : (
                    videoUrl && <video src={videoUrl} controls className="w-full rounded-app" />
                  )}
                  <button
                    type="button"
                    onClick={quitarVideo}
                    className="w-fit text-xs text-fill-warning underline"
                  >
                    Quitar video
                  </button>
                </div>
              ) : (
                <>
                  {fotos.length > 0 && (
                    <div className="flex gap-2">
                      {fotos.map((url, i) => (
                        <div key={url} className="relative">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={url} alt="Foto elegida" className="h-16 w-16 rounded-app object-cover" />
                          <button
                            type="button"
                            onClick={() => quitarFoto(i)}
                            className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-page-bg text-xs text-fill-warning"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-3">
                    {fotos.length < MAX_FOTOS_POR_POST && (
                      <>
                        <input
                          ref={fotoInputRef}
                          type="file"
                          accept="image/*"
                          multiple
                          onChange={onFotosElegidas}
                          className="hidden"
                        />
                        <button
                          type="button"
                          disabled={subiendoFotos}
                          onClick={() => fotoInputRef.current?.click()}
                          className="rounded-app border border-border px-4 py-2 text-sm text-text-secondary disabled:opacity-60"
                        >
                          {subiendoFotos
                            ? "Subiendo..."
                            : fotos.length === 0
                              ? `Agregar fotos (hasta ${MAX_FOTOS_POR_POST}, opcional)`
                              : "Agregar más fotos"}
                        </button>
                      </>
                    )}
                    {fotos.length === 0 && (
                      <>
                        <input
                          ref={videoInputRef}
                          type="file"
                          accept="video/*"
                          onChange={onVideoElegido}
                          className="hidden"
                        />
                        <button
                          type="button"
                          onClick={() => videoInputRef.current?.click()}
                          className="flex items-center gap-1 text-xs text-text-secondary underline"
                        >
                          <IconVideo size={14} />
                          Agregar video en su lugar
                        </button>
                      </>
                    )}
                  </div>
                </>
              )}

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={enviando || subiendoVideo || subiendoFotos}
                  className="btn-hero flex-1 rounded-app px-4 py-2 text-sm disabled:opacity-60"
                >
                  {enviando ? "Publicando..." : "Publicar"}
                </button>
                <button
                  type="button"
                  onClick={limpiarCompose}
                  className="rounded-app border border-border px-4 py-2 text-sm text-text-secondary"
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {mostrarSelectorUbicacion && (
        <SelectorUbicacion
          onSeleccionar={elegirUbicacion}
          onCerrar={() => setMostrarSelectorUbicacion(false)}
        />
      )}

      {videoParaRecortar && (
        <VideoTrimmer
          archivo={videoParaRecortar}
          duracionMaxima={DURACION_MAXIMA_VIDEO_SEG}
          onConfirmar={(blob) => {
            setVideoParaRecortar(null);
            subirVideo(blob, "recorte.webm");
          }}
          onCancelar={() => {
            setVideoParaRecortar(null);
            if (videoInputRef.current) videoInputRef.current.value = "";
          }}
        />
      )}

      {error && <p className="text-xs text-fill-warning">{error}</p>}

      {posts.length === 0 && (
        <p className="text-sm text-text-secondary">Todavía no hay publicaciones.</p>
      )}

      {posts.map((p) => {
        const yaReaccione = misReacciones.includes(p.id);
        const puedeEliminar = sesion?.id === p.autorId || sesion?.rol === "admin";

        return (
          <div key={p.id} id={`post-${p.id}`} className="card flex flex-col gap-2 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Avatar fotoUrl={p.autorFotoUrl} nombre={p.autorNombre} tamano={40} />
                <div>
                  <p className="text-sm font-semibold text-text-primary">{p.autorNombre}</p>
                  <p className="text-xs text-text-muted">
                    {tiempoRelativo(p.createdAt)}
                    {p.ubicacion ? ` · ${p.ubicacion}` : ""} · {mensajeVencimiento(p.diasRestantes)}
                  </p>
                </div>
              </div>
              {puedeEliminar && (
                <button
                  type="button"
                  onClick={() => eliminar(p.id)}
                  className="text-xs text-fill-warning underline"
                >
                  Eliminar
                </button>
              )}
            </div>

            <h2 className="text-sm font-semibold text-text-accent">{p.titulo}</h2>
            <p className="text-sm text-text-secondary">{p.resena}</p>

            {p.tipo === "video" && p.videoUrl ? (
              <video src={p.videoUrl} controls className="w-full rounded-app" />
            ) : (
              <CarruselFotos fotos={p.fotos} alt={p.titulo} />
            )}

            <div className="flex items-center gap-4 border-t border-border pt-2 text-xs text-text-secondary">
              {puedeInteractuar ? (
                <button
                  type="button"
                  onClick={() => reaccionar(p.id)}
                  className={yaReaccione ? "text-text-accent" : ""}
                >
                  {yaReaccione ? "★ Me gusta" : "☆ Me gusta"} ({p.reaccionesCount})
                </button>
              ) : (
                <span>{p.reaccionesCount} me gusta</span>
              )}
              <button
                type="button"
                onClick={() =>
                  setPanelSocial({ postId: p.id, postAutorId: p.autorId, vista: "comentarios" })
                }
              >
                {p.comentariosCount} comentarios
              </button>
              <button
                type="button"
                onClick={() => compartirPost(p)}
                className="ml-auto flex items-center gap-1"
              >
                <IconShare size={14} />
                Compartir
              </button>
              {puedeInteractuar && (
                <button
                  type="button"
                  onClick={() => setPostACompartir(p)}
                  aria-label="Compartir a un usuario"
                  className="flex items-center gap-1"
                >
                  <IconUsers size={14} />
                </button>
              )}
            </div>

            {panelSocial?.postId === p.id && (
              <ComentariosPost
                postId={p.id}
                postAutorId={p.autorId}
                vistaInicial={panelSocial.vista}
                comentarioDestacadoId={panelSocial.comentarioDestacadoId}
                token={token}
                onCerrar={() => {
                  setPanelSocial(null);
                  cargar();
                }}
              />
            )}
          </div>
        );
      })}

      {postACompartir && (
        <SelectorCompartirPost
          post={postACompartir}
          propioId={sesion?.id}
          token={token}
          onCerrar={() => setPostACompartir(null)}
        />
      )}
    </div>
  );
}
