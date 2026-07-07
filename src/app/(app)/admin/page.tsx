"use client";

import { useSession } from "@/context/SessionContext";

export default function AdminPage() {
  const { sesion } = useSession();

  if (sesion?.rol !== "admin") {
    return (
      <div className="card p-5 text-sm text-fill-warning">
        No tienes permisos para ver esta sección.
      </div>
    );
  }

  return (
    <div className="card flex flex-col gap-2 p-5">
      <h1 className="text-lg font-semibold text-text-accent">
        Panel de Administración
      </h1>
      <p className="text-sm text-text-secondary">
        Acá van a vivir las 5 secciones del panel admin (Fase 10):
        Publicaciones, Fotografías, Asistencia, Integrantes y Notificaciones.
      </p>
    </div>
  );
}
