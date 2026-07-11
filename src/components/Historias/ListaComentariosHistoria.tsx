"use client";

import { useEffect, useState } from "react";
import { IconX } from "@tabler/icons-react";
import { listarComentariosHistoria, type ComentarioHistoriaDetalle } from "@/lib/historias";
import { Avatar } from "@/components/Avatar";

// Solo el autor de la historia puede abrir esto (el backend responde 403 si
// no lo es) — los mensajes flotantes se retransmiten en vivo a quien esté
// viendo la historia, pero además quedan guardados acá para revisarlos después.
export function ListaComentariosHistoria({
  historiaId,
  token,
  onCerrar,
}: {
  historiaId: number;
  token: string | null;
  onCerrar: () => void;
}) {
  const [comentarios, setComentarios] = useState<ComentarioHistoriaDetalle[] | null>(null);

  useEffect(() => {
    listarComentariosHistoria(historiaId, token)
      .then(setComentarios)
      .catch(() => setComentarios([]));
  }, [historiaId, token]);

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-black/90" data-no-swipe>
      <div className="flex items-center justify-between p-3">
        <h3 className="text-sm font-semibold text-white">
          {comentarios?.length ?? 0} {comentarios?.length === 1 ? "comentario" : "comentarios"}
        </h3>
        <button type="button" onClick={onCerrar} aria-label="Cerrar" className="text-white">
          <IconX size={20} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {comentarios === null ? (
          <p className="px-3 py-2 text-sm text-white/50">Cargando...</p>
        ) : comentarios.length === 0 ? (
          <p className="px-3 py-2 text-sm text-white/50">Todavía nadie comentó.</p>
        ) : (
          comentarios.map((c) => (
            <div key={c.id} className="flex items-start gap-3 px-3 py-2">
              <Avatar fotoUrl={c.fotoUrl} nombre={c.nombre} tamano={32} />
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-white">{c.nombre}</span>
                <span className="text-sm text-white/80">{c.texto}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
