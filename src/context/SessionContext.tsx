"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  cerrarSesion,
  guardarSesion,
  leerSesionGuardada,
  type Rol,
  type Sesion,
} from "@/lib/session";

interface SessionContextValue {
  sesion: Sesion | null;
  cargando: boolean;
  login: (datos: { id: number | null; nombre: string; rol: Rol; token: string | null }) => void;
  logout: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [sesion, setSesion] = useState<Sesion | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    setSesion(leerSesionGuardada());
    setCargando(false);
  }, []);

  function login(datos: { id: number | null; nombre: string; rol: Rol; token: string | null }) {
    setSesion(guardarSesion(datos));
  }

  function logout() {
    cerrarSesion();
    setSesion(null);
  }

  return (
    <SessionContext.Provider value={{ sesion, cargando, login, logout }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error("useSession debe usarse dentro de <SessionProvider>");
  }
  return ctx;
}
