"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/context/SessionContext";
import { apiGet, apiPost, apiPatch, apiDelete, ApiError } from "@/lib/api";
import { ETIQUETA_TIPO, TIPOS_PUBLICACION, type Publicacion } from "@/lib/publicaciones";
import type { Emprendedor } from "@/lib/emprendedores";
import { ImageUploadCrop } from "@/components/ImageUploadCrop";

const RUTAS_QUE_USAN_FECHA_HORA = ["rodada", "evento"];

interface SolicitudRegistro {
  id: number;
  nombre: string;
  telefono: string;
  ciudad: string | null;
  createdAt: string;
}

interface Miembro {
  id: number;
  nombre: string;
  telefono: string;
  ciudad: string | null;
  rol: string;
  createdAt: string;
}

interface RsvpDetalle {
  miembroNombre: string;
  estado: string;
}

const FORM_VACIO = {
  tipo: "comunicado",
  titulo: "",
  texto: "",
  fecha: "",
  hora: "",
  puntoEncuentro: "",
  rsvp: false,
  duracionHoras: "",
  activaEnMapa: false,
};

type SubTab = "publicaciones" | "integrantes";

export default function AdminPage() {
  const { sesion } = useSession();
  const token = sesion?.token ?? null;

  const [subTab, setSubTab] = useState<SubTab>("publicaciones");
  const [publicaciones, setPublicaciones] = useState<Publicacion[]>([]);
  const [form, setForm] = useState(FORM_VACIO);
  const [fotos, setFotos] = useState<string[]>([]);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [solicitudesEmprendedor, setSolicitudesEmprendedor] = useState<Emprendedor[]>([]);
  const [solicitudesRegistro, setSolicitudesRegistro] = useState<SolicitudRegistro[]>([]);
  const [miembros, setMiembros] = useState<Miembro[]>([]);
  const [asistenciaAbierta, setAsistenciaAbierta] = useState<number | null>(null);
  const [asistenciaDetalle, setAsistenciaDetalle] = useState<RsvpDetalle[]>([]);

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

  async function cargarSolicitudesRegistro() {
    if (!token) return;
    try {
      const lista = await apiGet<SolicitudRegistro[]>("/auth/solicitudes", token);
      setSolicitudesRegistro(lista);
    } catch {
      // ignorar
    }
  }

  async function cargarMiembros() {
    if (!token) return;
    try {
      const lista = await apiGet<Miembro[]>("/auth/miembros", token);
      setMiembros(lista);
    } catch {
      // ignorar
    }
  }

  useEffect(() => {
    cargar();
    cargarSolicitudesEmprendedor();
    cargarSolicitudesRegistro();
    cargarMiembros();
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

  async function aprobarRegistro(id: number) {
    if (!token) return;
    try {
      await apiPost(`/auth/solicitudes/${id}/aprobar`, {}, token);
      cargarSolicitudesRegistro();
      cargarMiembros();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo aprobar.");
    }
  }

  async function rechazarRegistro(id: number) {
    if (!token) return;
    try {
      await apiPost(`/auth/solicitudes/${id}/rechazar`, {}, token);
      cargarSolicitudesRegistro();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo rechazar.");
    }
  }

  function cargarEnFormulario(p: Publicacion) {
    setEditandoId(p.id);
    setForm({
      tipo: p.tipo,
      titulo: p.titulo,
      texto: p.texto,
      fecha: p.fecha ?? "",
      hora: p.hora ?? "",
      puntoEncuentro: p.puntoEncuentro ?? "",
      rsvp: p.rsvp,
      duracionHoras: p.duracionHoras ? String(p.duracionHoras) : "",
      activaEnMapa: p.activaEnMapa,
    });
    setFotos(p.fotos);
  }

  function limpiarFormulario() {
    setEditandoId(null);
    setForm(FORM_VACIO);
    setFotos([]);
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !form.titulo || !form.texto) return;
    setError("");
    setEnviando(true);
    const payload = {
      tipo: form.tipo,
      titulo: form.titulo,
      texto: form.texto,
      fecha: form.fecha || undefined,
      hora: form.hora || undefined,
      puntoEncuentro: form.puntoEncuentro || undefined,
      rsvp: form.rsvp,
      duracionHoras: form.duracionHoras ? Number(form.duracionHoras) : undefined,
      activaEnMapa: form.activaEnMapa,
      fotos: fotos.length > 0 ? fotos : undefined,
    };
    try {
      if (editandoId) {
        await apiPatch(`/publicaciones/${editandoId}`, payload, token);
      } else {
        await apiPost("/publicaciones", payload, token);
      }
      limpiarFormulario();
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar la publicación.");
    } finally {
      setEnviando(false);
    }
  }

  async function eliminar(id: number) {
    if (!token) return;
    try {
      await apiDelete(`/publicaciones/${id}`, token);
      if (editandoId === id) limpiarFormulario();
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo eliminar.");
    }
  }

  async function verAsistencia(id: number) {
    if (!token) return;
    if (asistenciaAbierta === id) {
      setAsistenciaAbierta(null);
      return;
    }
    try {
      const detalle = await apiGet<RsvpDetalle[]>(`/publicaciones/${id}/rsvps`, token);
      setAsistenciaDetalle(detalle);
      setAsistenciaAbierta(id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cargar la asistencia.");
    }
  }

  if (sesion?.rol !== "admin") {
    return (
      <div className="card p-5 text-sm text-fill-warning">
        No tienes permisos para ver esta sección.
      </div>
    );
  }

  const usaFechaHora = RUTAS_QUE_USAN_FECHA_HORA.includes(form.tipo);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-text-accent">Panel de Administración</h1>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setSubTab("publicaciones")}
          className={`flex-1 rounded-app px-3 py-2 text-sm ${
            subTab === "publicaciones" ? "btn-hero" : "card text-text-secondary"
          }`}
        >
          Publicaciones
        </button>
        <button
          type="button"
          onClick={() => setSubTab("integrantes")}
          className={`flex-1 rounded-app px-3 py-2 text-sm ${
            subTab === "integrantes" ? "btn-hero" : "card text-text-secondary"
          }`}
        >
          Integrantes
        </button>
      </div>

      {error && <p className="text-xs text-fill-warning">{error}</p>}

      {subTab === "publicaciones" && (
        <>
          <form onSubmit={guardar} className="card flex flex-col gap-3 p-4">
            <h2 className="text-sm font-semibold text-text-primary">
              {editandoId ? "Editar publicación" : "Nueva publicación"}
            </h2>

            <select
              value={form.tipo}
              onChange={(e) => setForm({ ...form, tipo: e.target.value })}
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
              value={form.titulo}
              onChange={(e) => setForm({ ...form, titulo: e.target.value })}
              className="rounded-app border border-border bg-surface-2 px-3 py-2 text-text-primary outline-none"
            />
            <textarea
              placeholder="Texto"
              value={form.texto}
              onChange={(e) => setForm({ ...form, texto: e.target.value })}
              className="rounded-app border border-border bg-surface-2 px-3 py-2 text-text-primary outline-none"
              rows={3}
            />

            {usaFechaHora && (
              <>
                <input
                  type="date"
                  value={form.fecha}
                  onChange={(e) => setForm({ ...form, fecha: e.target.value })}
                  className="rounded-app border border-border bg-surface-2 px-3 py-2 text-text-primary outline-none"
                />
                <input
                  type="time"
                  value={form.hora}
                  onChange={(e) => setForm({ ...form, hora: e.target.value })}
                  className="rounded-app border border-border bg-surface-2 px-3 py-2 text-text-primary outline-none"
                />
                <input
                  type="text"
                  placeholder="Punto de encuentro"
                  value={form.puntoEncuentro}
                  onChange={(e) => setForm({ ...form, puntoEncuentro: e.target.value })}
                  className="rounded-app border border-border bg-surface-2 px-3 py-2 text-text-primary outline-none"
                />
                <label className="flex items-center gap-2 text-xs text-text-secondary">
                  <input
                    type="checkbox"
                    checked={form.rsvp}
                    onChange={(e) => setForm({ ...form, rsvp: e.target.checked })}
                  />
                  Pedir confirmación de asistencia (RSVP)
                </label>
                <label className="flex items-center gap-2 text-xs text-text-secondary">
                  <input
                    type="checkbox"
                    checked={form.activaEnMapa}
                    onChange={(e) => setForm({ ...form, activaEnMapa: e.target.checked })}
                  />
                  Mostrar en el mapa
                </label>
              </>
            )}

            <input
              type="number"
              min={1}
              placeholder="Vence en X horas (opcional)"
              value={form.duracionHoras}
              onChange={(e) => setForm({ ...form, duracionHoras: e.target.value })}
              className="rounded-app border border-border bg-surface-2 px-3 py-2 text-text-primary outline-none"
            />

            <div className="flex flex-wrap gap-2">
              {fotos.map((url, i) => (
                <div key={url} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="Foto" className="h-16 w-16 rounded-app object-cover" />
                  <button
                    type="button"
                    onClick={() => setFotos(fotos.filter((_, idx) => idx !== i))}
                    className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-fill-warning text-[10px] text-on-primary"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <ImageUploadCrop token={token} onSubido={(url) => setFotos([...fotos, url])} etiqueta="Agregar foto" />

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={enviando}
                className="btn-hero flex-1 rounded-app px-4 py-2 disabled:opacity-60"
              >
                {enviando ? "Guardando..." : editandoId ? "Guardar cambios" : "Publicar"}
              </button>
              {editandoId && (
                <button
                  type="button"
                  onClick={limpiarFormulario}
                  className="rounded-app border border-border px-4 py-2 text-sm text-text-secondary"
                >
                  Cancelar
                </button>
              )}
            </div>
          </form>

          <div className="card flex flex-col gap-2 p-4">
            <h2 className="text-sm font-semibold text-text-primary">Publicaciones activas</h2>
            {publicaciones.length === 0 && (
              <p className="text-xs text-text-secondary">No hay publicaciones todavía.</p>
            )}
            {publicaciones.map((p) => (
              <div key={p.id} className="flex flex-col gap-2 border-t border-border pt-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-text-accent">
                      {ETIQUETA_TIPO[p.tipo as keyof typeof ETIQUETA_TIPO] ?? p.tipo}
                    </p>
                    <p className="text-sm text-text-primary">{p.titulo}</p>
                  </div>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => cargarEnFormulario(p)}
                      className="text-xs text-text-accent underline"
                    >
                      Editar
                    </button>
                    {p.rsvp && (
                      <button
                        type="button"
                        onClick={() => verAsistencia(p.id)}
                        className="text-xs text-blue-text underline"
                      >
                        Asistencia
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => eliminar(p.id)}
                      className="text-xs text-fill-warning underline"
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
                {asistenciaAbierta === p.id && (
                  <div className="flex flex-col gap-1 rounded-app bg-surface-2 p-2">
                    {asistenciaDetalle.length === 0 ? (
                      <p className="text-xs text-text-muted">Nadie ha respondido todavía.</p>
                    ) : (
                      asistenciaDetalle.map((r, i) => (
                        <p key={i} className="text-xs text-text-secondary">
                          {r.miembroNombre} —{" "}
                          {r.estado === "yes" ? "Voy" : r.estado === "maybe" ? "Tal vez" : "No voy"}
                        </p>
                      ))
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {subTab === "integrantes" && (
        <>
          <div className="card flex flex-col gap-2 p-4">
            <h2 className="text-sm font-semibold text-text-primary">Solicitudes de registro</h2>
            {solicitudesRegistro.length === 0 && (
              <p className="text-xs text-text-secondary">No hay solicitudes pendientes.</p>
            )}
            {solicitudesRegistro.map((s) => (
              <div key={s.id} className="flex items-center justify-between border-t border-border pt-2">
                <div>
                  <p className="text-sm font-semibold text-text-primary">{s.nombre}</p>
                  <p className="text-xs text-text-muted">
                    {s.telefono} · {s.ciudad ?? "Sin ciudad"}
                  </p>
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => aprobarRegistro(s.id)}
                    className="text-xs text-fill-success underline"
                  >
                    Aprobar
                  </button>
                  <button
                    type="button"
                    onClick={() => rechazarRegistro(s.id)}
                    className="text-xs text-fill-warning underline"
                  >
                    Rechazar
                  </button>
                </div>
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

          <div className="card flex flex-col gap-2 p-4">
            <h2 className="text-sm font-semibold text-text-primary">Todos los integrantes</h2>
            {miembros.map((m) => (
              <div key={m.id} className="flex items-center justify-between border-t border-border pt-2">
                <div>
                  <p className="text-sm text-text-primary">{m.nombre}</p>
                  <p className="text-xs text-text-muted">
                    {m.telefono} · {m.ciudad ?? "Sin ciudad"}
                  </p>
                </div>
                <span className="text-xs text-text-accent">{m.rol}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
