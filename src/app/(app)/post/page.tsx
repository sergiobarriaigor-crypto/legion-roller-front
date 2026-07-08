"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/context/SessionContext";
import { apiGet, apiPost, apiDelete, ApiError } from "@/lib/api";
import type { Post } from "@/lib/posts";
import { ImageUploadCrop } from "@/components/ImageUploadCrop";

function tiempoRelativo(fecha: string): string {
  const minutos = Math.round((Date.now() - new Date(fecha).getTime()) / 60000);
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `hace ${horas}h`;
  return `hace ${Math.round(horas / 24)}d`;
}

export default function PostPage() {
  const { sesion } = useSession();
  const token = sesion?.token ?? null;
  const puedeInteractuar = sesion?.rol === "usuario" || sesion?.rol === "admin";

  const [posts, setPosts] = useState<Post[]>([]);
  const [misReacciones, setMisReacciones] = useState<number[]>([]);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(true);

  const [mostrarCompose, setMostrarCompose] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [resena, setResena] = useState("");
  const [ubicacion, setUbicacion] = useState("");
  const [fotoUrl, setFotoUrl] = useState("");
  const [enviando, setEnviando] = useState(false);

  const [comentarioAbierto, setComentarioAbierto] = useState<number | null>(null);
  const [textoComentario, setTextoComentario] = useState("");

  async function cargar() {
    try {
      const lista = await apiGet<Post[]>("/posts", null);
      setPosts(lista);
      if (token) {
        const mias = await apiGet<number[]>("/posts/mis-reacciones", token);
        setMisReacciones(mias);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cargar el feed.");
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function publicar(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !titulo || !resena) return;
    setEnviando(true);
    setError("");
    try {
      await apiPost(
        "/posts",
        { titulo, resena, ubicacion: ubicacion || undefined, fotoUrl: fotoUrl || undefined },
        token,
      );
      setTitulo("");
      setResena("");
      setUbicacion("");
      setFotoUrl("");
      setMostrarCompose(false);
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

  async function comentar(postId: number) {
    if (!token || !textoComentario.trim()) return;
    try {
      await apiPost(`/posts/${postId}/comentarios`, { texto: textoComentario }, token);
      setTextoComentario("");
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo comentar.");
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
              <input
                type="text"
                placeholder="Ubicación (opcional)"
                value={ubicacion}
                onChange={(e) => setUbicacion(e.target.value)}
                className="rounded-app border border-border bg-surface-2 px-3 py-2 text-text-primary outline-none"
              />
              {fotoUrl ? (
                <div className="flex items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={fotoUrl} alt="Foto elegida" className="h-16 w-16 rounded-app object-cover" />
                  <button
                    type="button"
                    onClick={() => setFotoUrl("")}
                    className="text-xs text-fill-warning underline"
                  >
                    Quitar foto
                  </button>
                </div>
              ) : (
                <ImageUploadCrop token={token} onSubido={setFotoUrl} etiqueta="Agregar foto (opcional)" />
              )}
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={enviando}
                  className="btn-hero flex-1 rounded-app px-4 py-2 text-sm disabled:opacity-60"
                >
                  {enviando ? "Publicando..." : "Publicar"}
                </button>
                <button
                  type="button"
                  onClick={() => setMostrarCompose(false)}
                  className="rounded-app border border-border px-4 py-2 text-sm text-text-secondary"
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {error && <p className="text-xs text-fill-warning">{error}</p>}

      {posts.length === 0 && (
        <p className="text-sm text-text-secondary">Todavía no hay publicaciones.</p>
      )}

      {posts.map((p) => {
        const yaReaccione = misReacciones.includes(p.id);
        const puedeEliminar = sesion?.id === p.autorId || sesion?.rol === "admin";

        return (
          <div key={p.id} className="card flex flex-col gap-2 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-text-primary">{p.autorNombre}</p>
                <p className="text-xs text-text-muted">
                  {tiempoRelativo(p.createdAt)}
                  {p.ubicacion ? ` · ${p.ubicacion}` : ""}
                </p>
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

            {p.fotoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.fotoUrl} alt={p.titulo} className="rounded-app w-full object-cover" />
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
                onClick={() => setComentarioAbierto(comentarioAbierto === p.id ? null : p.id)}
              >
                {p.comentarios.length} comentarios
              </button>
            </div>

            {comentarioAbierto === p.id && (
              <div className="flex flex-col gap-2">
                {p.comentarios.map((c) => (
                  <p key={c.id} className="text-xs text-text-secondary">
                    <span className="font-semibold text-text-primary">{c.autorNombre}:</span>{" "}
                    {c.texto}
                  </p>
                ))}
                {puedeInteractuar && (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Escribe un comentario..."
                      value={textoComentario}
                      onChange={(e) => setTextoComentario(e.target.value)}
                      className="flex-1 rounded-app border border-border bg-surface-2 px-3 py-1 text-xs text-text-primary outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => comentar(p.id)}
                      className="rounded-app bg-fill-primary px-3 py-1 text-xs text-on-primary"
                    >
                      Enviar
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
