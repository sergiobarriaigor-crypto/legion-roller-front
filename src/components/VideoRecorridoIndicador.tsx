"use client";

import { useRouter } from "next/navigation";
import { IconMovie, IconX } from "@tabler/icons-react";
import { useVideoRecorrido } from "@/context/VideoRecorridoContext";

// Vive junto a BottomNav en el layout de (app), fuera de <SwipeNavigator> --
// visible en cualquier pestaña mientras el video de "Compartir recorrido"
// (pestaña "Video", no la 3D) se sigue generando o ya está listo. Mensaje
// flotante (mismo criterio visual que Toast.tsx: píldora redondeada, con
// sombra, encima del contenido) en vez de una franja metida en el layout
// normal -- esa versión anterior daba un área de toque angosta y difícil de
// acertar; acá toda la píldora es un solo botón grande.
export function VideoRecorridoIndicador() {
  const { estado, limpiar } = useVideoRecorrido();
  const router = useRouter();

  if (!estado.generando && !estado.videoBlob) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[200] flex justify-center px-6">
      <div className="animate-toast-pop pointer-events-auto flex items-center gap-3 rounded-full border border-border-accent/40 bg-surface-1/95 py-2.5 pl-2.5 pr-3 shadow-[0_0_16px_rgba(201,154,61,0.25)] backdrop-blur-sm">
        <button
          type="button"
          onClick={() => router.push(`/mapa?compartirVideo=${estado.recorridoId}`)}
          className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 text-sm font-medium text-text-accent"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-fill-primary text-on-primary">
            <IconMovie size={18} />
          </span>
          {estado.generando
            ? `Generando video... ${Math.round(estado.progreso * 100)}%`
            : "Video listo — tocá para compartirlo"}
        </button>
        {!estado.generando && (
          <button
            type="button"
            onClick={limpiar}
            aria-label="Descartar"
            className="shrink-0 text-text-secondary"
          >
            <IconX size={18} />
          </button>
        )}
      </div>
    </div>
  );
}
