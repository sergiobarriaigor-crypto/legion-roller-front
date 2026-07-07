"use client";

import { useSession } from "@/context/SessionContext";

export default function PerfilPage() {
  const { sesion, logout } = useSession();

  return (
    <div className="flex flex-col gap-4">
      <div className="card flex flex-col gap-2 p-5">
        <h1 className="text-lg font-semibold text-text-accent">Perfil</h1>
        <p className="text-sm text-text-secondary">
          Nombre: <span className="text-text-primary">{sesion?.nombre}</span>
        </p>
        <p className="text-sm text-text-secondary">
          Rol: <span className="text-text-primary">{sesion?.rol}</span>
        </p>
        <p className="text-sm text-text-secondary">
          Acá van a vivir las estadísticas, técnicas dominadas,
          reconocimientos e historial de recorridos (Fase 7).
        </p>
      </div>

      <button
        type="button"
        onClick={logout}
        className="card px-4 py-3 text-sm text-fill-warning"
      >
        Cerrar sesión
      </button>
    </div>
  );
}
