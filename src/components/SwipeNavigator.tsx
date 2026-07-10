"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "@/context/SessionContext";
import { ORDEN_TABS } from "@/lib/tabs";
import { RUTAS_RESTRINGIDAS_VISITANTE } from "@/lib/session";

const UMBRAL_PX = 60;

export function SwipeNavigator({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { sesion } = useSession();

  const inicioRef = useRef<{ x: number; y: number } | null>(null);
  const indiceAnteriorRef = useRef(-1);
  const [direccion, setDireccion] = useState<"izquierda" | "derecha" | null>(null);

  const tabsVisibles = useMemo(
    () =>
      sesion?.rol === "visitante"
        ? ORDEN_TABS.filter((t) => !RUTAS_RESTRINGIDAS_VISITANTE.includes(t))
        : ORDEN_TABS,
    [sesion?.rol],
  );

  const indiceActual = tabsVisibles.indexOf(pathname);

  useEffect(() => {
    if (indiceActual !== -1 && indiceAnteriorRef.current !== -1 && indiceActual !== indiceAnteriorRef.current) {
      setDireccion(indiceActual > indiceAnteriorRef.current ? "izquierda" : "derecha");
    }
    if (indiceActual !== -1) indiceAnteriorRef.current = indiceActual;
  }, [pathname, indiceActual]);

  function onTouchStart(e: React.TouchEvent) {
    // El mapa (Leaflet) y cualquier editor con sus propios gestos de arrastre
    // (recorte de foto, texto sobre la imagen de Historias, etc.) ya manejan
    // su propio arrastre horizontal; si el toque empieza ahí, no lo tomamos
    // como candidato a swipe de pestaña (si no, arrastrar hacia el costado
    // dentro del editor cambiaba de pantalla por error). Cualquier componente
    // puede marcarse con `data-no-swipe` para optar por este mismo comportamiento.
    if ((e.target as HTMLElement).closest(".leaflet-container, [data-no-swipe]")) {
      inicioRef.current = null;
      return;
    }
    const t = e.touches[0];
    inicioRef.current = { x: t.clientX, y: t.clientY };
  }

  function onTouchEnd(e: React.TouchEvent) {
    const inicio = inicioRef.current;
    inicioRef.current = null;
    if (!inicio || indiceActual === -1) return;

    const t = e.changedTouches[0];
    const dx = t.clientX - inicio.x;
    const dy = t.clientY - inicio.y;

    if (Math.abs(dx) < UMBRAL_PX || Math.abs(dx) < Math.abs(dy)) return;

    if (dx < 0 && indiceActual < tabsVisibles.length - 1) {
      router.push(tabsVisibles[indiceActual + 1]);
    } else if (dx > 0 && indiceActual > 0) {
      router.push(tabsVisibles[indiceActual - 1]);
    }
  }

  const claseAnimacion =
    indiceActual === -1 || !direccion
      ? ""
      : direccion === "izquierda"
        ? "animate-slide-from-right"
        : "animate-slide-from-left";

  return (
    <main
      className="flex-1 overflow-y-auto px-4 py-4"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div key={pathname} className={claseAnimacion}>
        {children}
      </div>
    </main>
  );
}
