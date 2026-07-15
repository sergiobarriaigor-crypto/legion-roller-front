"use client";

import { useEffect, useState } from "react";
import { IconCheck, IconSearch, IconX } from "@tabler/icons-react";
import { apiGet } from "@/lib/api";
import { compartirPostAUsuarios, type Post } from "@/lib/posts";
import type { MiembroSimple } from "@/lib/chat";
import { Avatar } from "@/components/Avatar";

const MAX_DESTINATARIOS_COMPARTIR = 5;

// Ventana flotante para compartir un post puertas adentro de la app — hasta
// 5 destinatarios por acción. Mismo endpoint de integrantes que ya usa
// SelectorMencion.tsx (/chat/miembros), acá con selección múltiple y foto.
export function SelectorCompartirPost({
  post,
  propioId,
  token,
  onCerrar,
}: {
  post: Post;
  propioId: number | null | undefined;
  token: string | null;
  onCerrar: () => void;
}) {
  const [miembros, setMiembros] = useState<MiembroSimple[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [seleccionados, setSeleccionados] = useState<number[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    apiGet<MiembroSimple[]>("/chat/miembros", token)
      .then(setMiembros)
      .catch(() => {});
  }, [token]);

  const filtrados = miembros.filter(
    (m) => m.id !== propioId && m.nombre.toLowerCase().includes(busqueda.toLowerCase()),
  );

  function alternar(id: number) {
    setSeleccionados((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_DESTINATARIOS_COMPARTIR) return prev;
      return [...prev, id];
    });
  }

  // Sin pantalla de confirmación intermedia: al compartir con éxito, se
  // cierra directo (experiencia fluida, sin interrupciones).
  async function enviar() {
    if (!token || seleccionados.length === 0) return;
    setEnviando(true);
    setError("");
    try {
      await compartirPostAUsuarios(post.id, seleccionados, token);
      onCerrar();
    } catch {
      setError("No se pudo compartir la publicación. Probá de nuevo.");
      setEnviando(false);
    }
  }

  return (
    // Hoja flotante que sube desde abajo (no pantalla completa): el feed de
    // Post sigue visible y atenuado por detrás, para no perder el contexto
    // de qué se está compartiendo — mismo patrón que ya usan
    // PanelSocialHistoria.tsx/PanelEcosHistoria.tsx (velo oscuro + hoja
    // anclada abajo con esquinas redondeadas y una altura máxima).
    <div className="fixed inset-0 z-50" data-no-swipe>
      <div className="absolute inset-0 bg-black/75" onClick={onCerrar} aria-hidden />
      <div className="absolute inset-x-0 bottom-0 flex max-h-[55%] flex-col rounded-t-2xl bg-[#161616] shadow-[0_-8px_30px_rgba(0,0,0,0.5)]">
        <div className="flex justify-center pb-1 pt-2">
          <span className="h-1 w-10 rounded-full bg-white/20" />
        </div>
        <div className="flex items-center justify-between border-b border-white/10 px-3 pb-3">
          <h3 className="text-sm font-semibold text-white">Compartir publicación</h3>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="text-white">
            <IconX size={20} />
          </button>
        </div>

        <p className="px-3 pb-2 pt-2 text-xs text-white/60">
          Elegí hasta {MAX_DESTINATARIOS_COMPARTIR} personas — Seleccionados: {seleccionados.length}/
          {MAX_DESTINATARIOS_COMPARTIR}
        </p>

        <div className="mx-3 mb-2 flex items-center gap-2 rounded-app border border-white/20 px-3 py-2">
          <IconSearch size={16} className="text-white/60" />
          <input
            autoFocus
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar integrante..."
            className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/50"
          />
        </div>

        <div className="flex-1 overflow-y-auto px-3 pb-3">
          {filtrados.map((m) => {
            const elegido = seleccionados.includes(m.id);
            const deshabilitado = !elegido && seleccionados.length >= MAX_DESTINATARIOS_COMPARTIR;
            return (
              <button
                key={m.id}
                type="button"
                disabled={deshabilitado}
                onClick={() => alternar(m.id)}
                className="flex w-full items-center gap-3 rounded-app px-3 py-2 text-left text-sm text-white active:bg-white/10 disabled:opacity-40"
              >
                <Avatar fotoUrl={m.fotoUrl ?? null} nombre={m.nombre} tamano={32} />
                <span className="flex-1">{m.nombre}</span>
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full border ${
                    elegido ? "border-fill-primary bg-fill-primary text-on-primary" : "border-white/30"
                  }`}
                >
                  {elegido && <IconCheck size={13} />}
                </span>
              </button>
            );
          })}
          {filtrados.length === 0 && <p className="px-3 py-2 text-sm text-white/50">Sin resultados.</p>}
        </div>

        {error && <p className="px-3 pb-2 text-xs text-fill-warning">{error}</p>}

        <div className="p-3" data-no-swipe>
          <button
            type="button"
            onClick={enviar}
            disabled={seleccionados.length === 0 || enviando}
            className="btn-hero w-full rounded-app px-4 py-2 text-sm disabled:opacity-60"
          >
            {enviando ? "Enviando..." : "Enviar"}
          </button>
        </div>
      </div>
    </div>
  );
}
