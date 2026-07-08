"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import {
  IconMap2,
  IconUsers,
  IconMessage2,
  IconUserCircle,
  IconShieldLock,
} from "@tabler/icons-react";
import { useSession } from "@/context/SessionContext";
import { RutasMapeadasModal } from "@/components/RutasMapeadasModal";

const HOLD_MS = 1500;
const RADIO = 26;
const CIRCUNFERENCIA = 2 * Math.PI * RADIO;

interface NavItem {
  href: string;
  label: string;
  icon?: ReactNode;
  ocultoParaVisitante?: boolean;
}

const itemsIzquierda: NavItem[] = [
  { href: "/comunidad", label: "Comunidad", icon: <IconUsers size={22} /> },
  { href: "/post", label: "Post", icon: <IconMessage2 size={22} /> },
];

const itemsDerecha: NavItem[] = [
  { href: "/impulsa", label: "Impulsa" },
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

  const [manteniendo, setManteniendo] = useState(false);
  const [progreso, setProgreso] = useState(0);
  const [mostrarRutas, setMostrarRutas] = useState(false);
  const holdTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progresoIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdActivadoRef = useRef(false);
  const [logoError, setLogoError] = useState(false);

  function iniciarHoldMapa() {
    holdActivadoRef.current = false;
    setManteniendo(true);
    const inicio = Date.now();
    progresoIntervalRef.current = setInterval(() => {
      setProgreso(Math.min(100, ((Date.now() - inicio) / HOLD_MS) * 100));
    }, 30);
    holdTimeoutRef.current = setTimeout(() => {
      holdActivadoRef.current = true;
      limpiarHoldMapa();
      setMostrarRutas(true);
    }, HOLD_MS);
  }

  function limpiarHoldMapa() {
    if (holdTimeoutRef.current) clearTimeout(holdTimeoutRef.current);
    if (progresoIntervalRef.current) clearInterval(progresoIntervalRef.current);
    holdTimeoutRef.current = null;
    progresoIntervalRef.current = null;
    setManteniendo(false);
    setProgreso(0);
  }

  function onPointerUpMapa() {
    const seActivoElHold = holdActivadoRef.current;
    limpiarHoldMapa();
    if (!seActivoElHold) {
      router.push("/mapa");
    }
  }

  const activoDerecha = itemsDerecha.filter((item) => !(esVisitante && item.ocultoParaVisitante));

  return (
    <>
      <nav className="flex items-stretch border-t border-border bg-surface-1">
        {itemsIzquierda.map((item) => (
          <NavLink key={item.href} item={item} activo={pathname.startsWith(item.href)} />
        ))}

        {!esVisitante && (
          <div className="flex flex-1 flex-col items-center justify-center gap-1 py-2 text-xs">
            <button
              type="button"
              aria-label="Mapa: toca para ir, mantén presionado para ver tus rutas"
              onPointerDown={iniciarHoldMapa}
              onPointerUp={onPointerUpMapa}
              onPointerLeave={limpiarHoldMapa}
              onPointerCancel={limpiarHoldMapa}
              className={`relative -mt-6 flex h-14 w-14 select-none items-center justify-center rounded-full border-4 border-surface-1 bg-fill-primary shadow-lg ${
                pathname.startsWith("/mapa") ? "ring-2 ring-text-accent" : ""
              }`}
            >
              {logoError ? (
                <IconMap2 size={24} className="text-on-primary" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src="/logo-legion-roller.png"
                  alt="Mapa"
                  className="h-full w-full rounded-full object-cover"
                  onError={() => setLogoError(true)}
                />
              )}
              {manteniendo && (
                <svg className="pointer-events-none absolute inset-0 -rotate-90" width={56} height={56}>
                  <circle
                    cx={28}
                    cy={28}
                    r={RADIO}
                    fill="none"
                    stroke="var(--text-accent)"
                    strokeWidth={3}
                    strokeDasharray={CIRCUNFERENCIA}
                    strokeDashoffset={CIRCUNFERENCIA * (1 - progreso / 100)}
                  />
                </svg>
              )}
            </button>
            <span className={pathname.startsWith("/mapa") ? "text-text-accent" : "text-text-secondary"}>
              Mapa
            </span>
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
        <RutasMapeadasModal token={sesion?.token ?? null} onClose={() => setMostrarRutas(false)} />
      )}
    </>
  );
}
