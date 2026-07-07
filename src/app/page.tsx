"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/context/SessionContext";
import { rutaInicialParaRol } from "@/lib/session";

export default function Home() {
  const { sesion, cargando } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (cargando) return;
    router.replace(sesion ? rutaInicialParaRol(sesion.rol) : "/bienvenida");
  }, [cargando, sesion, router]);

  return null;
}
