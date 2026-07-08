"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/context/SessionContext";
import { apiGet, apiPost, apiDelete, ApiError } from "@/lib/api";
import { ETIQUETA_TIPO, TIPOS_PUBLICACION, type Publicacion } from "@/lib/publicaciones";
import type { Emprendedor } from "@/lib/emprendedores";

const RUTAS_QUE_USAN_FECHA_HORA = ["rodada", "evento"];

export default function AdminPage() {
  const { sesion } = useSession();
  const token = sesion?.token ?? null;

  const [publicaciones, setPublicaciones] = useState<Publicacion[]>([]);
  const [tipo, setTipo] = useState<string>("comunicado");
  const [titulo, setTitulo] = useState("");
  const [texto, setTexto] = useState("");
  const [fecha, setFecha] = useState("");
  const [hora, setHora] = useState("");
  const [puntoEncuentro, setPuntoEncuentro] = useState("");
  const [rsvp, setRsvp] = useState(false);
  const [duracionHoras, setDuracionHoras] = useState("");
  const [activaEnMapa, setActivaEnMapa] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [solicitudesEmprendedor, setSolicitudesEmprendedor] = useState<Emprendedor[]>([]);

  async function cargar() {
    if (!token) return;
    try {
      const lista = await apiGet<Publicacion[]>("/publicaciones", token);
      setPublicaciones(lista);
    } catch {
      // ignorar
    }
  }

  async function cargarSolicitudesEmprendedor() {
    if (!token) return;
    try {
      const lista = await apiGet<Emprendedor[]>("/emprendedores/solicitudes", token);
      setSolicitudesEmprendedor(lista);
    } catch {
      // ignorar
    }
  }

  useEffect(() => {
    cargar();
    cargarSolicitudesEmprendedor();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function aprobarEmprendedor(id: number) {
    if (!token) return;
    try {
      await apiPost(`/emprendedores/${id}/aprobar`, {}, token);
      cargarSolicitudesEmprendedor();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo aprobar.");
    }
  }

  async function rechazarEmprendedor(id: number) {
    if (!token) return;
    try {
      await apiPost(`/emprendedores/${id}/rechazar`, {}, token);
      cargarSolicitudesEmprendedor();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo rechazar.");
    }
  }

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !titulo || !texto) return;
    setError("");
    setEnviando(true);
    try {
      await apiPost(
        "/publicaciones",
        {
          tipo,
          titulo,
          texto,
          fecha: fecha || undefined,
          hora: hora || undefined,
          puntoEncuentro: puntoEncuentro || undefined,
          rsvp,
          duracionHoras: duracionHoras ? Number(duracionHoras) : undefined,
          activaEnMapa,
        },
        token,
      );
      setTitulo("");
      setTexto("");
      setFecha("");
      setHora("");
      setPuntoEncuentro("");
      setRsvp(false);
      setDuracionHoras("");
      setActivaEnMapa(false);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo crear la publicación.");
    } finally {
      setEnviando(false);
    }
  }

  async function eliminar(id: number) {
    if (!token) return;
    try {
      await apiDelete(`/publicaciones/${id}`, token);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo eliminar.");
    }
  }

  if (sesion?.rol !== "admin") {
    return (
      <div className="card p-5 text-sm text-fill-warning">
        No tienes permisos para ver esta sección.
      </div>
    );
  }

  const usaFechaHora = RUTAS_QUE_USAN_FECHA_HORA.includes(tipo);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-text-accent">Panel de Administración</h1>

      <form onSubmit={crear} className="card flex flex-col gap-3 p-4">
        <h2 className="text-sm font-semibold text-text-primary">Nueva publicación</h2>

        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value)}
          className="rounded-app border border-border bg-surface-2 px-3 py-2 text-text-primary"
        >
          {TIPOS_PUBLICACION.map((t) => (
            <option key={t} value={t}>
              {ETIQUETA_TIPO[t]}
            </option>
          ))}
        </select>

        <input
          type="text"
          placeholder="Título"
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          className="rounded-app border border-border bg-surface-2 px-3 py-2 text-text-primary outline-none"
        />
        <textarea
          placeholder="Texto"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          className="rounded-app border border-border bg-surface-2 px-3 py-2 text-text-primary outline-none"
          rows={3}
        />

        {usaFechaHora && (
          <>
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="rounded-app border border-border bg-surface-2 px-3 py-2 text-text-primary outline-none"
            />
            <input
              type="time"
              value={hora}
              onChange={(e) => setHora(e.target.value)}
              className="rounded-app border border-border bg-surface-2 px-3 py-2 text-text-primary outline-none"
            />
            <input
              type="text"
              placeholder="Punto de encuentro"
              value={puntoEncuentro}
              onChange={(e) => setPuntoEncuentro(e.target.value)}
              className="rounded-app border border-border bg-surface-2 px-3 py-2 text-text-primary outline-none"
            />
            <label className="flex items-center gap-2 text-xs text-text-secondary">
              <input type="checkbox" checked={rsvp} onChange={(e) => setRsvp(e.target.checked)} />
              Pedir confirmación de asistencia (RSVP)
            </label>
            <label className="flex items-center gap-2 text-xs text-text-secondary">
              <input
                type="checkbox"
                checked={activaEnMapa}
                onChange={(e) => setActivaEnMapa(e.target.checked)}
              />
              Mostrar en el mapa
            </label>
          </>
        )}

        <input
          type="number"
          min={1}
          placeholder="Vence en X horas (opcional)"
          value={duracionHoras}
          onChange={(e) => setDuracionHoras(e.target.value)}
          className="rounded-app border border-border bg-surface-2 px-3 py-2 text-text-primary outline-none"
        />

        {error && <p className="text-xs text-fill-warning">{error}</p>}

        <button type="submit" disabled={enviando} className="btn-hero rounded-app px-4 py-2 disabled:opacity-60">
          {enviando ? "Publicando..." : "Publicar"}
        </button>
      </form>

      <div className="card flex flex-col gap-2 p-4">
        <h2 className="text-sm font-semibold text-text-primary">Publicaciones activas</h2>
        {publicaciones.length === 0 && (
          <p className="text-xs text-text-secondary">No hay publicaciones todavía.</p>
        )}
        {publicaciones.map((p) => (
          <div key={p.id} className="flex items-center justify-between border-t border-border pt-2">
            <div>
              <p className="text-xs font-semibold text-text-accent">
                {ETIQUETA_TIPO[p.tipo as keyof typeof ETIQUETA_TIPO] ?? p.tipo}
              </p>
              <p className="text-sm text-text-primary">{p.titulo}</p>
            </div>
            <button
              type="button"
              onClick={() => eliminar(p.id)}
              className="text-xs text-fill-warning underline"
            >
              Eliminar
            </button>
          </div>
        ))}
      </div>

      <div className="card flex flex-col gap-2 p-4">
        <h2 className="text-sm font-semibold text-text-primary">
          Solicitudes de Impulsa (emprendedores)
        </h2>
        {solicitudesEmprendedor.length === 0 && (
          <p className="text-xs text-text-secondary">No hay solicitudes pendientes.</p>
        )}
        {solicitudesEmprendedor.map((s) => (
          <div key={s.id} className="flex items-center justify-between border-t border-border pt-2">
            <div>
              <p className="text-sm font-semibold text-text-accent">{s.nombreNegocio}</p>
              <p className="text-xs text-text-muted">
                {s.rubro} · {s.nombreDuenio}
              </p>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => aprobarEmprendedor(s.id)}
                className="text-xs text-fill-success underline"
              >
                Aprobar
              </button>
              <button
                type="button"
                onClick={() => rechazarEmprendedor(s.id)}
                className="text-xs text-fill-warning underline"
              >
                Rechazar
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
