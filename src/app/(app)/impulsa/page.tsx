"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/context/SessionContext";
import { apiGet, apiPost, apiDelete, ApiError } from "@/lib/api";
import type { Emprendedor } from "@/lib/emprendedores";

type SubTab = "directorio" | "ficha";

const FICHA_VACIA = {
  nombreNegocio: "",
  rubro: "",
  descripcion: "",
  contacto: "",
  ubicacion: "",
  instagram: "",
  facebook: "",
  tiktok: "",
};

export default function ImpulsaPage() {
  const { sesion } = useSession();
  const token = sesion?.token ?? null;
  const puedeInteractuar = sesion?.rol === "usuario" || sesion?.rol === "admin";

  const [subTab, setSubTab] = useState<SubTab>("directorio");
  const [directorio, setDirectorio] = useState<Emprendedor[]>([]);
  const [miFicha, setMiFicha] = useState<Emprendedor | null>(null);
  const [form, setForm] = useState(FICHA_VACIA);
  const [nuevoAnuncio, setNuevoAnuncio] = useState("");
  const [resenaAbierta, setResenaAbierta] = useState<number | null>(null);
  const [textoResena, setTextoResena] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function cargarDirectorio() {
    try {
      const lista = await apiGet<Emprendedor[]>("/emprendedores", null);
      setDirectorio(lista);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cargar el directorio.");
    }
  }

  async function cargarMiFicha() {
    if (!token) return;
    try {
      const ficha = await apiGet<Emprendedor | null>("/emprendedores/mi-ficha", token);
      setMiFicha(ficha);
      if (ficha) {
        setForm({
          nombreNegocio: ficha.nombreNegocio,
          rubro: ficha.rubro,
          descripcion: ficha.descripcion,
          contacto: ficha.contacto,
          ubicacion: ficha.ubicacion ?? "",
          instagram: ficha.instagram ?? "",
          facebook: ficha.facebook ?? "",
          tiktok: ficha.tiktok ?? "",
        });
      }
    } catch {
      // ignorar
    }
  }

  useEffect(() => {
    cargarDirectorio();
    cargarMiFicha();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function guardarFicha(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !form.nombreNegocio || !form.rubro || !form.descripcion || !form.contacto) return;
    setEnviando(true);
    setError("");
    try {
      await apiPost(
        "/emprendedores/mi-ficha",
        {
          ...form,
          ubicacion: form.ubicacion || undefined,
          instagram: form.instagram || undefined,
          facebook: form.facebook || undefined,
          tiktok: form.tiktok || undefined,
        },
        token,
      );
      cargarMiFicha();
      cargarDirectorio();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar tu ficha.");
    } finally {
      setEnviando(false);
    }
  }

  async function eliminarFicha() {
    if (!token) return;
    try {
      await apiDelete("/emprendedores/mi-ficha", token);
      setMiFicha(null);
      setForm(FICHA_VACIA);
      cargarDirectorio();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo eliminar tu ficha.");
    }
  }

  async function agregarAnuncio() {
    if (!token || !miFicha || !nuevoAnuncio.trim()) return;
    try {
      await apiPost(`/emprendedores/${miFicha.id}/anuncios`, { texto: nuevoAnuncio }, token);
      setNuevoAnuncio("");
      cargarMiFicha();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo agregar el anuncio.");
    }
  }

  async function eliminarAnuncio(anuncioId: number) {
    if (!token || !miFicha) return;
    try {
      await apiDelete(`/emprendedores/${miFicha.id}/anuncios/${anuncioId}`, token);
      cargarMiFicha();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo eliminar el anuncio.");
    }
  }

  async function reaccionar(id: number) {
    if (!token) return;
    try {
      await apiPost(`/emprendedores/${id}/reaccion`, {}, token);
      cargarDirectorio();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo reaccionar.");
    }
  }

  async function dejarResena(id: number) {
    if (!token || !textoResena.trim()) return;
    try {
      await apiPost(`/emprendedores/${id}/resenas`, { texto: textoResena }, token);
      setTextoResena("");
      cargarDirectorio();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo dejar la reseña.");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setSubTab("directorio")}
          className={`flex-1 rounded-app px-3 py-2 text-sm ${
            subTab === "directorio" ? "btn-hero" : "card text-text-secondary"
          }`}
        >
          Directorio
        </button>
        {sesion?.rol !== "visitante" && (
          <button
            type="button"
            onClick={() => setSubTab("ficha")}
            className={`flex-1 rounded-app px-3 py-2 text-sm ${
              subTab === "ficha" ? "btn-hero" : "card text-text-secondary"
            }`}
          >
            Mi ficha
          </button>
        )}
      </div>

      {error && <p className="text-xs text-fill-warning">{error}</p>}

      {subTab === "directorio" && (
        <div className="flex flex-col gap-3">
          {directorio.length === 0 && (
            <p className="text-sm text-text-secondary">
              Todavía no hay emprendedores aprobados en el directorio.
            </p>
          )}
          {directorio.map((e) => (
            <div key={e.id} className="card flex flex-col gap-2 p-4">
              <div>
                <p className="text-sm font-semibold text-text-accent">{e.nombreNegocio}</p>
                <p className="text-xs text-text-muted">
                  {e.rubro} · {e.nombreDuenio}
                </p>
              </div>
              <p className="text-sm text-text-secondary">{e.descripcion}</p>
              <p className="text-xs text-text-primary">Contacto: {e.contacto}</p>
              {e.ubicacion && <p className="text-xs text-text-muted">{e.ubicacion}</p>}

              <div className="flex gap-3 text-xs text-text-muted">
                {e.instagram && <span>IG: {e.instagram}</span>}
                {e.facebook && <span>FB: {e.facebook}</span>}
                {e.tiktok && <span>TikTok: {e.tiktok}</span>}
              </div>

              {e.anuncios.length > 0 && (
                <div className="flex flex-col gap-1 rounded-app bg-bg-accent p-2">
                  {e.anuncios.map((a) => (
                    <p key={a.id} className="text-xs text-amber-text">
                      📣 {a.texto}
                    </p>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-4 border-t border-border pt-2 text-xs text-text-secondary">
                {puedeInteractuar ? (
                  <button type="button" onClick={() => reaccionar(e.id)}>
                    ★ Me gusta ({e.reaccionesCount})
                  </button>
                ) : (
                  <span>{e.reaccionesCount} me gusta</span>
                )}
                <button
                  type="button"
                  onClick={() => setResenaAbierta(resenaAbierta === e.id ? null : e.id)}
                >
                  {e.resenas.length} reseñas
                </button>
              </div>

              {resenaAbierta === e.id && (
                <div className="flex flex-col gap-2">
                  {e.resenas.map((r) => (
                    <p key={r.id} className="text-xs text-text-secondary">
                      <span className="font-semibold text-text-primary">{r.autorNombre}:</span>{" "}
                      {r.texto}
                    </p>
                  ))}
                  {puedeInteractuar && (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Escribe una reseña..."
                        value={textoResena}
                        onChange={(ev) => setTextoResena(ev.target.value)}
                        className="flex-1 rounded-app border border-border bg-surface-2 px-3 py-1 text-xs text-text-primary outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => dejarResena(e.id)}
                        className="rounded-app bg-fill-primary px-3 py-1 text-xs text-on-primary"
                      >
                        Enviar
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {subTab === "ficha" && sesion?.rol !== "visitante" && (
        <div className="flex flex-col gap-3">
          {miFicha && (
            <p
              className={`text-xs ${miFicha.aprobado ? "text-fill-success" : "text-fill-warning"}`}
            >
              {miFicha.aprobado
                ? "Tu ficha está aprobada y visible en el directorio."
                : "Tu ficha está pendiente de aprobación de un admin."}
            </p>
          )}

          <form onSubmit={guardarFicha} className="card flex flex-col gap-2 p-4">
            <h2 className="text-sm font-semibold text-text-primary">
              {miFicha ? "Editar mi ficha" : "Crear mi ficha de emprendedor"}
            </h2>
            <input
              type="text"
              placeholder="Nombre del negocio"
              value={form.nombreNegocio}
              onChange={(e) => setForm({ ...form, nombreNegocio: e.target.value })}
              className="rounded-app border border-border bg-surface-2 px-3 py-2 text-text-primary outline-none"
            />
            <input
              type="text"
              placeholder="Rubro"
              value={form.rubro}
              onChange={(e) => setForm({ ...form, rubro: e.target.value })}
              className="rounded-app border border-border bg-surface-2 px-3 py-2 text-text-primary outline-none"
            />
            <textarea
              placeholder="Descripción"
              value={form.descripcion}
              onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
              rows={3}
              className="rounded-app border border-border bg-surface-2 px-3 py-2 text-text-primary outline-none"
            />
            <input
              type="text"
              placeholder="Contacto (teléfono, whatsapp, etc)"
              value={form.contacto}
              onChange={(e) => setForm({ ...form, contacto: e.target.value })}
              className="rounded-app border border-border bg-surface-2 px-3 py-2 text-text-primary outline-none"
            />
            <input
              type="text"
              placeholder="Ubicación (opcional)"
              value={form.ubicacion}
              onChange={(e) => setForm({ ...form, ubicacion: e.target.value })}
              className="rounded-app border border-border bg-surface-2 px-3 py-2 text-text-primary outline-none"
            />
            <input
              type="text"
              placeholder="Instagram (opcional)"
              value={form.instagram}
              onChange={(e) => setForm({ ...form, instagram: e.target.value })}
              className="rounded-app border border-border bg-surface-2 px-3 py-2 text-text-primary outline-none"
            />
            <input
              type="text"
              placeholder="Facebook (opcional)"
              value={form.facebook}
              onChange={(e) => setForm({ ...form, facebook: e.target.value })}
              className="rounded-app border border-border bg-surface-2 px-3 py-2 text-text-primary outline-none"
            />
            <input
              type="text"
              placeholder="TikTok (opcional)"
              value={form.tiktok}
              onChange={(e) => setForm({ ...form, tiktok: e.target.value })}
              className="rounded-app border border-border bg-surface-2 px-3 py-2 text-text-primary outline-none"
            />
            <button
              type="submit"
              disabled={enviando}
              className="btn-hero rounded-app px-4 py-2 text-sm disabled:opacity-60"
            >
              {enviando ? "Guardando..." : miFicha ? "Guardar cambios" : "Enviar solicitud"}
            </button>
            {miFicha && (
              <button
                type="button"
                onClick={eliminarFicha}
                className="text-xs text-fill-warning underline"
              >
                Eliminar mi ficha
              </button>
            )}
          </form>

          {miFicha && (
            <div className="card flex flex-col gap-2 p-4">
              <h2 className="text-sm font-semibold text-text-primary">Mis anuncios</h2>
              {miFicha.anuncios.map((a) => (
                <div key={a.id} className="flex items-center justify-between">
                  <p className="text-xs text-text-secondary">📣 {a.texto}</p>
                  <button
                    type="button"
                    onClick={() => eliminarAnuncio(a.id)}
                    className="text-xs text-fill-warning underline"
                  >
                    Eliminar
                  </button>
                </div>
              ))}
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Nuevo anuncio o promo corta"
                  value={nuevoAnuncio}
                  onChange={(e) => setNuevoAnuncio(e.target.value)}
                  className="flex-1 rounded-app border border-border bg-surface-2 px-3 py-1 text-xs text-text-primary outline-none"
                />
                <button
                  type="button"
                  onClick={agregarAnuncio}
                  className="rounded-app bg-fill-primary px-3 py-1 text-xs text-on-primary"
                >
                  Agregar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
