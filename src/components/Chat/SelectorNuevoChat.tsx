"use client";

import { useState } from "react";
import { IconArrowLeft, IconSearch } from "@tabler/icons-react";
import { Avatar } from "@/components/Avatar";
import type { MiembroSimple } from "@/lib/chat";

// Pantalla completa (overlay, mismo criterio que VisorFotoMensaje/
// VisorUbicacionMensaje) para elegir con quién iniciar un chat 1 a 1.
// El buscador NO se enfoca solo al abrir — el usuario lo toca cuando
// quiere buscar, así el teclado no salta de inmediato.
export function SelectorNuevoChat({
  miembros,
  onElegir,
  onCerrar,
}: {
  miembros: MiembroSimple[];
  onElegir: (miembro: MiembroSimple) => void;
  onCerrar: () => void;
}) {
  const [busqueda, setBusqueda] = useState("");

  const filtrados = miembros.filter((m) =>
    m.nombre.toLowerCase().includes(busqueda.trim().toLowerCase()),
  );

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-page-bg" data-no-swipe>
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Volver"
          className="shrink-0 text-text-secondary"
        >
          <IconArrowLeft size={22} />
        </button>
        <p className="text-base font-semibold text-text-primary">Nuevo chat</p>
      </div>

      <div className="px-4 pb-3">
        <div className="flex items-center gap-2 rounded-app border border-border bg-surface-2 px-3 py-2">
          <IconSearch size={16} className="shrink-0 text-text-muted" />
          <input
            type="text"
            placeholder="Buscar integrante..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="min-w-0 flex-1 bg-transparent text-sm text-text-primary outline-none"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {filtrados.length === 0 && (
          <p className="px-4 py-3 text-xs text-text-secondary">No se encontró a nadie con ese nombre.</p>
        )}
        {filtrados.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => onElegir(m)}
            className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-white/5"
          >
            <Avatar fotoUrl={m.fotoUrl ?? null} nombre={m.nombre} tamano={44} />
            <p className="text-sm text-text-primary">{m.nombre}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
