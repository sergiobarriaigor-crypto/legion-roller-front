"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { IconX, IconTrash, IconPlus } from "@tabler/icons-react";
import { apiUpload, ApiError } from "@/lib/api";
import {
  listarGaleria,
  subirFotoGaleria,
  eliminarFotoGaleria,
  reaccionarFotoGaleria,
  type FotoGaleria,
} from "@/lib/perfil";
import { useSession } from "@/context/SessionContext";

const MAX_FOTOS_GALERIA = 6;

// Filtros de foto (estilo Instagram), solo ofrecidos cuando se sube una única
// foto — si se eligen varias a la vez, se suben tal cual (ver onFotosElegidas).
// "css" se usa tanto para la vista previa (estilo CSS) como para "hornear" el
// filtro en el archivo final vía canvas.filter antes de subir.
const FILTROS_FOTO = [
  { id: "normal", etiqueta: "Normal", css: "none" },
  { id: "bn", etiqueta: "Blanco y negro", css: "grayscale(1)" },
  { id: "sepia", etiqueta: "Sepia", css: "sepia(0.8)" },
  { id: "vivido", etiqueta: "Vívido", css: "saturate(1.6) contrast(1.1)" },
  { id: "contraste", etiqueta: "Contraste", css: "contrast(1.3)" },
] as const;

// Sección "Galería" del perfil: hasta 6 fotos, mostradas en una cuadrícula de
// 3 columnas estilo Instagram (miniaturas cuadradas, recorte "cover", separación
// mínima). Un toque abre el visor a pantalla completa, donde vive el "me gusta"
// y la opción de eliminar (igual que en el feed de Instagram, no en la grilla).
export function GaleriaPerfil({
  miembroId,
  esPropio,
  token,
}: {
  miembroId: number;
  esPropio: boolean;
  token: string | null;
}) {
  const { sesion } = useSession();
  const puedeInteractuar = sesion?.rol === "usuario" || sesion?.rol === "admin";
  const inputRef = useRef<HTMLInputElement>(null);

  const [fotos, setFotos] = useState<FotoGaleria[]>([]);
  const [cargando, setCargando] = useState(true);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState("");
  const [fotoAEliminar, setFotoAEliminar] = useState<FotoGaleria | null>(null);
  const [eliminando, setEliminando] = useState(false);
  const [pantallaCompleta, setPantallaCompleta] = useState<number | null>(null);

  // Editor de filtro: solo se ofrece cuando se elige UNA sola foto a la vez
  // (ver onFotosElegidas). previewUrl es el object URL sin procesar, usado
  // para la vista previa con CSS filter; el filtro recién se "hornea" en el
  // archivo al confirmar (canvas.filter + toBlob), igual patrón que ImageUploadCrop.tsx.
  const [archivoParaFiltro, setArchivoParaFiltro] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [filtroElegido, setFiltroElegido] = useState<(typeof FILTROS_FOTO)[number]>(FILTROS_FOTO[0]);

  async function cargar() {
    try {
      const lista = await listarGaleria(miembroId, token);
      setFotos(lista);
    } catch {
      // silencioso: la galería simplemente aparece vacía si falla
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [miembroId, token]);

  async function onFotosElegidas(e: React.ChangeEvent<HTMLInputElement>) {
    const elegidos = Array.from(e.target.files ?? []);
    if (elegidos.length === 0 || !token) return;
    setError("");

    // Una sola foto: se ofrece elegir un filtro antes de subirla (ver
    // confirmarFiltro). Varias a la vez: se suben directo, sin filtro, para
    // no forzar un editor paso-a-paso por cada una.
    if (elegidos.length === 1) {
      const archivo = elegidos[0];
      setFiltroElegido(FILTROS_FOTO[0]);
      setPreviewUrl(URL.createObjectURL(archivo));
      setArchivoParaFiltro(archivo);
      return;
    }

    const espacioDisponible = MAX_FOTOS_GALERIA - fotos.length;
    const archivos = elegidos.slice(0, espacioDisponible);
    if (elegidos.length > espacioDisponible) {
      setError(
        `Tu galería admite un máximo de ${MAX_FOTOS_GALERIA} fotografías; se tomaron las primeras ${espacioDisponible}.`,
      );
    }

    setSubiendo(true);
    try {
      for (const archivo of archivos) {
        const subida = await apiUpload<{ url: string }>("/uploads", archivo, token, archivo.name);
        const foto = await subirFotoGaleria(subida.url, token);
        setFotos((prev) => [foto, ...prev]);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudieron subir las fotos.");
    } finally {
      setSubiendo(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function cancelarFiltro() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setArchivoParaFiltro(null);
    setPreviewUrl(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function confirmarFiltro() {
    if (!archivoParaFiltro || !previewUrl || !token) return;
    setSubiendo(true);
    setError("");
    try {
      const img = new Image();
      const cargada = new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("No se pudo procesar la imagen"));
      });
      img.src = previewUrl;
      await cargada;

      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("No se pudo procesar la imagen");
      ctx.filter = filtroElegido.css;
      ctx.drawImage(img, 0, 0);

      const blob: Blob | null = await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.9),
      );
      if (!blob) throw new Error("No se pudo procesar la imagen");

      const subida = await apiUpload<{ url: string }>("/uploads", blob, token, archivoParaFiltro.name);
      const foto = await subirFotoGaleria(subida.url, token);
      setFotos((prev) => [foto, ...prev]);
      cancelarFiltro();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo subir la foto.");
    } finally {
      setSubiendo(false);
    }
  }

  async function reaccionar(fotoId: number) {
    if (!token) return;
    try {
      const res = await reaccionarFotoGaleria(fotoId, token);
      setFotos((prev) =>
        prev.map((f) =>
          f.id === fotoId
            ? { ...f, reaccionesCount: res.reaccionesCount, miReaccion: res.miReaccion }
            : f,
        ),
      );
    } catch {
      // silencioso
    }
  }

  async function confirmarEliminar() {
    if (!token || !fotoAEliminar) return;
    setEliminando(true);
    try {
      await eliminarFotoGaleria(fotoAEliminar.id, token);
      setFotos((prev) => prev.filter((f) => f.id !== fotoAEliminar.id));
      setFotoAEliminar(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo eliminar la foto.");
    } finally {
      setEliminando(false);
    }
  }

  if (cargando) return null;

  const puedeAgregar = esPropio && fotos.length < MAX_FOTOS_GALERIA;

  return (
    <div className="flex flex-col gap-2">
      {esPropio && (
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={onFotosElegidas}
          className="hidden"
        />
      )}

      {error && <p className="text-xs text-fill-warning">{error}</p>}
      {fotos.length === 0 && !esPropio && (
        <p className="text-xs text-text-secondary">Todavía no hay fotos en la galería.</p>
      )}

      {/* Sin el tile "+" no hay dónde anclar la insignia de contador, así que
          se muestra como texto en esos casos (galería llena o perfil ajeno). */}
      {!puedeAgregar && fotos.length > 0 && (
        <div className="flex items-center justify-between px-1">
          <h2 className="text-sm font-semibold text-text-primary">Galería</h2>
          <span className="text-xs text-text-muted">{fotos.length}/{MAX_FOTOS_GALERIA}</span>
        </div>
      )}

      {(fotos.length > 0 || puedeAgregar) && (
        <div className="grid grid-cols-3 gap-0.5">
          {puedeAgregar && (
            <button
              type="button"
              disabled={subiendo}
              onClick={() => inputRef.current?.click()}
              aria-label="Agregar foto"
              className="relative flex aspect-square items-center justify-center border border-dashed border-border bg-surface-2 text-text-secondary disabled:opacity-60"
            >
              <IconPlus size={28} />
              <span className="absolute right-1 top-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] text-text-accent">
                {fotos.length}/{MAX_FOTOS_GALERIA}
              </span>
            </button>
          )}
          {fotos.map((foto, i) => (
            <div key={foto.id} className="relative aspect-square overflow-hidden bg-surface-2">
              <button type="button" onClick={() => setPantallaCompleta(i)} className="h-full w-full">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={foto.url}
                  alt="Foto de galería"
                  className="h-full w-full object-cover"
                />
              </button>
              {esPropio && (
                <button
                  type="button"
                  aria-label="Eliminar foto"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFotoAEliminar(foto);
                  }}
                  className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white"
                >
                  <IconTrash size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {pantallaCompleta !== null && (
        <VisorGaleriaCompleta
          fotos={fotos}
          indiceInicial={pantallaCompleta}
          esPropio={esPropio}
          puedeInteractuar={puedeInteractuar}
          onReaccionar={reaccionar}
          onEliminar={setFotoAEliminar}
          onCerrar={() => setPantallaCompleta(null)}
        />
      )}

      {archivoParaFiltro && previewUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6" data-no-swipe>
          <div className="card flex w-full max-w-xs flex-col gap-3 p-4">
            <h2 className="text-sm font-semibold text-text-primary">Elige un filtro</h2>
            <div className="overflow-hidden rounded-app bg-surface-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt="Vista previa"
                style={{ filter: filtroElegido.css }}
                className="max-h-64 w-full object-contain"
              />
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {FILTROS_FOTO.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFiltroElegido(f)}
                  className={`shrink-0 rounded-app border px-3 py-1.5 text-xs ${
                    filtroElegido.id === f.id
                      ? "border-fill-accent text-text-accent"
                      : "border-border text-text-secondary"
                  }`}
                >
                  {f.etiqueta}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={subiendo}
                onClick={confirmarFiltro}
                className="btn-hero flex-1 rounded-app px-4 py-2 text-sm disabled:opacity-60"
              >
                {subiendo ? "Subiendo..." : "Usar esta foto"}
              </button>
              <button
                type="button"
                disabled={subiendo}
                onClick={cancelarFiltro}
                className="rounded-app border border-border px-4 py-2 text-sm text-text-secondary"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {fotoAEliminar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6">
          <div className="card flex w-full max-w-xs flex-col gap-3 p-5">
            <h2 className="text-sm font-semibold text-text-accent">Eliminar foto</h2>
            <p className="text-xs text-text-secondary">
              ¿Seguro que quieres eliminar esta foto de tu galería? Esta acción no se puede deshacer.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={eliminando}
                onClick={confirmarEliminar}
                className="rounded-app bg-red-700 px-4 py-2 text-sm text-white disabled:opacity-50"
              >
                {eliminando ? "Eliminando..." : "Sí, eliminar"}
              </button>
              <button
                type="button"
                onClick={() => setFotoAEliminar(null)}
                className="rounded-app border border-border px-4 py-2 text-sm text-text-secondary"
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

function VisorGaleriaCompleta({
  fotos,
  indiceInicial,
  esPropio,
  puedeInteractuar,
  onReaccionar,
  onEliminar,
  onCerrar,
}: {
  fotos: FotoGaleria[];
  indiceInicial: number;
  esPropio: boolean;
  puedeInteractuar: boolean;
  onReaccionar: (fotoId: number) => void;
  onEliminar: (foto: FotoGaleria) => void;
  onCerrar: () => void;
}) {
  const contenedorRef = useRef<HTMLDivElement>(null);
  const [indiceActual, setIndiceActual] = useState(indiceInicial);

  useLayoutEffect(() => {
    const el = contenedorRef.current;
    if (!el) return;
    el.scrollLeft = indiceInicial * el.clientWidth;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const foto = fotos[indiceActual];

  return (
    <div className="animate-galeria-foto-abrir fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <span className="text-xs text-white/70">
          {foto && new Date(foto.createdAt).toLocaleDateString("es-CL")}
        </span>
        <button type="button" onClick={onCerrar} aria-label="Cerrar">
          <IconX size={28} />
        </button>
      </div>
      <div
        ref={contenedorRef}
        data-no-swipe
        onScroll={(e) => {
          const el = e.currentTarget;
          setIndiceActual(Math.round(el.scrollLeft / el.clientWidth));
        }}
        className="flex flex-1 snap-x snap-mandatory overflow-x-auto"
      >
        {fotos.map((f, i) => (
          <div
            key={f.id}
            className="flex h-full w-full shrink-0 snap-center items-center justify-center"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={f.url}
              alt={`Foto de galería (${i + 1}/${fotos.length})`}
              className="max-h-full max-w-full object-contain"
            />
          </div>
        ))}
      </div>
      {foto && (
        <div className="flex items-center justify-between px-4 py-3 text-sm text-white">
          {puedeInteractuar ? (
            <button
              type="button"
              onClick={() => onReaccionar(foto.id)}
              className={foto.miReaccion ? "text-text-accent" : "text-white"}
            >
              {foto.miReaccion ? "★ Me gusta" : "☆ Me gusta"} ({foto.reaccionesCount})
            </button>
          ) : (
            <span className="text-white/70">{foto.reaccionesCount} me gusta</span>
          )}
          {esPropio && (
            <button
              type="button"
              aria-label="Eliminar foto"
              onClick={() => onEliminar(foto)}
              className="text-white/70"
            >
              <IconTrash size={18} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
