"use client";

import { useEffect, useState } from "react";
import { IconCheck, IconSearch, IconX } from "@tabler/icons-react";
import { apiGet } from "@/lib/api";
import type { MiembroSimple } from "@/lib/chat";
import { Avatar } from "@/components/Avatar";
import { useNoAutofill } from "@/lib/useNoAutofill";

// Agrupa visualmente por Miembro.categoria ("legion" | "comunidad" | sin
// asignar) para encontrar gente más rápido en una lista larga — pero la
// selección es libre entre ambos grupos, no hay restricción de invitar solo
// dentro de un grupo.
export function SelectorInvitadosActividad({
  propioId,
  token,
  seleccionados,
  onCambiar,
  onCerrar,
}: {
  propioId: number | null | undefined;
  token: string | null;
  seleccionados: number[];
  onCambiar: (ids: number[]) => void;
  onCerrar: () => void;
}) {
  const [miembros, setMiembros] = useState<MiembroSimple[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const noAutofill = useNoAutofill();

  useEffect(() => {
    apiGet<MiembroSimple[]>("/chat/miembros", token)
      .then(setMiembros)
      .catch(() => {});
  }, [token]);

  const filtrados = miembros.filter(
    (m) => m.id !== propioId && m.nombre.toLowerCase().includes(busqueda.toLowerCase()),
  );
  const legion = filtrados.filter((m) => m.categoria === "legion");
  const comunidad = filtrados.filter((m) => m.categoria !== "legion");

  function alternar(id: number) {
    if (seleccionados.includes(id)) onCambiar(seleccionados.filter((x) => x !== id));
    else onCambiar([...seleccionados, id]);
  }

  function fila(m: MiembroSimple) {
    const elegido = seleccionados.includes(m.id);
    return (
      <button
        key={m.id}
        type="button"
        onClick={() => alternar(m.id)}
        className="flex w-full items-center gap-3 rounded-app px-3 py-2 text-left text-sm active:bg-surface-2"
      >
        <Avatar fotoUrl={m.fotoUrl ?? null} nombre={m.nombre} tamano={32} />
        <span className="flex-1 text-text-primary">{m.nombre}</span>
        <span
          className={`flex h-5 w-5 items-center justify-center rounded-full border ${
            elegido ? "border-fill-primary bg-fill-primary text-on-primary" : "border-border"
          }`}
        >
          {elegido && <IconCheck size={13} />}
        </span>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-page-bg" data-no-swipe>
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold text-text-primary">Invitar personas</h3>
        <button type="button" onClick={onCerrar} aria-label="Cerrar" className="text-text-secondary">
          <IconX size={20} />
        </button>
      </div>

      <div className="mx-3 mt-3 flex items-center gap-2 rounded-app border border-border bg-surface-2 px-3 py-2">
        <IconSearch size={16} className="text-text-secondary" />
        <input
          autoComplete="off"
          {...noAutofill}
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar integrante..."
          className="w-full bg-transparent text-sm text-text-primary outline-none"
        />
      </div>

      <p className="px-4 pt-2 text-xs text-text-secondary">Seleccionados: {seleccionados.length}</p>

      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {legion.length > 0 && (
          <>
            <p className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-text-accent">
              Legión
            </p>
            {legion.map(fila)}
          </>
        )}
        {comunidad.length > 0 && (
          <>
            <p className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-text-accent">
              Comunidad
            </p>
            {comunidad.map(fila)}
          </>
        )}
        {filtrados.length === 0 && <p className="px-3 py-2 text-sm text-text-secondary">Sin resultados.</p>}
      </div>

      <div className="p-3">
        <button type="button" onClick={onCerrar} className="btn-hero w-full rounded-app px-4 py-2 text-sm">
          Listo
        </button>
      </div>
    </div>
  );
}
