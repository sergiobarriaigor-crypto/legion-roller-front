"use client";

import { useEffect, useState } from "react";
import { IconX } from "@tabler/icons-react";
import { listarReaccionesHistoria, type ReaccionHistoriaDetalle } from "@/lib/historias";
import { Avatar } from "@/components/Avatar";

// Solo el autor de la historia puede abrir esto (el backend responde 403 si
// no lo es). Al abrirse, el backend marca las reacciones como leídas —
// apagando el punto de notificación en "Mi historia".
export function ListaReaccionesHistoria({
  historiaId,
  token,
  onCerrar,
}: {
  historiaId: number;
  token: string | null;
  onCerrar: () => void;
}) {
  const [reacciones, setReacciones] = useState<ReaccionHistoriaDetalle[] | null>(null);

  useEffect(() => {
    listarReaccionesHistoria(historiaId, token)
      .then(setReacciones)
      .catch(() => setReacciones([]));
  }, [historiaId, token]);

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-black/90" data-no-swipe>
      <div className="flex items-center justify-between p-3">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/corazon2.png" alt="" className="h-4 w-4" />
          {reacciones?.length ?? 0} {reacciones?.length === 1 ? "reacción" : "reacciones"}
        </h3>
        <button type="button" onClick={onCerrar} aria-label="Cerrar" className="text-white">
          <IconX size={20} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {reacciones === null ? (
          <p className="px-3 py-2 text-sm text-white/50">Cargando...</p>
        ) : reacciones.length === 0 ? (
          <p className="px-3 py-2 text-sm text-white/50">Todavía nadie reaccionó.</p>
        ) : (
          reacciones.map((r) => (
            <div key={r.miembroId} className="flex items-center gap-3 px-3 py-2">
              <Avatar fotoUrl={r.fotoUrl} nombre={r.nombre} tamano={32} />
              <span className="text-sm text-white">{r.nombre}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
