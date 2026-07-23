"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import {
  IconMap2,
  IconUsers,
  IconMessage2,
  IconBuildingStore,
  IconUserCircle,
  IconShieldLock,
} from "@tabler/icons-react";
import { useSession } from "@/context/SessionContext";

// MisRutasPanel usa Leaflet (necesita el navegador) para la ficha de detalle;
// BottomNav se renderiza en el servidor en cada pantalla, así que este import
// no puede ser estático (mismo motivo por el que /mapa carga MapaView con
// ssr: false).
const MisRutasPanel = dynamic(
  () => import("@/components/Mapa/MisRutasPanel").then((m) => m.MisRutasPanel),
  { ssr: false },
);

const HOLD_MS = 1500;
const RADIO_MAPA = 31;
const CIRCUNFERENCIA_MAPA = 2 * Math.PI * RADIO_MAPA;

interface NavItem {
  href: string;
  label: string;
  icon?: ReactNode;
  ocultoParaVisitante?: boolean;
}

const itemsIzquierda: NavItem[] = [
  { href: "/comunidad", label: "Comunidad", icon: <IconUsers size={22} />, ocultoParaVisitante: true },
  { href: "/post", label: "Post", icon: <IconMessage2 size={22} /> },
];

const itemsDerecha: NavItem[] = [
  { href: "/impulsa", label: "Impulsa", icon: <IconBuildingStore size={22} /> },
  { href: "/perfil", label: "Perfil", icon: <IconUserCircle size={22} />, ocultoParaVisitante: true },
];

function NavLink({ item, activo }: { item: NavItem; activo: boolean }) {
  return (
    <Link
      href={item.href}
      className={`flex flex-1 flex-col items-center justify-center gap-1 py-2 text-xs ${
        activo ? "text-text-accent" : "text-text-secondary"
      }`}
    >
      {item.icon}
      <span>{item.label}</span>
    </Link>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { sesion } = useSession();
  const esVisitante = sesion?.rol === "visitante";
  const esAdmin = sesion?.rol === "admin";

  const [mostrarRutas, setMostrarRutas] = useState(false);
  const [progresoMapa, setProgresoMapa] = useState(0);
  const [manteniendoMapa, setManteniendoMapa] = useState(false);
  const intervaloMapaRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdActivadoRef = useRef(false);
  const [logoError, setLogoError] = useState(false);

  // Mismo patrón que el botón SOS: un anillo de progreso mientras se mantiene
  // presionado. Sin esa señal visual, el usuario no tiene forma de saber si
  // el gesto se está registrando y suele soltar antes de tiempo pensando que
  // no está funcionando.
  function iniciarHoldMapa(e: React.PointerEvent<HTMLButtonElement>) {
    // Sin esto, si el dedo se desliza (aunque sea sin querer) hacia el botón
    // vecino ("Impulsa") mientras se mantiene presionado, el navegador puede
    // soltar el click ahí en vez de en este botón — enviando a Impulsa sin
    // importar la pantalla en la que se estaba. Capturar el puntero mantiene
    // todo el gesto (mover y soltar) anclado a este botón hasta que se suelte.
    // Es un extra defensivo, no algo de lo que dependa el hold en sí: en
    // algunos navegadores/dispositivos setPointerCapture puede lanzar una
    // excepción (ej. Safari en ciertas versiones de iOS) — sin este try/catch,
    // esa excepción cortaba toda la función y el hold quedaba muerto sin
    // ningún aviso.
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Se ignora: el hold sigue funcionando igual, solo se pierde la
      // protección contra deslizar hacia el botón vecino.
    }
    holdActivadoRef.current = false;
    setManteniendoMapa(true);
    const inicio = Date.now();
    intervaloMapaRef.current = setInterval(() => {
      const pct = Math.min(100, ((Date.now() - inicio) / HOLD_MS) * 100);
      setProgresoMapa(pct);
      if (pct >= 100) {
        holdActivadoRef.current = true;
        limpiarHoldMapa();
        setMostrarRutas(true);
      }
    }, 30);
  }

  function limpiarHoldMapa() {
    if (intervaloMapaRef.current) clearInterval(intervaloMapaRef.current);
    intervaloMapaRef.current = null;
    setManteniendoMapa(false);
    setProgresoMapa(0);
  }

  function onPointerUpMapa() {
    const seActivoElHold = holdActivadoRef.current;
    limpiarHoldMapa();
    if (!seActivoElHold) {
      router.push("/mapa");
    }
  }

  const activoIzquierda = itemsIzquierda.filter((item) => !(esVisitante && item.ocultoParaVisitante));
  const activoDerecha = itemsDerecha.filter((item) => !(esVisitante && item.ocultoParaVisitante));

  return (
    <>
      <nav className="flex items-stretch border-t border-border bg-surface-1">
        {activoIzquierda.map((item) => (
          <NavLink key={item.href} item={item} activo={pathname.startsWith(item.href)} />
        ))}

        {!esVisitante && (
          <div className="flex flex-1 items-center justify-center py-2">
            <button
              type="button"
              aria-label="Mapa: toca para ir, mantén presionado para ver tus rutas"
              onPointerDown={iniciarHoldMapa}
              onPointerUp={onPointerUpMapa}
              onPointerLeave={limpiarHoldMapa}
              onPointerCancel={limpiarHoldMapa}
              className={`relative -mt-[32px] flex h-[70px] w-[70px] select-none items-center justify-center rounded-full border-4 border-surface-1 bg-fill-primary shadow-lg animate-pulse-mapa ${
                pathname.startsWith("/mapa") ? "ring-2 ring-text-accent" : ""
              }`}
            >
              {logoError ? (
                <IconMap2 size={24} className="text-on-primary" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src="/boton-mapa.png"
                  alt="Mapa"
                  className="h-[85%] w-[85%] rounded-full object-cover"
                  onError={() => setLogoError(true)}
                />
              )}
              {manteniendoMapa && (
                <svg
                  className="pointer-events-none absolute inset-0 -rotate-90 text-text-accent"
                  width={70}
                  height={70}
                >
                  <circle
                    cx={35}
                    cy={35}
                    r={RADIO_MAPA}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={4}
                    strokeDasharray={CIRCUNFERENCIA_MAPA}
                    strokeDashoffset={CIRCUNFERENCIA_MAPA * (1 - progresoMapa / 100)}
                  />
                </svg>
              )}
            </button>
          </div>
        )}

        {activoDerecha.map((item) => (
          <NavLink key={item.href} item={item} activo={pathname.startsWith(item.href)} />
        ))}

        {esAdmin && (
          <Link
            href="/admin"
            className={`flex flex-1 flex-col items-center justify-center gap-1 py-2 text-xs ${
              pathname.startsWith("/admin") ? "text-text-accent" : "text-text-secondary"
            }`}
          >
            <IconShieldLock size={22} />
            <span>Admin</span>
          </Link>
        )}
      </nav>

      {mostrarRutas && (
        <MisRutasPanel token={sesion?.token ?? null} onClose={() => setMostrarRutas(false)} />
      )}
    </>
  );
}
