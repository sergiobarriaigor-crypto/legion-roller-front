"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { apiGet } from "@/lib/api";
import { obtenerSocket } from "@/lib/socket";
import type { EmergenciaActiva } from "@/lib/emergencias";

// La sincronización en vivo la hace el socket (emergencia:activada/cancelada,
// ver más abajo) -- este polling queda solo como respaldo de reconciliación
// (una desconexión breve, o algo que se perdió), por eso el intervalo es
// bastante más largo que cuando era la única vía (mismo criterio que
// MapaView.tsx con "patinando ahora").
const INTERVALO_POLLING_MS = 45000;

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

  // Aviso en vivo por socket -- llega casi al instante a CUALQUIER otro
  // miembro conectado (no solo a quien activó/canceló), sin esperar el
  // próximo tick del polling de arriba. El evento no trae el objeto de la
  // emergencia armado (ver comentario en emergencias.gateway.ts): solo
  // dispara un refresco real vía REST, que sigue siendo la única fuente de
  // verdad.
  useEffect(() => {
    if (!token) return;
    const socket = obtenerSocket(token);

    function alCambiar() {
      refrescar();
    }

    socket.on("emergencia:activada", alCambiar);
    socket.on("emergencia:cancelada", alCambiar);
    return () => {
      socket.off("emergencia:activada", alCambiar);
      socket.off("emergencia:cancelada", alCambiar);
    };
  }, [token, refrescar]);

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
