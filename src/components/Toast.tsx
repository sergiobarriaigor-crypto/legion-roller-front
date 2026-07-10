"use client";

import { useEffect } from "react";

// Notificación temporal que se cierra sola, sin botón ni interacción del
// usuario — pensada para confirmaciones rápidas (ej. "Recorrido publicado")
// que antes ocupaban una pantalla completa dentro de un modal.
export function Toast({
  mensaje,
  onDismiss,
  duracionMs = 1000,
}: {
  mensaje: string;
  onDismiss: () => void;
  duracionMs?: number;
}) {
  useEffect(() => {
    const id = setTimeout(onDismiss, duracionMs);
    return () => clearTimeout(id);
  }, [onDismiss, duracionMs]);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[200] flex justify-center px-6">
      <div className="animate-toast-pop rounded-full border border-border-accent/40 bg-surface-1/95 px-5 py-2.5 text-sm font-medium text-text-accent shadow-[0_0_16px_rgba(201,154,61,0.25)] backdrop-blur-sm">
        {mensaje}
      </div>
    </div>
  );
}
