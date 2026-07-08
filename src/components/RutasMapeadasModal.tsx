"use client";

import { useEffect, useState } from "react";
import { IconX } from "@tabler/icons-react";
import { apiGet } from "@/lib/api";

interface RecorridoResumen {
  id: number;
  tipo: string;
  distanciaKm: number;
  duracionSeg: number;
  createdAt: string;
}

export function RutasMapeadasModal({
  token,
  onClose,
}: {
  token: string | null;
  onClose: () => void;
}) {
  const [recorridos, setRecorridos] = useState<RecorridoResumen[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (!token) return;
    apiGet<RecorridoResumen[]>("/mapa/recorridos", token)
      .then(setRecorridos)
      .finally(() => setCargando(false));
  }, [token]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center"
      onClick={onClose}
    >
      <div
        className="card flex max-h-[70vh] w-full max-w-md flex-col gap-3 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-accent">Rutas mapeadas</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="text-text-secondary">
            <IconX size={18} />
          </button>
        </div>

        {cargando && <p className="text-xs text-text-secondary">Cargando...</p>}

        {!cargando && recorridos.length === 0 && (
          <p className="text-xs text-text-secondary">
            Todavía no tienes recorridos guardados. Ve al Mapa y usa &quot;Grabar recorrido&quot;.
          </p>
        )}

        <ul className="flex flex-col gap-2 overflow-y-auto">
          {recorridos.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between rounded-app border border-border px-3 py-2 text-xs text-text-secondary"
            >
              <span>{new Date(r.createdAt).toLocaleDateString("es-CL")}</span>
              <span>{r.distanciaKm.toFixed(2)} km</span>
              <span>{Math.round(r.duracionSeg / 60)} min</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
