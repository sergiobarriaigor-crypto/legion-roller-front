"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/context/SessionContext";
import { apiGet, apiPatch, apiPut, apiDelete, ApiError } from "@/lib/api";
import { ETIQUETA_TECNICA, type MiPerfil, type TecnicasPerfil } from "@/lib/perfil";
import { ETIQUETA_MOTIVO, type MiEmergencia } from "@/lib/emergencias";
import type { Post } from "@/lib/posts";
import { ImageUploadCrop } from "@/components/ImageUploadCrop";

interface RecorridoResumen {
  id: number;
  tipo: string;
  distanciaKm: number;
  duracionSeg: number;
  createdAt: string;
}

const TECNICAS: (keyof TecnicasPerfil)[] = ["t", "soul", "maggi", "parallel"];

export default function PerfilPage() {
  const { sesion, logout } = useSession();
  const token = sesion?.token ?? null;

  const [perfil, setPerfil] = useState<MiPerfil | null>(null);
  const [misPosts, setMisPosts] = useState<Post[]>([]);
  const [misRecorridos, setMisRecorridos] = useState<RecorridoResumen[]>([]);
  const [miEmergencia, setMiEmergencia] = useState<MiEmergencia | null>(null);
  const [nuevoEstado, setNuevoEstado] = useState("");
  const [error, setError] = useState("");

  async function cargar() {
    if (!token || !sesion?.id) return;
    try {
      const datos = await apiGet<MiPerfil>("/perfil/mio", token);
      setPerfil(datos);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cargar tu perfil.");
    }
    try {
      const posts = await apiGet<Post[]>(`/posts?autorId=${sesion.id}`, token);
      setMisPosts(posts);
    } catch {
      // ignorar
    }
    try {
      const recorridos = await apiGet<RecorridoResumen[]>("/mapa/recorridos", token);
      setMisRecorridos(recorridos);
    } catch {
      // ignorar
    }
    try {
      const emergencia = await apiGet<MiEmergencia | null>("/emergencias/mia", token);
      setMiEmergencia(emergencia);
    } catch {
      // ignorar
    }
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function toggleTecnica(tecnica: keyof TecnicasPerfil) {
    if (!token) return;
    try {
      await apiPatch(`/perfil/tecnicas/${tecnica}`, {}, token);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo actualizar la técnica.");
    }
  }

  async function publicarEstado(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !nuevoEstado.trim()) return;
    try {
      await apiPut("/perfil/estado", { texto: nuevoEstado }, token);
      setNuevoEstado("");
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo publicar el estado.");
    }
  }

  async function borrarEstado() {
    if (!token) return;
    try {
      await apiDelete("/perfil/estado", token);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo borrar el estado.");
    }
  }

  async function guardarFoto(url: string) {
    if (!token) return;
    try {
      await apiPut("/perfil/foto", { fotoUrl: url }, token);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar la foto.");
    }
  }

  async function quitarFoto() {
    if (!token) return;
    try {
      await apiDelete("/perfil/foto", token);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo quitar la foto.");
    }
  }

  async function cancelarEmergencia() {
    if (!token) return;
    try {
      await apiDelete("/emergencias/mia", token);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cancelar la emergencia.");
    }
  }

  if (!perfil) {
    return <p className="text-sm text-text-secondary">Cargando...</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="card flex flex-col items-center gap-3 p-5">
        {perfil.fotoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={perfil.fotoUrl}
            alt={perfil.nombre}
            className="h-20 w-20 rounded-full border-2 border-border-accent object-cover"
          />
        ) : (
          <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-border-accent bg-bg-accent text-2xl font-semibold text-text-accent">
            {perfil.nombre.charAt(0).toUpperCase()}
          </div>
        )}

        <div className="flex flex-col items-center gap-1">
          <h1 className="text-lg font-semibold text-text-accent">{perfil.nombre}</h1>
          <p className="text-xs text-text-secondary">
            {perfil.ciudad ?? "Sin ciudad"} · {perfil.rol}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <ImageUploadCrop
            token={token}
            onSubido={guardarFoto}
            etiqueta={perfil.fotoUrl ? "Cambiar foto" : "Agregar foto de perfil"}
          />
          {perfil.fotoUrl && (
            <button type="button" onClick={quitarFoto} className="text-xs text-fill-warning underline">
              Quitar foto
            </button>
          )}
        </div>
      </div>

      {error && <p className="text-xs text-fill-warning">{error}</p>}

      {miEmergencia && (
        <div className="card flex items-center justify-between border-fill-warning bg-red-700/10 p-4">
          <p className="text-xs text-fill-warning">
            🚨 Tienes una emergencia activa —{" "}
            {ETIQUETA_MOTIVO[miEmergencia.motivo as keyof typeof ETIQUETA_MOTIVO] ??
              miEmergencia.motivo}
          </p>
          <button
            type="button"
            onClick={cancelarEmergencia}
            className="text-xs text-fill-warning underline"
          >
            Cancelar
          </button>
        </div>
      )}

      <div className="card flex flex-col gap-2 p-4">
        <h2 className="text-sm font-semibold text-text-primary">Estado</h2>
        {perfil.estado ? (
          <div className="flex items-center justify-between">
            <p className="text-sm text-text-secondary">&quot;{perfil.estado.texto}&quot;</p>
            <button type="button" onClick={borrarEstado} className="text-xs text-fill-warning underline">
              Quitar
            </button>
          </div>
        ) : (
          <p className="text-xs text-text-muted">No tienes un estado activo (dura 8h).</p>
        )}
        <form onSubmit={publicarEstado} className="flex gap-2">
          <input
            type="text"
            placeholder="¿Qué estás haciendo?"
            value={nuevoEstado}
            onChange={(e) => setNuevoEstado(e.target.value)}
            className="flex-1 rounded-app border border-border bg-surface-2 px-3 py-2 text-sm text-text-primary outline-none"
          />
          <button type="submit" className="btn-hero rounded-app px-4 py-2 text-sm">
            Publicar
          </button>
        </form>
      </div>

      <div className="card grid grid-cols-3 gap-3 p-4 text-center">
        <div>
          <p className="text-lg font-semibold text-text-accent">{perfil.stats.kmTotales}</p>
          <p className="text-xs text-text-muted">km totales</p>
        </div>
        <div>
          <p className="text-lg font-semibold text-text-accent">{perfil.stats.kmOficiales}</p>
          <p className="text-xs text-text-muted">km oficiales</p>
        </div>
        <div>
          <p className="text-lg font-semibold text-text-accent">{perfil.stats.numRutas}</p>
          <p className="text-xs text-text-muted">rutas</p>
        </div>
        <div>
          <p className="text-lg font-semibold text-text-accent">{perfil.stats.asistencias}</p>
          <p className="text-xs text-text-muted">asistencias</p>
        </div>
        <div>
          <p className="text-lg font-semibold text-text-accent">{perfil.stats.eventos}</p>
          <p className="text-xs text-text-muted">eventos</p>
        </div>
        <div>
          <p className="text-lg font-semibold text-text-accent">{perfil.stats.horasPatinadas}</p>
          <p className="text-xs text-text-muted">horas</p>
        </div>
      </div>

      <div className="card flex flex-col gap-2 p-4">
        <h2 className="text-sm font-semibold text-text-primary">Técnicas dominadas</h2>
        <div className="flex flex-wrap gap-2">
          {TECNICAS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => toggleTecnica(t)}
              className={`rounded-app px-3 py-1 text-xs ${
                perfil.tecnicas[t] ? "btn-hero" : "border border-border text-text-secondary"
              }`}
            >
              {ETIQUETA_TECNICA[t]}
            </button>
          ))}
        </div>
      </div>

      <div className="card flex flex-col gap-2 p-4">
        <h2 className="text-sm font-semibold text-text-primary">Reconocimientos recibidos</h2>
        {perfil.reconocimientos.length === 0 && (
          <p className="text-xs text-text-secondary">Todavía no tienes reconocimientos.</p>
        )}
        {perfil.reconocimientos.map((r) => (
          <p key={r.id} className="text-xs text-text-secondary">
            <span className="font-semibold text-text-primary">{r.deNombre}:</span> {r.texto}
          </p>
        ))}
      </div>

      {misPosts.length > 0 && (
        <div className="card flex flex-col gap-2 p-4">
          <h2 className="text-sm font-semibold text-text-primary">Mis publicaciones</h2>
          {misPosts.map((p) => (
            <p key={p.id} className="text-xs text-text-secondary">
              {p.titulo}
            </p>
          ))}
        </div>
      )}

      {misRecorridos.length > 0 && (
        <div className="card flex flex-col gap-2 p-4">
          <h2 className="text-sm font-semibold text-text-primary">Historial de recorridos</h2>
          {misRecorridos.map((r) => (
            <p key={r.id} className="text-xs text-text-secondary">
              {new Date(r.createdAt).toLocaleDateString("es-CL")} — {r.distanciaKm.toFixed(2)} km
            </p>
          ))}
        </div>
      )}

      <button type="button" onClick={logout} className="card px-4 py-3 text-sm text-fill-warning">
        Cerrar sesión
      </button>
    </div>
  );
}
