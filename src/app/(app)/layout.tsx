"use client";

import { Suspense, useEffect, type ReactNode } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { EmergenciaBanner } from "@/components/EmergenciaBanner";
import { SwipeNavigator } from "@/components/SwipeNavigator";
import { useSession } from "@/context/SessionContext";
import { BorradorPostProvider } from "@/context/BorradorPostContext";
import { RUTAS_RESTRINGIDAS_VISITANTE } from "@/lib/session";

// Next.js exige que useSearchParams() esté dentro de un <Suspense> (si no, el
// build de producción falla con "missing-suspense-with-csr-bailout") — se
// aisla en su propio componente solo por eso, no por necesidad real de mostrar
// un fallback (el padre ya cubre la pantalla con su propio "Cargando...").
function RedirigirSinSesion() {
  const { sesion, cargando } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (cargando || sesion) return;
    const query = searchParams.toString();
    const destino = pathname + (query ? `?${query}` : "");
    router.replace(`/bienvenida?next=${encodeURIComponent(destino)}`);
  }, [cargando, sesion, pathname, router, searchParams]);

  return null;
}

export default function AppGroupLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { sesion, cargando, logout } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (cargando || !sesion) return;

    if (
      sesion.rol === "visitante" &&
      RUTAS_RESTRINGIDAS_VISITANTE.some((ruta) => pathname.startsWith(ruta))
    ) {
      router.replace("/post");
    }
  }, [cargando, sesion, pathname, router]);

  const rutaRestringida =
    sesion?.rol === "visitante" &&
    RUTAS_RESTRINGIDAS_VISITANTE.some((ruta) => pathname.startsWith(ruta));

  if (cargando || !sesion || rutaRestringida) {
    return (
      <>
        <Suspense fallback={null}>
          <RedirigirSinSesion />
        </Suspense>
        <div className="flex flex-1 items-center justify-center text-text-secondary">
          Cargando...
        </div>
      </>
    );
  }

  return (
    // El truco de `[transform:translateZ(0)]` no es cosmético: cualquier
    // ancestro con `transform` distinto de `none` pasa a ser el "containing
    // block" de sus descendientes `position: fixed` (y `absolute`), según el
    // spec de CSS. Sin esto, todos los overlays `fixed inset-0` de la app
    // (paneles, modales, el visor de historias, etc.) se posicionan respecto
    // a toda la ventana del navegador en vez de este contenedor de ancho de
    // teléfono — por eso en desktop se veían expandidos a pantalla completa
    // en vez de quedar centrados y angostos como en un celular.
    <div className="relative mx-auto flex min-h-dvh w-full max-w-md flex-1 flex-col bg-page-bg [transform:translateZ(0)]">
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

      <BorradorPostProvider>
        <SwipeNavigator>{children}</SwipeNavigator>
      </BorradorPostProvider>

      <BottomNav />
    </div>
  );
}
