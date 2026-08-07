"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
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
  const botonMapaRef = useRef<HTMLButtonElement>(null);
  const [debugInfo, setDebugInfo] = useState<string | null>(null);

  // Diagnóstico temporal (solo con ?debug=1 en la URL): reporta el tamaño
  // real renderizado del botón del Mapa, para confirmar en un celular real
  // si coincide con los 70px esperados o si algo lo agranda -- ver la
  // superposición reportada sobre "Cerrar sesión" en Perfil.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).get("debug") !== "1") return;
    function medir() {
      const rect = botonMapaRef.current?.getBoundingClientRect();
      if (!rect) return;
      const cs = botonMapaRef.current ? getComputedStyle(botonMapaRef.current) : null;

      // Busca el último <button> visible que contenga "Cerrar sesión" (sin
      // acoplar BottomNav a perfil/page.tsx) para medir el hueco real entre
      // ese botón y el círculo del Mapa.
      const botones = Array.from(document.querySelectorAll("button"));
      const cerrarSesion = botones.find((b) => b.textContent?.trim() === "Cerrar sesión");
      const rectCerrar = cerrarSesion?.getBoundingClientRect();

      const main = document.querySelector("main");

      setDebugInfo(
        `viewport ${window.innerWidth}x${window.innerHeight} dpr=${window.devicePixelRatio} ` +
          `fontRoot=${getComputedStyle(document.documentElement).fontSize} | ` +
          `boton rect=${Math.round(rect.width)}x${Math.round(rect.height)} top=${Math.round(rect.top)} bottom=${Math.round(rect.bottom)} | ` +
          `computed h=${cs?.height} w=${cs?.width} mt=${cs?.marginTop} transform=${cs?.transform} | ` +
          (rectCerrar
            ? `cerrarSesion top=${Math.round(rectCerrar.top)} bottom=${Math.round(rectCerrar.bottom)} gap=${Math.round(rect.top - rectCerrar.bottom)}`
            : "cerrarSesion no encontrado en esta pantalla") +
          (main
            ? ` | main scrollTop=${Math.round(main.scrollTop)} scrollHeight=${Math.round(main.scrollHeight)} clientHeight=${Math.round(main.clientHeight)}`
            : ""),
      );
    }
    medir();
    window.addEventListener("resize", medir);
    const id = setInterval(medir, 500);
    return () => {
      window.removeEventListener("resize", medir);
      clearInterval(id);
    };
  }, []);

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
              ref={botonMapaRef}
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

      {debugInfo && (
        <div className="fixed top-2 left-2 right-2 z-[999] rounded bg-black/90 p-2 text-[10px] leading-tight text-lime-300 break-words">
          {debugInfo}
        </div>
      )}
    </>
  );
}
