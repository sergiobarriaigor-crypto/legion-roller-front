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

// Ventana para considerar dos toques seguidos como "doble toque" (mismo
// concepto que el doble clic de escritorio, pero pensado para dedo en
// pantalla táctil).
const DOBLE_TOQUE_MS = 300;

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
  const [logoError, setLogoError] = useState(false);
  const tapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Un toque va a /mapa; dos toques seguidos (dentro de DOBLE_TOQUE_MS) abren
  // "Mis rutas". Como no hay forma de saber de antemano si un toque va a ser
  // el único o el primero de dos, el primer toque espera un poco antes de
  // navegar por si llega un segundo — igual que el doble clic de escritorio.
  function onClickMapa() {
    if (tapTimeoutRef.current) {
      clearTimeout(tapTimeoutRef.current);
      tapTimeoutRef.current = null;
      setMostrarRutas(true);
      return;
    }
    tapTimeoutRef.current = setTimeout(() => {
      tapTimeoutRef.current = null;
      router.push("/mapa");
    }, DOBLE_TOQUE_MS);
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
              aria-label="Mapa: toca para ir, toca dos veces para ver tus rutas"
              onClick={onClickMapa}
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
