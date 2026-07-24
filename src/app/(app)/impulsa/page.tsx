"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  IconShare,
  IconUsers,
  IconMessageCircle2,
  IconBrandInstagram,
  IconBrandFacebook,
  IconBrandTiktok,
  IconHeart,
  IconHeartFilled,
} from "@tabler/icons-react";
import { useSession } from "@/context/SessionContext";
import { apiGet, apiPost, apiDelete, apiUpload, ApiError } from "@/lib/api";
import type { Emprendedor } from "@/lib/emprendedores";
import { listarMisReaccionesEmprendedores } from "@/lib/emprendedores";
import { salaIndividual } from "@/lib/chat";
import { ComentariosEmprendedor } from "@/components/Impulsa/ComentariosEmprendedor";
import { CarruselFotosEmprendedor } from "@/components/Impulsa/CarruselFotosEmprendedor";
import { SelectorCompartirEmprendedor } from "@/components/Impulsa/SelectorCompartirEmprendedor";
import { generarTarjetaCompartirEmprendedor } from "@/lib/tarjetaEmprendedor";
import { BarraFormatoTexto } from "@/components/BarraFormatoTexto";
import { renderizarTextoFormateado } from "@/lib/textoFormateado";

type SubTab = "directorio" | "ficha";

const MAX_FOTOS_EMPRENDEDOR = 4;

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

async function compartirArchivo(archivo: File, titulo: string, resena: string) {
  if (
    typeof navigator.share === "function" &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [archivo] })
  ) {
    await navigator.share({ files: [archivo], title: titulo, text: resena });
    return;
  }
  const enlace = document.createElement("a");
  enlace.href = URL.createObjectURL(archivo);
  enlace.download = archivo.name;
  enlace.click();
  URL.revokeObjectURL(enlace.href);
}

// Comparte la ficha como un archivo real (no un link) con el selector nativo
// del sistema — mismo patrón que compartirPost() en post/page.tsx: en vez de
// compartir la foto pelada se arma una vista previa (imagen + nombre del
// negocio + descripción + logo) con generarTarjetaCompartirEmprendedor.
async function compartirEmprendedor(e: Emprendedor) {
  try {
    if (e.fotos.length === 0) {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: e.nombreNegocio, text: e.descripcion });
      }
      return;
    }

    const blobTarjeta = await generarTarjetaCompartirEmprendedor({
      imagenUrl: e.fotos[0],
      nombreNegocio: e.nombreNegocio,
      descripcion: e.descripcion,
    });
    const archivo = new File([blobTarjeta], "emprendedor-legion-roller.jpg", { type: blobTarjeta.type });
    await compartirArchivo(archivo, e.nombreNegocio, e.descripcion);
  } catch {
    // el usuario canceló el panel de compartir, la vista previa no se pudo
    // generar, o el navegador rechazó el share
  }
}

export default function ImpulsaPage() {
  const { sesion } = useSession();
  const token = sesion?.token ?? null;
  const puedeInteractuar = sesion?.rol === "usuario" || sesion?.rol === "admin";
  const router = useRouter();
  const searchParams = useSearchParams();
  const ultimoDeepLinkRef = useRef<string | null>(null);

  const [subTab, setSubTab] = useState<SubTab>("directorio");
  const [directorio, setDirectorio] = useState<Emprendedor[]>([]);
  const [misReacciones, setMisReacciones] = useState<number[]>([]);
  const [miFicha, setMiFicha] = useState<Emprendedor | null>(null);
  const [form, setForm] = useState(FICHA_VACIA);
  const [fotos, setFotos] = useState<string[]>([]);
  const [subiendoFotos, setSubiendoFotos] = useState(false);
  const fotoInputRef = useRef<HTMLInputElement>(null);
  const descripcionRef = useRef<HTMLTextAreaElement>(null);
  const [nuevoAnuncio, setNuevoAnuncio] = useState("");
  const [panelResenas, setPanelResenas] = useState<{
    emprendedorId: number;
    resenaDestacadaId?: number;
  } | null>(null);
  const [emprendedorACompartir, setEmprendedorACompartir] = useState<Emprendedor | null>(null);
  const [emprendedorAEliminar, setEmprendedorAEliminar] = useState<Emprendedor | null>(null);
  const [eliminandoFicha, setEliminandoFicha] = useState(false);
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function cargarDirectorio() {
    try {
      const lista = await apiGet<Emprendedor[]>("/emprendedores", null);
      setDirectorio(lista);
      if (token) {
        const mias = await listarMisReaccionesEmprendedores(token);
        setMisReacciones(mias);
      }
      return lista;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cargar el directorio.");
      return null;
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
          contacto: ficha.contacto ?? "",
          ubicacion: ficha.ubicacion ?? "",
          instagram: ficha.instagram ?? "",
          facebook: ficha.facebook ?? "",
          tiktok: ficha.tiktok ?? "",
        });
        setFotos(ficha.fotos ?? []);
      }
    } catch {
      // ignorar
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargarDirectorio();
    cargarMiFicha();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // La caja de Descripción crece con el contenido en vez de esconderlo
  // detrás de un scroll poco visible — corre al escribir, al cargar una
  // ficha existente para editar, y también al volver a la sub-pestaña
  // "Mi ficha" (el textarea recién se monta ahí, así que sin `subTab` en
  // las dependencias el resize no se aplicaba al volver de Directorio).
  useEffect(() => {
    const el = descripcionRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [form.descripcion, subTab]);

  // Deep-link desde la notificación de "te comentaron/respondieron una
  // reseña" (ver AppHeader.tsx): cambia al Directorio y abre directo el hilo
  // de reseñas de esa ficha (mismo patrón que post/page.tsx).
  async function cargarYManejarDeepLink() {
    const emprendedorIdParam = searchParams.get("emprendedor");
    if (!emprendedorIdParam) return;
    const resenaIdParam = searchParams.get("resena");
    const clave = `${emprendedorIdParam}:${resenaIdParam ?? ""}`;
    if (ultimoDeepLinkRef.current === clave) return;
    ultimoDeepLinkRef.current = clave;

    setSubTab("directorio");
    const lista = await cargarDirectorio();
    if (!lista) return;

    const emprendedorId = Number(emprendedorIdParam);
    const ficha = lista.find((f) => f.id === emprendedorId);
    if (ficha) {
      setPanelResenas({
        emprendedorId: ficha.id,
        resenaDestacadaId: resenaIdParam ? Number(resenaIdParam) : undefined,
      });
    }
    router.replace("/impulsa", { scroll: false });
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargarYManejarDeepLink();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    if (!panelResenas) return;
    document
      .getElementById(`emprendedor-${panelResenas.emprendedorId}`)
      ?.scrollIntoView({ block: "start", behavior: "smooth" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelResenas?.emprendedorId]);

  async function guardarFicha(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !form.nombreNegocio || !form.rubro || !form.descripcion || !form.instagram) return;
    setEnviando(true);
    setError("");
    try {
      await apiPost(
        "/emprendedores/mi-ficha",
        {
          ...form,
          contacto: form.contacto || undefined,
          ubicacion: form.ubicacion || undefined,
          facebook: form.facebook || undefined,
          tiktok: form.tiktok || undefined,
          fotos: fotos.length > 0 ? fotos : undefined,
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

  // Confirmación previa (mismo patrón que eliminar un post/una ruta) — se usa
  // tanto desde el botón "Eliminar" de la tarjeta en el Directorio (solo
  // visible para el dueño) como desde "Eliminar mi ficha" en la pestaña Mi
  // ficha, reusando el mismo endpoint (siempre opera sobre la ficha del
  // propio usuario autenticado, nunca sobre la de otro).
  async function confirmarEliminarFicha() {
    if (!token) return;
    setEliminandoFicha(true);
    try {
      await apiDelete("/emprendedores/mi-ficha", token);
      setMiFicha(null);
      setForm(FICHA_VACIA);
      setEmprendedorAEliminar(null);
      cargarDirectorio();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo eliminar tu ficha.");
    } finally {
      setEliminandoFicha(false);
    }
  }

  // Mismo criterio que onFotosElegidas en post/page.tsx: selector nativo con
  // `multiple`, sube todo en paralelo sin paso de recorte.
  async function onFotosElegidas(e: React.ChangeEvent<HTMLInputElement>) {
    const elegidos = Array.from(e.target.files ?? []);
    if (elegidos.length === 0 || !token) return;
    setError("");

    const espacioDisponible = MAX_FOTOS_EMPRENDEDOR - fotos.length;
    const archivos = elegidos.slice(0, espacioDisponible);
    if (elegidos.length > espacioDisponible) {
      setError(`Solo se admiten ${MAX_FOTOS_EMPRENDEDOR} fotos por ficha; se tomaron las primeras ${espacioDisponible}.`);
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

  // Al tocar "Contáctame" se manda de una vez un mensaje predeterminado que
  // identifica que la consulta es por la ficha del negocio (no un DM genérico),
  // para que el dueño sepa de inmediato por qué le están escribiendo.
  async function contactarEmprendedor(e: Emprendedor) {
    if (!token || sesion?.id == null) return;
    const sala = salaIndividual(sesion.id, e.miembroId);
    try {
      await apiPost(
        `/chat/mensajes/${sala}`,
        { texto: `Hola! Vi tu ficha de ${e.nombreNegocio} en Impulsa y quería consultarte.` },
        token,
      );
    } catch {
      // si falla el envío del mensaje predeterminado, igual se abre el chat
    } finally {
      router.push(`/chat/${sala}`);
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
          {directorio.map((e) => {
            const esDuenio = sesion?.id === e.miembroId;
            const yaReaccione = misReacciones.includes(e.id);
            return (
              <div
                key={e.id}
                id={`emprendedor-${e.id}`}
                // Mismo criterio que el feed de Post: -mx-4 cancela el px-4
                // compartido de SwipeNavigator y px-3 propio deja ~12px de
                // margen real hasta el borde de la pantalla, en vez de los
                // ~32px que dejaba el p-4 sumado al del padre.
                className="card -mx-4 flex flex-col gap-2 px-3 py-4"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-semibold text-text-accent">{e.nombreNegocio}</p>
                    <p className="text-xs text-text-muted">
                      {e.rubro} · {e.nombreDuenio}
                    </p>
                  </div>
                  {esDuenio && (
                    <button
                      type="button"
                      onClick={() => setEmprendedorAEliminar(e)}
                      className="text-xs text-fill-warning underline"
                    >
                      Eliminar
                    </button>
                  )}
                </div>
                <CarruselFotosEmprendedor fotos={e.fotos} alt={e.nombreNegocio} />
                <p className="whitespace-pre-wrap text-sm text-text-secondary">
                  {renderizarTextoFormateado(e.descripcion)}
                </p>
                {e.contacto && <p className="text-xs text-text-primary">Contacto: {e.contacto}</p>}
                {e.ubicacion && <p className="text-xs text-text-muted">{e.ubicacion}</p>}

                <div className="flex flex-wrap gap-2">
                  {e.instagram && (
                    <a
                      href={e.instagram}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 rounded-full border border-border-accent/40 px-3 py-1 text-xs text-text-accent"
                    >
                      <IconBrandInstagram size={14} />
                      Instagram
                    </a>
                  )}
                  {e.facebook && (
                    <a
                      href={e.facebook}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 rounded-full border border-border-accent/40 px-3 py-1 text-xs text-text-accent"
                    >
                      <IconBrandFacebook size={14} />
                      Facebook
                    </a>
                  )}
                  {e.tiktok && (
                    <a
                      href={e.tiktok}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 rounded-full border border-border-accent/40 px-3 py-1 text-xs text-text-accent"
                    >
                      <IconBrandTiktok size={14} />
                      TikTok
                    </a>
                  )}
                </div>

                {e.anuncios.length > 0 && (
                  <div className="flex flex-col gap-2">
                    {e.anuncios.map((a) => (
                      <p
                        key={a.id}
                        className="rounded-app border-l-2 border-border-accent bg-bg-accent px-3 py-2.5 text-base font-semibold text-amber-text"
                      >
                        📣 {a.texto}
                      </p>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-4 border-t border-border pt-2 text-sm text-text-secondary">
                  {puedeInteractuar ? (
                    <button type="button" onClick={() => reaccionar(e.id)} className="flex items-center gap-1.5">
                      {yaReaccione ? (
                        <IconHeartFilled size={18} className="text-text-accent transition" />
                      ) : (
                        <IconHeart size={18} className="text-text-accent transition" />
                      )}
                      {e.reaccionesCount}
                    </button>
                  ) : (
                    <span className="flex items-center gap-1.5">
                      <IconHeart size={18} className="text-text-accent" />
                      {e.reaccionesCount}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      setPanelResenas((prev) => (prev?.emprendedorId === e.id ? null : { emprendedorId: e.id }))
                    }
                  >
                    {e.resenasCount} reseñas
                  </button>
                  {puedeInteractuar && !esDuenio && sesion?.id != null && (
                    <button
                      type="button"
                      onClick={() => contactarEmprendedor(e)}
                      className="flex items-center gap-1 text-text-accent"
                    >
                      <IconMessageCircle2 size={14} />
                      Contáctame
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => compartirEmprendedor(e)}
                    className="ml-auto flex items-center gap-1"
                  >
                    <IconShare size={16} />
                    Compartir
                  </button>
                  {puedeInteractuar && (
                    <button
                      type="button"
                      onClick={() => setEmprendedorACompartir(e)}
                      aria-label="Compartir a un usuario"
                      className="flex items-center gap-1"
                    >
                      <IconUsers size={16} />
                    </button>
                  )}
                </div>

                {panelResenas?.emprendedorId === e.id && (
                  <ComentariosEmprendedor
                    emprendedorId={e.id}
                    fichaDuenioId={e.miembroId}
                    resenaDestacadaId={panelResenas.resenaDestacadaId}
                    token={token}
                    onCerrar={() => {
                      setPanelResenas(null);
                      cargarDirectorio();
                    }}
                  />
                )}
              </div>
            );
          })}
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

          <form onSubmit={guardarFicha} className="card -mx-4 flex flex-col gap-2 px-3 py-4">
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
            <BarraFormatoTexto
              textareaRef={descripcionRef}
              valor={form.descripcion}
              onCambiar={(nuevo) => setForm({ ...form, descripcion: nuevo })}
            />
            <textarea
              ref={descripcionRef}
              placeholder="Descripción"
              value={form.descripcion}
              onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
              rows={3}
              className="resize-none overflow-hidden rounded-app border border-border bg-surface-2 px-3 py-2 text-text-primary outline-none"
            />
            <input
              type="text"
              placeholder="Contacto (teléfono, whatsapp, etc) (opcional)"
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
              placeholder="Instagram"
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
            {fotos.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {fotos.map((url, i) => (
                  <div key={url} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="Foto del negocio" className="h-16 w-16 rounded-app object-cover" />
                    <button
                      type="button"
                      onClick={() => setFotos(fotos.filter((_, idx) => idx !== i))}
                      className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-page-bg text-xs text-fill-warning"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
            {fotos.length < MAX_FOTOS_EMPRENDEDOR && (
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
                      ? `Agregar fotos (hasta ${MAX_FOTOS_EMPRENDEDOR}, opcional)`
                      : "Agregar más fotos"}
                </button>
              </>
            )}

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
                onClick={() => setEmprendedorAEliminar(miFicha)}
                className="text-xs text-fill-warning underline"
              >
                Eliminar mi ficha
              </button>
            )}
          </form>

          {miFicha && (
            <div className="card -mx-4 flex flex-col gap-2 px-3 py-4">
              <h2 className="text-sm font-semibold text-text-primary">Mis anuncios</h2>
              {miFicha.anuncios.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between gap-2 rounded-app border-l-2 border-border-accent bg-bg-accent px-3 py-2"
                >
                  <p className="text-sm font-medium text-amber-text">📣 {a.texto}</p>
                  <button
                    type="button"
                    onClick={() => eliminarAnuncio(a.id)}
                    className="shrink-0 text-xs text-fill-warning underline"
                  >
                    Eliminar
                  </button>
                </div>
              ))}
              {miFicha.anuncios.length < 2 ? (
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Nuevo anuncio o promo corta"
                    value={nuevoAnuncio}
                    onChange={(e) => setNuevoAnuncio(e.target.value)}
                    className="flex-1 rounded-app border border-border bg-surface-2 px-3 py-2 text-sm text-text-primary outline-none"
                  />
                  <button
                    type="button"
                    onClick={agregarAnuncio}
                    className="rounded-app bg-fill-primary px-4 py-2 text-sm text-on-primary"
                  >
                    Agregar
                  </button>
                </div>
              ) : (
                <p className="text-xs text-text-muted">Máximo 2 anuncios.</p>
              )}
            </div>
          )}
        </div>
      )}

      {emprendedorACompartir && (
        <SelectorCompartirEmprendedor
          emprendedor={emprendedorACompartir}
          propioId={sesion?.id}
          token={token}
          onCerrar={() => setEmprendedorACompartir(null)}
        />
      )}

      {emprendedorAEliminar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6">
          <div className="card flex w-full max-w-xs flex-col gap-3 p-5">
            <h2 className="text-sm font-semibold text-text-accent">Eliminar ficha</h2>
            <p className="text-xs text-text-secondary">
              ¿Seguro que quieres eliminar tu ficha de emprendedor? Esta acción no se puede deshacer.
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                disabled={eliminandoFicha}
                onClick={confirmarEliminarFicha}
                className="rounded-app bg-red-700 px-4 py-2 text-sm text-white disabled:opacity-50"
              >
                {eliminandoFicha ? "Eliminando..." : "Sí, eliminar"}
              </button>
              <button
                type="button"
                disabled={eliminandoFicha}
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
