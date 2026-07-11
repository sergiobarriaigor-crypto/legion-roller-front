"use client";

import { useEffect, useState } from "react";
import { IconSearch, IconX } from "@tabler/icons-react";
import { apiGet } from "@/lib/api";

interface MiembroSimple {
  id: number;
  nombre: string;
}

// Lista de integrantes para mencionar, con búsqueda por nombre — reusa el
// mismo endpoint que ya usa Chat para elegir con quién iniciar una conversación.
export function SelectorMencion({
  token,
  excluirIds = [],
  onSeleccionar,
  onCerrar,
}: {
  token: string | null;
  excluirIds?: number[];
  onSeleccionar: (miembro: MiembroSimple) => void;
  onCerrar: () => void;
}) {
  const [miembros, setMiembros] = useState<MiembroSimple[]>([]);
  const [busqueda, setBusqueda] = useState("");

  useEffect(() => {
    apiGet<MiembroSimple[]>("/chat/miembros", token)
      .then(setMiembros)
      .catch(() => {});
  }, [token]);

  const filtrados = miembros.filter(
    (m) => !excluirIds.includes(m.id) && m.nombre.toLowerCase().includes(busqueda.toLowerCase()),
  );

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-black/90" data-no-swipe>
      <div className="flex items-center justify-between p-3">
        <h3 className="text-sm font-semibold text-white">Mencionar a...</h3>
        <button type="button" onClick={onCerrar} aria-label="Cerrar" className="text-white">
          <IconX size={20} />
        </button>
      </div>

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
        {filtrados.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => onSeleccionar(m)}
            className="block w-full rounded-app px-3 py-2 text-left text-sm text-white active:bg-white/10"
          >
            {m.nombre}
          </button>
        ))}
        {filtrados.length === 0 && (
          <p className="px-3 py-2 text-sm text-white/50">Sin resultados.</p>
        )}
      </div>
    </div>
  );
}
