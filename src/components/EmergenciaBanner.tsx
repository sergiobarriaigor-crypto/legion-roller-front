"use client";

import { useSession } from "@/context/SessionContext";
import { useEmergencias } from "@/context/EmergenciaContext";
import { apiDelete } from "@/lib/api";
import { ETIQUETA_MOTIVO } from "@/lib/emergencias";

export function EmergenciaBanner() {
  const { sesion } = useSession();
  const token = sesion?.token ?? null;
  const { activas, refrescar } = useEmergencias();

  async function cancelar() {
    if (!token) return;
    try {
      await apiDelete("/emergencias/mia", token);
    } finally {
      refrescar();
    }
  }

  if (activas.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 bg-red-700 px-4 py-3 text-white">
      {activas.map((e) => {
        const esMia = e.miembroId === sesion?.id;
        const etiqueta = ETIQUETA_MOTIVO[e.motivo as keyof typeof ETIQUETA_MOTIVO] ?? e.motivo;
        return (
          <div key={e.id} className="flex items-center justify-between gap-2">
            <p className="text-xs">
              🚨 {esMia ? "Tú activaste una emergencia" : `${e.nombre} activó una emergencia`} —{" "}
              {etiqueta}
            </p>
            <div className="flex shrink-0 gap-2">
              <a
                href="tel:131"
                className="rounded bg-white px-2 py-1 text-xs font-semibold text-red-700"
              >
                Llamar 131
              </a>
              {esMia && (
                <button
                  type="button"
                  onClick={cancelar}
                  className="rounded border border-white px-2 py-1 text-xs"
                >
                  Cancelar
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
