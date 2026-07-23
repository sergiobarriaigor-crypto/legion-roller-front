"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { IconCheck, IconTarget, IconLock, IconPlayerPlay, IconPhoto } from "@tabler/icons-react";
import { useSession } from "@/context/SessionContext";
import { apiGet, apiPatch, apiPut, apiDelete, ApiError } from "@/lib/api";
import { CATALOGO_TECNICAS, HITOS_DISTANCIA_KM, type MiPerfil } from "@/lib/perfil";
import { ETIQUETA_MOTIVO, type MiEmergencia } from "@/lib/emergencias";
import type { Post } from "@/lib/posts";
import { ImageUploadCrop } from "@/components/ImageUploadCrop";
import { GaleriaPerfil } from "@/components/Perfil/GaleriaPerfil";
import { Avatar } from "@/components/Avatar";
import {
  tiempoTranscurrido,
  dentroDeFiltroFecha,
  OPCIONES_FILTRO_FECHA,
  type FiltroFecha,
} from "@/lib/tiempo";

interface RecorridoResumen {
  id: number;
  tipo: string;
  distanciaKm: number;
  duracionSeg: number;
  createdAt: string;
}

export default function PerfilPage() {
  const { sesion, logout } = useSession();
  const token = sesion?.token ?? null;
  const router = useRouter();

  const [perfil, setPerfil] = useState<MiPerfil | null>(null);
  const [misPosts, setMisPosts] = useState<Post[]>([]);
  const [misRecorridos, setMisRecorridos] = useState<RecorridoResumen[]>([]);
  const [miEmergencia, setMiEmergencia] = useState<MiEmergencia | null>(null);
  const [nuevoEstado, setNuevoEstado] = useState("");
  const [error, setError] = useState("");
  const [mostrarTodosReconocimientos, setMostrarTodosReconocimientos] = useState(false);
  const [mostrarTodosRecorridos, setMostrarTodosRecorridos] = useState(false);
  const [mostrarTodasPublicaciones, setMostrarTodasPublicaciones] = useState(false);
  const [filtroFecha, setFiltroFecha] = useState<FiltroFecha>("todos");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  // Doble confirmación al marcar una técnica como dominada (pedido explícito:
  // evitar selecciones accidentales). Solo aplica al activarla — al quitarla
  // (ya dominada -> pendiente) no hace falta confirmar nada.
  const [confirmarTecnica, setConfirmarTecnica] = useState<{
    clave: string;
    etiqueta: string;
    paso: 1 | 2;
  } | null>(null);

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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function toggleTecnica(tecnica: string) {
    if (!token) return;
    try {
      await apiPatch(`/perfil/tecnicas/${tecnica}`, {}, token);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo actualizar la técnica.");
    }
  }

  function onClickTecnica(clave: string, etiqueta: string) {
    if (perfil?.tecnicas.includes(clave)) {
      toggleTecnica(clave);
      return;
    }
    setConfirmarTecnica({ clave, etiqueta, paso: 1 });
  }

  function confirmarPrimerPaso() {
    setConfirmarTecnica((prev) => (prev ? { ...prev, paso: 2 } : null));
  }

  function confirmarSegundoPaso() {
    if (confirmarTecnica) toggleTecnica(confirmarTecnica.clave);
    setConfirmarTecnica(null);
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
      <div className="card -mx-4 flex flex-col items-center gap-3 px-3 py-5">
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
        <div className="card -mx-4 flex items-center justify-between border-fill-warning bg-red-700/10 px-3 py-4">
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

      <div className="card -mx-4 flex flex-col gap-2 px-3 py-4">
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

      <div className="card -mx-4 grid grid-cols-3 gap-3 px-3 py-4 text-center">
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

      <div className="card -mx-4 flex flex-col gap-3 px-3 py-4">
        <h2 className="text-sm font-semibold text-text-primary">Técnicas dominadas</h2>
        {CATALOGO_TECNICAS.map((cat) => (
          <div key={cat.categoria} className="flex flex-col gap-1.5">
            <h3 className="text-xs font-semibold text-text-secondary">{cat.categoria}</h3>
            <div className="flex flex-wrap gap-2">
              {cat.tecnicas.map((t) => (
                <button
                  key={t.clave}
                  type="button"
                  onClick={() => onClickTecnica(t.clave, t.etiqueta)}
                  className={`rounded-app px-3 py-1 text-xs ${
                    perfil.tecnicas.includes(t.clave)
                      ? "btn-hero"
                      : "border border-border text-text-secondary"
                  }`}
                >
                  {t.etiqueta}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="card -mx-4 flex flex-col gap-3 px-3 py-4">
        <h2 className="text-sm font-semibold text-text-primary">Distancias Alcanzadas</h2>
        <p className="text-xs text-text-secondary">
          Cada hito se desbloquea al completar esa distancia en una sola ruta — no se suman
          varias sesiones.
        </p>
        <div className="flex flex-wrap gap-2">
          {(() => {
            const disponibleKm = HITOS_DISTANCIA_KM.find(
              (km) => perfil.mejorDistanciaRuta < km,
            );
            return HITOS_DISTANCIA_KM.map((km) => {
              const desbloqueado = perfil.mejorDistanciaRuta >= km;
              const disponible = !desbloqueado && km === disponibleKm;
              return (
                <div
                  key={km}
                  className={`flex items-center gap-1.5 rounded-app px-3 py-1 text-xs ${
                    desbloqueado
                      ? "btn-hero"
                      : disponible
                        ? "border-2 border-border-accent text-text-accent"
                        : "border border-border text-text-muted opacity-60"
                  }`}
                >
                  {desbloqueado ? (
                    <IconCheck size={14} />
                  ) : disponible ? (
                    <IconTarget size={14} />
                  ) : (
                    <IconLock size={14} />
                  )}
                  {km} km
                </div>
              );
            });
          })()}
        </div>
      </div>

      <GaleriaPerfil miembroId={perfil.id} esPropio token={token} />

      <div className="card -mx-4 flex flex-col gap-2 px-3 py-4">
        <h2 className="text-sm font-semibold text-text-primary">Reconocimientos recibidos</h2>
        {perfil.reconocimientos.length === 0 && (
          <p className="text-xs text-text-secondary">Todavía no tienes reconocimientos.</p>
        )}
        {(mostrarTodosReconocimientos
          ? perfil.reconocimientos
          : perfil.reconocimientos.slice(0, 2)
        ).map((r) => (
          <div key={r.id} className="flex items-start gap-2">
            <Avatar fotoUrl={r.deFotoUrl} nombre={r.deNombre} tamano={32} />
            <p className="text-xs text-text-secondary">
              <span className="font-semibold text-text-primary">{r.deNombre}:</span> {r.texto}
              <span className="mt-0.5 block text-[10px] text-text-secondary/70">
                {tiempoTranscurrido(r.createdAt)}
              </span>
            </p>
          </div>
        ))}
        {perfil.reconocimientos.length > 2 && (
          <button
            type="button"
            onClick={() => setMostrarTodosReconocimientos((v) => !v)}
            className="self-start text-xs text-text-accent underline"
          >
            {mostrarTodosReconocimientos
              ? "Ocultar"
              : `Mostrar todos (${perfil.reconocimientos.length})`}
          </button>
        )}
      </div>

      {misPosts.length > 0 && (
        <div className="card -mx-4 flex flex-col gap-2 px-3 py-4">
          <h2 className="text-sm font-semibold text-text-primary">Mis publicaciones</h2>
          {(mostrarTodasPublicaciones ? misPosts : misPosts.slice(0, 2)).map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => router.push(`/post?post=${p.id}`)}
              className="flex items-center gap-3 rounded-app border border-border p-2 text-left"
            >
              {p.tipo === "video" && p.videoUrl ? (
                <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-app bg-surface-2">
                  <video src={p.videoUrl} muted preload="metadata" className="h-full w-full object-cover" />
                  <IconPlayerPlay
                    size={18}
                    className="absolute inset-0 m-auto text-white"
                  />
                </div>
              ) : p.fotos.length > 0 ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.fotos[0]}
                  alt={p.titulo}
                  className="h-16 w-16 shrink-0 rounded-app object-cover"
                />
              ) : (
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-app bg-surface-2">
                  <IconPhoto size={22} className="text-text-muted" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-text-primary">{p.titulo}</p>
                <p className="truncate text-xs text-text-secondary">{p.resena}</p>
                <p className="mt-1 text-[11px] text-text-muted">
                  {tiempoTranscurrido(p.createdAt)} · {p.reaccionesCount} me gusta
                </p>
              </div>
            </button>
          ))}
          {misPosts.length > 2 && (
            <button
              type="button"
              onClick={() => setMostrarTodasPublicaciones((v) => !v)}
              className="self-start text-xs text-text-accent underline"
            >
              {mostrarTodasPublicaciones ? "Ocultar" : `Mostrar todas (${misPosts.length})`}
            </button>
          )}
        </div>
      )}

      {misRecorridos.length > 0 && (() => {
        const recorridosFiltrados = misRecorridos.filter((r) =>
          dentroDeFiltroFecha(r.createdAt, filtroFecha, fechaDesde, fechaHasta),
        );
        return (
          <div className="card -mx-4 flex flex-col gap-2 px-3 py-4">
            <h2 className="text-sm font-semibold text-text-primary">Historial de recorridos</h2>

            <div className="flex flex-nowrap items-center gap-1.5 overflow-x-auto pb-1">
              <select
                value={filtroFecha}
                onChange={(e) => setFiltroFecha(e.target.value as FiltroFecha)}
                className="shrink-0 rounded-app border border-border bg-surface-2 px-2 py-1 text-xs text-text-primary outline-none"
              >
                {OPCIONES_FILTRO_FECHA.map((o) => (
                  <option key={o.valor} value={o.valor}>
                    {o.etiqueta}
                  </option>
                ))}
              </select>
              {filtroFecha === "personalizado" && (
                <>
                  <input
                    type="date"
                    value={fechaDesde}
                    onChange={(e) => setFechaDesde(e.target.value)}
                    className="w-[130px] shrink-0 rounded-app border border-border bg-surface-2 px-2 py-1 text-xs text-text-primary outline-none"
                  />
                  <span className="shrink-0 text-xs text-text-secondary">a</span>
                  <input
                    type="date"
                    value={fechaHasta}
                    onChange={(e) => setFechaHasta(e.target.value)}
                    className="w-[130px] shrink-0 rounded-app border border-border bg-surface-2 px-2 py-1 text-xs text-text-primary outline-none"
                  />
                </>
              )}
            </div>

            {recorridosFiltrados.length === 0 && (
              <p className="text-xs text-text-secondary">
                No hay recorridos que coincidan con el filtro.
              </p>
            )}

            {(mostrarTodosRecorridos ? recorridosFiltrados : recorridosFiltrados.slice(0, 2)).map(
              (r) => (
                <div
                  key={r.id}
                  className="grid grid-cols-4 gap-1.5 rounded-app border border-border bg-surface-2 px-2 py-2 text-center"
                >
                  <div>
                    <p className="text-xs text-text-primary">
                      {new Date(r.createdAt).toLocaleDateString("es-CL")}
                    </p>
                    <p className="text-[10px] text-text-muted">fecha</p>
                  </div>
                  <div>
                    <p className="text-xs text-text-primary">{r.distanciaKm.toFixed(2)} km</p>
                    <p className="text-[10px] text-text-muted">distancia</p>
                  </div>
                  <div>
                    <p className="text-xs text-text-primary">{Math.round(r.duracionSeg / 60)} min</p>
                    <p className="text-[10px] text-text-muted">tiempo</p>
                  </div>
                  <div>
                    <p className={r.tipo === "ruta" ? "text-xs text-text-accent" : "text-xs text-text-primary"}>
                      {r.tipo === "ruta" ? "Ruta" : "Libre"}
                    </p>
                    <p className="text-[10px] text-text-muted">tipo</p>
                  </div>
                </div>
              ),
            )}
            {recorridosFiltrados.length > 2 && (
              <button
                type="button"
                onClick={() => setMostrarTodosRecorridos((v) => !v)}
                className="self-start text-xs text-text-accent underline"
              >
                {mostrarTodosRecorridos
                  ? "Ocultar"
                  : `Mostrar todos (${recorridosFiltrados.length})`}
              </button>
            )}

            {filtroFecha !== "todos" && recorridosFiltrados.length > 0 && (
              <div className="flex gap-2">
                <div className="flex-1 rounded-app bg-surface-2 p-2 text-center">
                  <p className="text-sm font-semibold text-text-accent">
                    {recorridosFiltrados.reduce((s, r) => s + r.distanciaKm, 0).toFixed(2)} km
                  </p>
                  <p className="text-[10px] text-text-muted">total distancia</p>
                </div>
                <div className="flex-1 rounded-app bg-surface-2 p-2 text-center">
                  <p className="text-sm font-semibold text-text-accent">
                    {Math.round(
                      recorridosFiltrados.reduce((s, r) => s + r.duracionSeg, 0) / 60,
                    )}{" "}
                    min
                  </p>
                  <p className="text-[10px] text-text-muted">total tiempo</p>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      <button type="button" onClick={logout} className="card px-4 py-3 text-sm text-fill-warning">
        Cerrar sesión
      </button>

      {confirmarTecnica?.paso === 1 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6">
          <div className="card flex w-full max-w-xs flex-col gap-3 p-5">
            <h2 className="text-sm font-semibold text-text-accent">{confirmarTecnica.etiqueta}</h2>
            <p className="text-sm text-text-secondary">¿Estás seguro de que dominas esta técnica?</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={confirmarPrimerPaso}
                className="btn-hero flex-1 rounded-app px-4 py-2 text-sm"
              >
                Confirmar
              </button>
              <button
                type="button"
                onClick={() => setConfirmarTecnica(null)}
                className="rounded-app border border-border px-4 py-2 text-sm text-text-secondary"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmarTecnica?.paso === 2 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6">
          <div className="card flex w-full max-w-xs flex-col gap-3 p-5">
            <h2 className="text-sm font-semibold text-text-accent">{confirmarTecnica.etiqueta}</h2>
            <p className="text-sm text-text-secondary">
              ¿Seguro? Recuerda que esta sección representa las técnicas que realmente dominas.
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={confirmarSegundoPaso}
                className="btn-hero rounded-app px-4 py-2 text-sm"
              >
                Sí, la domino
              </button>
              <button
                type="button"
                onClick={() => setConfirmarTecnica(null)}
                className="rounded-app border border-border px-4 py-2 text-sm text-text-secondary"
              >
                No, me equivoqué
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
