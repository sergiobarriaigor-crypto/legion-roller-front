"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { EmergenciaBanner } from "@/components/EmergenciaBanner";
import { SwipeNavigator } from "@/components/SwipeNavigator";
import { useSession } from "@/context/SessionContext";
import { RUTAS_RESTRINGIDAS_VISITANTE } from "@/lib/session";

export default function AppGroupLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { sesion, cargando, logout } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (cargando) return;

    if (!sesion) {
      router.replace("/bienvenida");
      return;
    }

    if (
      sesion.rol === "visitante" &&
      RUTAS_RESTRINGIDAS_VISITANTE.some((ruta) => pathname.startsWith(ruta))
    ) {
      router.replace("/comunidad");
    }
  }, [cargando, sesion, pathname, router]);

  const rutaRestringida =
    sesion?.rol === "visitante" &&
    RUTAS_RESTRINGIDAS_VISITANTE.some((ruta) => pathname.startsWith(ruta));

  if (cargando || !sesion || rutaRestringida) {
    return (
      <div className="flex flex-1 items-center justify-center text-text-secondary">
        Cargando...
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-1 flex-col bg-page-bg">
      <AppHeader />
      {sesion.rol !== "visitante" && <EmergenciaBanner />}

      {sesion.rol === "visitante" && (
        <div className="flex items-center justify-between bg-bg-accent px-4 py-2 text-xs text-amber-text">
          <span>Estás como visitante — navegación limitada</span>
          <button type="button" onClick={logout} className="underline">
            Salir
          </button>
        </div>
      )}

      <SwipeNavigator>{children}</SwipeNavigator>

      <BottomNav />
    </div>
  );
}
