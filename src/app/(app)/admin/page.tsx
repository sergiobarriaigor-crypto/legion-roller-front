"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useSession } from "@/context/SessionContext";
import { apiGet, apiPost, apiPatch, apiDelete, apiUpload, ApiError } from "@/lib/api";
import {
  ETIQUETA_TIPO,
  TIPOS_PUBLICACION,
  ETIQUETA_FINALIZACION,
  TIPOS_FINALIZACION,
  ETIQUETA_ASISTENCIA_EVENTO,
  TIPOS_ASISTENCIA_EVENTO,
  listarAsistenciaEvento,
  alternarAsistenciaEvento,
  type Publicacion,
  type AsistenciaEventoDetalle,
} from "@/lib/publicaciones";
import type { Emprendedor } from "@/lib/emprendedores";
import { Avatar } from "@/components/Avatar";

const SelectorPuntoMapa = dynamic(
  () => import("@/components/Mapa/SelectorPuntoMapa").then((m) => m.SelectorPuntoMapa),
  { ssr: false, loading: () => <p className="text-xs text-text-secondary">Cargando mapa...</p> },
);

const RUTAS_QUE_USAN_FECHA_HORA = ["rodada", "evento"];
const MAX_FOTOS_PUBLICACION = 6;

function formatFechaNacimiento(fecha: string | null): string {
  if (!fecha) return "Sin fecha de nacimiento";
  return new Date(fecha).toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
}

const OPCIONES_DURACION = [
  { etiqueta: "24 horas", valor: "24" },
  { etiqueta: "3 días", valor: "72" },
  { etiqueta: "7 días", valor: "168" },
  { etiqueta: "15 días", valor: "360" },
  { etiqueta: "30 días", valor: "720" },
  { etiqueta: "Sin vencimiento", valor: "" },
];

interface SolicitudRegistro {
  id: number;
  nombre: string;
  correo: string;
  telefono: string | null;
  fechaNacimiento: string | null;
  fotoUrl: string | null;
  ciudad: string | null;
  createdAt: string;
}

interface Miembro {
  id: number;
  nombre: string;
  correo: string;
  telefono: string | null;
  fechaNacimiento: string | null;
  fotoUrl: string | null;
  ciudad: string | null;
  rol: string;
  categoria: "legion" | "comunidad" | null;
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
  puntoLat: null as number | null,
  puntoLon: null as number | null,
  tipoFinalizacion: "" as string,
  puntoFinLat: null as number | null,
  puntoFinLon: null as number | null,
  distanciaMinimaKm: "",
  tipoAsistenciaEvento: "" as string,
  codigoAsistencia: "",
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
  const [subiendoFotos, setSubiendoFotos] = useState(false);
  const fotoInputRef = useRef<HTMLInputElement>(null);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [solicitudesEmprendedor, setSolicitudesEmprendedor] = useState<Emprendedor[]>([]);
  const [directorioImpulsa, setDirectorioImpulsa] = useState<Emprendedor[]>([]);
  const [filtroDirectorio, setFiltroDirectorio] = useState("");
  const [emprendedorAEliminar, setEmprendedorAEliminar] = useState<Emprendedor | null>(null);
  const [eliminandoEmprendedor, setEliminandoEmprendedor] = useState(false);
  const [solicitudesRegistro, setSolicitudesRegistro] = useState<SolicitudRegistro[]>([]);
  const [miembros, setMiembros] = useState<Miembro[]>([]);
  const [filtroMiembros, setFiltroMiembros] = useState("");
  // Colapsada por defecto: con 50+ integrantes, mostrar la lista completa de
  // entrada hace carreta el panel entero. Buscar (filtroMiembros) la
  // despliega sola, sin necesidad de tocar "Mostrar" primero.
  const [mostrarMiembros, setMostrarMiembros] = useState(false);
  const [asistenciaAbierta, setAsistenciaAbierta] = useState<number | null>(null);
  const [asistenciaDetalle, setAsistenciaDetalle] = useState<RsvpDetalle[]>([]);
  const [asistenciaEventoDetalle, setAsistenciaEventoDetalle] = useState<AsistenciaEventoDetalle[]>([]);

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

  async function cargarDirectorioImpulsa() {
    try {
      const lista = await apiGet<Emprendedor[]>("/emprendedores", null);
      setDirectorioImpulsa(lista);
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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargar();
    cargarSolicitudesEmprendedor();
    cargarDirectorioImpulsa();
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

  async function confirmarEliminarEmprendedor() {
    if (!token || !emprendedorAEliminar) return;
    setEliminandoEmprendedor(true);
    try {
      await apiDelete(`/emprendedores/${emprendedorAEliminar.id}`, token);
      setEmprendedorAEliminar(null);
      cargarDirectorioImpulsa();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo eliminar la ficha.");
    } finally {
      setEliminandoEmprendedor(false);
    }
  }

  async function aprobarRegistro(id: number, categoria: "legion" | "comunidad") {
    if (!token) return;
    try {
      await apiPost(`/auth/solicitudes/${id}/aprobar`, { categoria }, token);
      cargarSolicitudesRegistro();
      cargarMiembros();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo aprobar.");
    }
  }

  // Categoría interna (solo el admin la ve/maneja) — pensada para más
  // adelante dar accesos limitados dentro de la app según el grupo, todavía
  // no implementado, solo el dato queda guardado desde ya.
  async function cambiarCategoriaMiembro(id: number, categoria: "legion" | "comunidad") {
    if (!token) return;
    try {
      await apiPost(`/auth/miembros/${id}/categoria`, { categoria }, token);
      cargarMiembros();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cambiar la categoría.");
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

  // Al tocar el mapa, además de fijar las coordenadas reales, se completa
  // "Punto de encuentro" con la dirección legible (geocodificación inversa
  // de Nominatim/OpenStreetMap, mismo proveedor que los mapas de la app) para
  // que el Admin no tenga que escribirla a mano. Si falla, queda como estaba.
  async function elegirPuntoMapa(lat: number, lon: number) {
    setForm((f) => ({ ...f, puntoLat: lat, puntoLon: lon }));
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`,
      );
      const data = await res.json();
      const direccion = data?.display_name;
      if (typeof direccion === "string" && direccion) {
        setForm((f) => ({ ...f, puntoEncuentro: direccion }));
      }
    } catch {
      // el Admin puede escribir el punto de encuentro a mano si esto falla
    }
  }

  function elegirPuntoFinMapa(lat: number, lon: number) {
    setForm((f) => ({ ...f, puntoFinLat: lat, puntoFinLon: lon }));
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
      puntoLat: p.puntoLat,
      puntoLon: p.puntoLon,
      tipoFinalizacion: p.tipoFinalizacion ?? "",
      puntoFinLat: p.puntoFinLat,
      puntoFinLon: p.puntoFinLon,
      distanciaMinimaKm: p.distanciaMinimaKm ? String(p.distanciaMinimaKm) : "",
      tipoAsistenciaEvento: p.tipoAsistenciaEvento ?? "",
      codigoAsistencia: p.codigoAsistencia ?? "",
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

  // Mismo patrón que post/page.tsx e impulsa/page.tsx: selector nativo
  // `multiple`, sube todo en paralelo sin paso de recorte (a diferencia del
  // antiguo ImageUploadCrop, pensado para una sola foto cuadrada a la vez).
  async function onFotosElegidas(e: React.ChangeEvent<HTMLInputElement>) {
    const elegidos = Array.from(e.target.files ?? []);
    if (elegidos.length === 0 || !token) return;
    setError("");

    const espacioDisponible = MAX_FOTOS_PUBLICACION - fotos.length;
    const archivos = elegidos.slice(0, espacioDisponible);
    if (elegidos.length > espacioDisponible) {
      setError(
        `Solo se admiten ${MAX_FOTOS_PUBLICACION} fotos por publicación; se tomaron las primeras ${espacioDisponible}.`,
      );
    }

    setSubiendoFotos(true);
    try {
      const subidas = await Promise.all(
        archivos.map((archivo) => apiUpload<{ url: string }>("/uploads", archivo, token, archivo.name)),
      );
      setFotos((prev) => [...prev, ...subidas.map((s) => s.url)]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudieron subir las fotos.");
    } finally {
      setSubiendoFotos(false);
      if (fotoInputRef.current) fotoInputRef.current.value = "";
    }
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
      puntoLat: form.puntoLat ?? undefined,
      puntoLon: form.puntoLon ?? undefined,
      tipoFinalizacion: form.tipoFinalizacion || undefined,
      puntoFinLat: form.tipoFinalizacion === "punto_llegada" ? form.puntoFinLat ?? undefined : undefined,
      puntoFinLon: form.tipoFinalizacion === "punto_llegada" ? form.puntoFinLon ?? undefined : undefined,
      distanciaMinimaKm:
        form.tipoFinalizacion === "distancia_minima" && form.distanciaMinimaKm
          ? Number(form.distanciaMinimaKm)
          : undefined,
      tipoAsistenciaEvento: form.tipo === "evento" ? form.tipoAsistenciaEvento || undefined : undefined,
      codigoAsistencia:
        form.tipo === "evento" && form.tipoAsistenciaEvento === "codigo"
          ? form.codigoAsistencia || undefined
          : undefined,
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

  async function marcarFinalizada(id: number) {
    if (!token) return;
    try {
      await apiPatch(`/publicaciones/${id}`, { cerrada: true }, token);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo marcar como finalizada.");
    }
  }

  async function verAsistencia(p: Publicacion) {
    if (!token) return;
    if (asistenciaAbierta === p.id) {
      setAsistenciaAbierta(null);
      return;
    }
    try {
      if (p.tipo === "evento" && p.tipoAsistenciaEvento === "cierre_manual") {
        const detalle = await listarAsistenciaEvento(p.id, token);
        setAsistenciaEventoDetalle(detalle);
      } else {
        const detalle = await apiGet<RsvpDetalle[]>(`/publicaciones/${p.id}/rsvps`, token);
        setAsistenciaDetalle(detalle);
      }
      setAsistenciaAbierta(p.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cargar la asistencia.");
    }
  }

  async function alternarAsistencia(publicacionId: number, miembroId: number) {
    if (!token) return;
    try {
      await alternarAsistenciaEvento(publicacionId, miembroId, token);
      const detalle = await listarAsistenciaEvento(publicacionId, token);
      setAsistenciaEventoDetalle(detalle);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo actualizar la asistencia.");
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

  const directorioFiltrado = directorioImpulsa.filter((e) => {
    const q = filtroDirectorio.trim().toLowerCase();
    if (!q) return true;
    return e.nombreNegocio.toLowerCase().includes(q) || e.nombreDuenio.toLowerCase().includes(q);
  });

  const listaMiembrosVisible = mostrarMiembros || filtroMiembros.trim().length > 0;

  const miembrosFiltrados = miembros.filter((m) => {
    const q = filtroMiembros.trim().toLowerCase();
    if (!q) return true;
    return (
      m.nombre.toLowerCase().includes(q) ||
      m.correo.toLowerCase().includes(q) ||
      (m.telefono?.includes(q) ?? false)
    );
  });

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
                {form.tipo === "rodada" && (
                  <div className="flex flex-col gap-1">
                    <p className="text-xs text-text-secondary">
                      Toca el mapa para fijar el punto de inicio real (usado para validar
                      asistencia por GPS).
                    </p>
                    <SelectorPuntoMapa
                      lat={form.puntoLat}
                      lon={form.puntoLon}
                      onSeleccionar={elegirPuntoMapa}
                    />
                    {form.puntoLat !== null && form.puntoLon !== null && (
                      <p className="text-xs text-text-muted">
                        {form.puntoLat.toFixed(5)}, {form.puntoLon.toFixed(5)}
                      </p>
                    )}
                  </div>
                )}
                {form.tipo === "rodada" && (
                  <div className="flex flex-col gap-2">
                    <label className="flex flex-col gap-1 text-xs text-text-secondary">
                      Cómo se valida el fin de la ruta
                      <select
                        value={form.tipoFinalizacion}
                        onChange={(e) => setForm({ ...form, tipoFinalizacion: e.target.value })}
                        className="rounded-app border border-border bg-surface-2 px-3 py-2 text-text-primary"
                      >
                        <option value="">Sin definir (comportamiento histórico)</option>
                        {TIPOS_FINALIZACION.map((t) => (
                          <option key={t} value={t}>
                            {ETIQUETA_FINALIZACION[t]}
                          </option>
                        ))}
                      </select>
                    </label>

                    {form.tipoFinalizacion === "punto_llegada" && (
                      <div className="flex flex-col gap-1">
                        <p className="text-xs text-text-secondary">
                          Toca el mapa para fijar el punto de llegada.
                        </p>
                        <SelectorPuntoMapa
                          lat={form.puntoFinLat}
                          lon={form.puntoFinLon}
                          onSeleccionar={elegirPuntoFinMapa}
                        />
                        {form.puntoFinLat !== null && form.puntoFinLon !== null && (
                          <p className="text-xs text-text-muted">
                            {form.puntoFinLat.toFixed(5)}, {form.puntoFinLon.toFixed(5)}
                          </p>
                        )}
                      </div>
                    )}

                    {form.tipoFinalizacion === "distancia_minima" && (
                      <input
                        type="number"
                        min={0.1}
                        step={0.1}
                        placeholder="Distancia mínima (km)"
                        value={form.distanciaMinimaKm}
                        onChange={(e) => setForm({ ...form, distanciaMinimaKm: e.target.value })}
                        className="rounded-app border border-border bg-surface-2 px-3 py-2 text-text-primary outline-none"
                      />
                    )}

                    {form.tipoFinalizacion === "ida_vuelta" && (
                      <p className="text-xs text-text-secondary">
                        El patinador debe alejarse del punto de inicio y volver a él para
                        completar la ruta.
                      </p>
                    )}

                    {form.tipoFinalizacion === "cierre_manual" && (
                      <p className="text-xs text-text-secondary">
                        No se valida distancia ni punto de llegada. La rodada queda abierta hasta
                        que la marques como finalizada manualmente.
                      </p>
                    )}
                  </div>
                )}
                {form.tipo === "evento" && (
                  <div className="flex flex-col gap-2">
                    <label className="flex flex-col gap-1 text-xs text-text-secondary">
                      Cómo se valida la asistencia
                      <select
                        value={form.tipoAsistenciaEvento}
                        onChange={(e) => setForm({ ...form, tipoAsistenciaEvento: e.target.value })}
                        className="rounded-app border border-border bg-surface-2 px-3 py-2 text-text-primary"
                      >
                        <option value="">Sin definir (no se puede confirmar asistencia)</option>
                        {TIPOS_ASISTENCIA_EVENTO.map((t) => (
                          <option key={t} value={t}>
                            {ETIQUETA_ASISTENCIA_EVENTO[t]}
                          </option>
                        ))}
                      </select>
                    </label>

                    {form.tipoAsistenciaEvento === "gps_puntual" && (
                      <div className="flex flex-col gap-1">
                        <p className="text-xs text-text-secondary">
                          Toca el mapa para fijar el punto del evento.
                        </p>
                        <SelectorPuntoMapa
                          lat={form.puntoLat}
                          lon={form.puntoLon}
                          onSeleccionar={elegirPuntoMapa}
                        />
                        {form.puntoLat !== null && form.puntoLon !== null && (
                          <p className="text-xs text-text-muted">
                            {form.puntoLat.toFixed(5)}, {form.puntoLon.toFixed(5)}
                          </p>
                        )}
                      </div>
                    )}

                    {form.tipoAsistenciaEvento === "codigo" && (
                      <input
                        type="text"
                        placeholder="Código de asistencia"
                        value={form.codigoAsistencia}
                        onChange={(e) => setForm({ ...form, codigoAsistencia: e.target.value })}
                        className="rounded-app border border-border bg-surface-2 px-3 py-2 text-text-primary outline-none"
                      />
                    )}

                    {form.tipoAsistenciaEvento === "cierre_manual" && (
                      <p className="text-xs text-text-secondary">
                        Nadie confirma por su cuenta. Después del evento, pasas lista manualmente
                        desde el botón &quot;Asistencia&quot; en la lista de publicaciones.
                      </p>
                    )}

                    {form.tipoAsistenciaEvento === "autoconfirmacion" && (
                      <p className="text-xs text-text-secondary">
                        Cada asistente confirma con un botón simple, disponible desde 15 minutos
                        antes hasta 2 horas después de la hora del evento.
                      </p>
                    )}
                  </div>
                )}
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

            <label className="flex flex-col gap-1 text-xs text-text-secondary">
              Duración de la publicación
              <select
                value={form.duracionHoras}
                onChange={(e) => setForm({ ...form, duracionHoras: e.target.value })}
                className="rounded-app border border-border bg-surface-2 px-3 py-2 text-sm text-text-primary"
              >
                {OPCIONES_DURACION.map((o) => (
                  <option key={o.etiqueta} value={o.valor}>
                    {o.etiqueta}
                  </option>
                ))}
              </select>
            </label>

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
            {fotos.length < MAX_FOTOS_PUBLICACION && (
              <div className="flex items-center gap-3">
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
                      ? `Agregar fotos (hasta ${MAX_FOTOS_PUBLICACION}, opcional)`
                      : "Agregar más fotos"}
                </button>
              </div>
            )}

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
                        onClick={() => verAsistencia(p)}
                        className="text-xs text-blue-text underline"
                      >
                        Asistencia
                      </button>
                    )}
                    {p.tipoFinalizacion === "cierre_manual" && !p.cerrada && (
                      <button
                        type="button"
                        onClick={() => marcarFinalizada(p.id)}
                        className="text-xs text-fill-success underline"
                      >
                        Marcar finalizada
                      </button>
                    )}
                    {p.tipoFinalizacion === "cierre_manual" && p.cerrada && (
                      <span className="text-xs text-text-muted">Finalizada</span>
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
                    {p.tipo === "evento" && p.tipoAsistenciaEvento === "cierre_manual" ? (
                      asistenciaEventoDetalle.length === 0 ? (
                        <p className="text-xs text-text-muted">Nadie ha respondido todavía.</p>
                      ) : (
                        asistenciaEventoDetalle.map((r) => (
                          <label
                            key={r.miembroId}
                            className="flex items-center justify-between text-xs text-text-secondary"
                          >
                            <span>
                              {r.miembroNombre} — {r.estado === "yes" ? "Voy" : "Tal vez"}
                            </span>
                            <input
                              type="checkbox"
                              checked={r.asistio}
                              onChange={() => alternarAsistencia(p.id, r.miembroId)}
                            />
                          </label>
                        ))
                      )
                    ) : asistenciaDetalle.length === 0 ? (
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
                <div className="flex items-center gap-3">
                  <Avatar fotoUrl={s.fotoUrl} nombre={s.nombre} tamano={40} />
                  <div>
                    <p className="text-sm font-semibold text-text-primary">{s.nombre}</p>
                    <p className="text-xs text-text-muted">{s.correo}</p>
                    <p className="text-xs text-text-muted">
                      {s.telefono ?? "Sin teléfono"} · {s.ciudad ?? "Sin ciudad"}
                    </p>
                    <p className="text-xs text-text-muted">{formatFechaNacimiento(s.fechaNacimiento)}</p>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-[10px] text-text-muted">Aprobar como:</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => aprobarRegistro(s.id, "legion")}
                      className="text-xs text-fill-success underline"
                    >
                      Legión
                    </button>
                    <button
                      type="button"
                      onClick={() => aprobarRegistro(s.id, "comunidad")}
                      className="text-xs text-fill-success underline"
                    >
                      Comunidad
                    </button>
                  </div>
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
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-text-primary">Directorio de Impulsa</h2>
              <span className="text-xs text-text-muted">
                {filtroDirectorio
                  ? `${directorioFiltrado.length} de ${directorioImpulsa.length}`
                  : directorioImpulsa.length}
              </span>
            </div>
            {directorioImpulsa.length > 0 && (
              <input
                type="text"
                placeholder="Buscar por negocio o dueño..."
                value={filtroDirectorio}
                onChange={(e) => setFiltroDirectorio(e.target.value)}
                className="rounded-app border border-border bg-surface-2 px-3 py-2 text-sm text-text-primary outline-none"
              />
            )}
            {directorioImpulsa.length === 0 && (
              <p className="text-xs text-text-secondary">No hay fichas aprobadas en el directorio.</p>
            )}
            {directorioImpulsa.length > 0 && directorioFiltrado.length === 0 && (
              <p className="text-xs text-text-secondary">
                Ningún resultado para &quot;{filtroDirectorio}&quot;.
              </p>
            )}
            {directorioFiltrado.map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-3 border-t border-border pt-2">
                <div className="flex items-center gap-3">
                  <Avatar fotoUrl={e.duenioFotoUrl} nombre={e.nombreDuenio} tamano={40} />
                  <div>
                    <p className="text-sm font-semibold text-text-accent">{e.nombreNegocio}</p>
                    <p className="text-xs text-text-muted">
                      {e.rubro} · {e.nombreDuenio}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setEmprendedorAEliminar(e)}
                  className="shrink-0 text-xs text-fill-warning underline"
                >
                  Eliminar
                </button>
              </div>
            ))}
          </div>

          <div className="card flex flex-col gap-2 p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-text-primary">Todos los integrantes</h2>
              <div className="flex items-center gap-2">
                <span className="text-xs text-text-muted">
                  {filtroMiembros ? `${miembrosFiltrados.length} de ${miembros.length}` : miembros.length}
                </span>
                {miembros.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setMostrarMiembros((v) => !v)}
                    className="text-xs text-text-accent underline"
                  >
                    {listaMiembrosVisible ? "Ocultar" : "Mostrar"}
                  </button>
                )}
              </div>
            </div>
            {miembros.length > 0 && (
              <input
                type="text"
                placeholder="Buscar por nombre o teléfono..."
                value={filtroMiembros}
                onChange={(e) => setFiltroMiembros(e.target.value)}
                className="rounded-app border border-border bg-surface-2 px-3 py-2 text-sm text-text-primary outline-none"
              />
            )}
            {listaMiembrosVisible && (
              <>
                {miembros.length > 0 && miembrosFiltrados.length === 0 && (
                  <p className="text-xs text-text-secondary">
                    Ningún resultado para &quot;{filtroMiembros}&quot;.
                  </p>
                )}
                {miembrosFiltrados.map((m) => (
                  <div key={m.id} className="flex items-center justify-between border-t border-border pt-2">
                    <div className="flex items-center gap-3">
                      <Avatar fotoUrl={m.fotoUrl} nombre={m.nombre} tamano={36} />
                      <div>
                        <p className="text-sm text-text-primary">{m.nombre}</p>
                        <p className="text-xs text-text-muted">{m.correo}</p>
                        <p className="text-xs text-text-muted">
                          {m.telefono ?? "Sin teléfono"} · {m.ciudad ?? "Sin ciudad"}
                        </p>
                        <p className="text-xs text-text-muted">{formatFechaNacimiento(m.fechaNacimiento)}</p>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="text-xs text-text-accent">{m.rol}</span>
                      {m.rol !== "admin" && (
                        <select
                          value={m.categoria ?? ""}
                          onChange={(e) =>
                            cambiarCategoriaMiembro(m.id, e.target.value as "legion" | "comunidad")
                          }
                          className="rounded-app border border-border bg-surface-2 px-1.5 py-0.5 text-[11px] text-text-primary outline-none"
                        >
                          <option value="" disabled>
                            Sin categoría
                          </option>
                          <option value="legion">Legión</option>
                          <option value="comunidad">Comunidad</option>
                        </select>
                      )}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </>
      )}

      {emprendedorAEliminar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6">
          <div className="card flex w-full max-w-xs flex-col gap-3 p-5">
            <h2 className="text-sm font-semibold text-text-accent">Eliminar ficha</h2>
            <p className="text-xs text-text-secondary">
              ¿Seguro que quieres eliminar la ficha <strong>{emprendedorAEliminar.nombreNegocio}</strong> de{" "}
              {emprendedorAEliminar.nombreDuenio}? Esta acción es irreversible y no se puede deshacer.
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                disabled={eliminandoEmprendedor}
                onClick={confirmarEliminarEmprendedor}
                className="rounded-app bg-red-700 px-4 py-2 text-sm text-white disabled:opacity-50"
              >
                {eliminandoEmprendedor ? "Eliminando..." : "Sí, eliminar"}
              </button>
              <button
                type="button"
                disabled={eliminandoEmprendedor}
                onClick={() => setEmprendedorAEliminar(null)}
                className="text-xs text-text-secondary underline"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
