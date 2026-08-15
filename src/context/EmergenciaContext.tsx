"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { apiGet } from "@/lib/api";
import type { EmergenciaActiva } from "@/lib/emergencias";

const INTERVALO_POLLING_MS = 15000;

interface EmergenciaContextValue {
  activas: EmergenciaActiva[];
  miEmergenciaActiva: boolean;
  refrescar: () => Promise<void>;
}

const EmergenciaContext = createContext<EmergenciaContextValue | null>(null);

// Única fuente de verdad de "emergencias activas" (antes cada consumidor
// -- EmergenciaBanner, MapaView -- pedía /emergencias/activas por su cuenta
// cada 15s). Vive en el layout de (app), fuera de <SwipeNavigator>, para que
// tanto el banner global como el candado de navegación (ver GuardiaEmergencia
// en layout.tsx) y el bottom-nav lean el mismo estado sin duplicar el polling.
export function EmergenciaProvider({
  token,
  miembroId,
  children,
}: {
  token: string | null;
  miembroId: number | null;
  children: ReactNode;
}) {
  const [activas, setActivas] = useState<EmergenciaActiva[]>([]);

  // Mismo patrón que el resto de la app (AppHeader.tsx: revisar/revisarMenciones/etc.)
  // -- la función de carga vive DENTRO del efecto, no afuera, para que el
  // linter (react-hooks/set-state-in-effect) no la confunda con una llamada
  // a algo externo al propio efecto.
  useEffect(() => {
    if (!token) return;

    async function cargar() {
      try {
        const lista = await apiGet<EmergenciaActiva[]>("/emergencias/activas", token as string);
        setActivas(lista);
      } catch {
        // silencioso: no interrumpir la app por un fallo de polling
      }
    }

    cargar();
    const intervalo = setInterval(cargar, INTERVALO_POLLING_MS);
    return () => clearInterval(intervalo);
  }, [token]);

  // Versión expuesta a quien active/cancele una emergencia (SosButton,
  // EmergenciaBanner, Perfil) para refrescar sin esperar hasta 15s el
  // próximo tick del polling de arriba.
  const refrescar = useCallback(async () => {
    if (!token) return;
    try {
      const lista = await apiGet<EmergenciaActiva[]>("/emergencias/activas", token);
      setActivas(lista);
    } catch {
      // silencioso
    }
  }, [token]);

  const miEmergenciaActiva = miembroId != null && activas.some((e) => e.miembroId === miembroId);

  return (
    <EmergenciaContext.Provider value={{ activas, miEmergenciaActiva, refrescar }}>
      {children}
    </EmergenciaContext.Provider>
  );
}

export function useEmergencias() {
  const ctx = useContext(EmergenciaContext);
  if (!ctx) throw new Error("useEmergencias debe usarse dentro de EmergenciaProvider");
  return ctx;
}
