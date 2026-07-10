"use client";

import { useEffect, useRef, useState } from "react";
import { IconX } from "@tabler/icons-react";
import type { GrupoHistorias } from "@/lib/historias";
import { marcarVistaHistoria, parsearEstiloTexto } from "@/lib/historias";
import { Avatar } from "@/components/Avatar";
import { estiloVisualTexto } from "@/components/Historias/TextoSobreImagen";

const DURACION_FOTO_MS = 5000;
const UMBRAL_SWIPE_CIERRE_PX = 80;

// Barra de progreso de un segmento: arranca en 0% y transiciona a 100% vía CSS
// (más simple y preciso que un setTimeout/rAF a mano). El truco de los dos
// requestAnimationFrame es necesario para que el navegador pinte el 0% antes
// de aplicar la transición a 100% — si se hiciera en el mismo tick, no habría
// "antes" desde el cual animar.
function SegmentoProgreso({
  id,
  duracionMs,
  onComplete,
}: {
  id: number;
  duracionMs: number;
  onComplete: () => void;
}) {
  const [completo, setCompleto] = useState(false);

  useEffect(() => {
    setCompleto(false);
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setCompleto(true));
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [id, duracionMs]);

  return (
    <div
      className="h-full bg-white"
      style={{ width: completo ? "100%" : "0%", transition: `width ${duracionMs}ms linear` }}
      onTransitionEnd={() => {
        if (completo) onComplete();
      }}
    />
  );
}

export function VisorHistorias({
  grupos,
  indiceInicial,
  token,
  onClose,
}: {
  grupos: GrupoHistorias[];
  indiceInicial: number;
  token: string | null;
  onClose: () => void;
}) {
  const [indiceGrupo, setIndiceGrupo] = useState(indiceInicial);
  const [indiceHistoria, setIndiceHistoria] = useState(0);
  const [duracionVideoMs, setDuracionVideoMs] = useState<number | null>(null);
  const startYRef = useRef(0);

  const grupo = grupos[indiceGrupo];
  const historia = grupo?.historias[indiceHistoria];

  function avanzar() {
    if (!grupo) return;
    if (indiceHistoria < grupo.historias.length - 1) {
      setIndiceHistoria((i) => i + 1);
    } else if (indiceGrupo < grupos.length - 1) {
      setIndiceGrupo((g) => g + 1);
      setIndiceHistoria(0);
    } else {
      onClose();
    }
  }

  function retroceder() {
    if (indiceHistoria > 0) {
      setIndiceHistoria((i) => i - 1);
    } else if (indiceGrupo > 0) {
      const anterior = grupos[indiceGrupo - 1];
      setIndiceGrupo((g) => g - 1);
      setIndiceHistoria(anterior.historias.length - 1);
    }
  }

  useEffect(() => {
    setDuracionVideoMs(null);
  }, [historia?.id]);

  // Se marca como vista apenas se muestra, no solo al abrir el visor completo.
  useEffect(() => {
    if (!historia || !token) return;
    marcarVistaHistoria(historia.id, token).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historia?.id]);

  if (!grupo || !historia) return null;

  const duracionMs = historia.tipo === "foto" ? DURACION_FOTO_MS : (duracionVideoMs ?? 0);

  return (
    <div
      className="fixed inset-0 z-50 bg-black"
      data-no-swipe
      onPointerDown={(e) => {
        startYRef.current = e.clientY;
      }}
      onPointerUp={(e) => {
        if (e.clientY - startYRef.current > UMBRAL_SWIPE_CIERRE_PX) onClose();
      }}
    >
      {/* Degradado oscuro detrás del encabezado: sin esto, la barra de progreso
          y el nombre quedaban difíciles de leer sobre fotos claras — no basta
          con el z-index, hace falta un fondo propio para que sea legible
          sobre cualquier imagen. */}
      <div className="absolute left-0 right-0 top-0 z-10 bg-gradient-to-b from-black/70 via-black/25 to-transparent px-2 pb-8 pt-2">
        <div className="flex gap-1">
          {grupo.historias.map((h, i) => (
            <div key={h.id} className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/30">
              {i < indiceHistoria ? (
                <div className="h-full w-full bg-white" />
              ) : i === indiceHistoria && duracionMs > 0 ? (
                <SegmentoProgreso id={historia.id} duracionMs={duracionMs} onComplete={avanzar} />
              ) : null}
            </div>
          ))}
        </div>

        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Avatar fotoUrl={grupo.autorFotoUrl} nombre={grupo.autorNombre} tamano={28} />
            <span className="text-sm font-semibold text-white">{grupo.autorNombre}</span>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="text-white">
            <IconX size={24} />
          </button>
        </div>
      </div>

      <div className="relative z-0 flex h-full w-full items-center justify-center">
        {historia.tipo === "video" ? (
          <video
            key={historia.id}
            src={historia.mediaUrl}
            className="h-full w-full object-contain"
            autoPlay
            playsInline
            onLoadedMetadata={(e) => setDuracionVideoMs(e.currentTarget.duration * 1000)}
            onEnded={avanzar}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={historia.mediaUrl} alt="" className="h-full w-full object-contain" />
        )}

        {historia.ubicacion && (
          <div className="absolute left-3 top-14 rounded-full bg-black/50 px-3 py-1 text-xs text-white">
            {historia.ubicacion}
          </div>
        )}
        {(() => {
          const estilo = parsearEstiloTexto(historia.textoEstilo);
          if (estilo) {
            return <div style={estiloVisualTexto(estilo)}>{estilo.contenido}</div>;
          }
          // Compatibilidad: historias creadas antes de este editor de texto
          // solo tienen el campo plano, sin posición/estilo — se muestran
          // centradas abajo, como antes.
          if (historia.texto) {
            return (
              <p className="absolute bottom-10 left-0 right-0 px-6 text-center text-lg font-semibold text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.8)]">
                {historia.texto}
              </p>
            );
          }
          return null;
        })()}
      </div>

      {/* Zonas de tap sobre el media: mitad izquierda retrocede, derecha avanza. */}
      <button
        type="button"
        aria-label="Historia anterior"
        onClick={retroceder}
        className="absolute left-0 top-0 z-[5] h-full w-1/2"
      />
      <button
        type="button"
        aria-label="Historia siguiente"
        onClick={avanzar}
        className="absolute right-0 top-0 z-[5] h-full w-1/2"
      />
    </div>
  );
}
