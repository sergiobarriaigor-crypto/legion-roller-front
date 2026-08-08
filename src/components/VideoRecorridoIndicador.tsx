"use client";

import { useRouter } from "next/navigation";
import { IconX } from "@tabler/icons-react";
import { useVideoRecorrido } from "@/context/VideoRecorridoContext";

// Vive junto a BottomNav en el layout de (app), fuera de <SwipeNavigator> --
// visible en cualquier pestaña mientras el video de "Compartir recorrido"
// (pestaña "Video", no la 3D) se sigue generando o ya está listo, para que el
// usuario sepa que no lo perdió al cambiar de pantalla. Mismo criterio
// autocontenido que EmergenciaBanner.tsx (sin props, lee su propio estado).
export function VideoRecorridoIndicador() {
  const { estado, limpiar } = useVideoRecorrido();
  const router = useRouter();

  if (!estado.generando && !estado.videoBlob) return null;

  return (
    <div className="flex items-center justify-between gap-2 bg-bg-accent px-4 py-2 text-xs text-amber-text">
      <button
        type="button"
        onClick={() => router.push("/mapa")}
        className="flex-1 text-left"
      >
        {estado.generando
          ? `Generando video... ${Math.round(estado.progreso * 100)}%`
          : "Video listo — tocá para compartirlo"}
      </button>
      {!estado.generando && (
        <button type="button" onClick={limpiar} aria-label="Descartar" className="shrink-0">
          <IconX size={14} />
        </button>
      )}
    </div>
  );
}
