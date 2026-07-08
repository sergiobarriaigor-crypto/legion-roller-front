"use client";

import { useRef, useState } from "react";
import { IconAlertTriangle } from "@tabler/icons-react";
import { useSession } from "@/context/SessionContext";
import { apiPost, ApiError } from "@/lib/api";
import { MOTIVOS_EMERGENCIA, ETIQUETA_MOTIVO, type MotivoEmergencia } from "@/lib/emergencias";

const DURACION_HOLD_MS = 1500;
const RADIO = 16;
const CIRCUNFERENCIA = 2 * Math.PI * RADIO;

export function SosButton() {
  const { sesion } = useSession();
  const token = sesion?.token ?? null;

  const [progreso, setProgreso] = useState(0);
  const [manteniendo, setManteniendo] = useState(false);
  const [mostrarModal, setMostrarModal] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const intervaloRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function iniciarHold() {
    if (!token) return;
    setManteniendo(true);
    const inicio = Date.now();
    intervaloRef.current = setInterval(() => {
      const pct = Math.min(100, ((Date.now() - inicio) / DURACION_HOLD_MS) * 100);
      setProgreso(pct);
      if (pct >= 100) {
        cancelarHold();
        setMostrarModal(true);
      }
    }, 30);
  }

  function cancelarHold() {
    if (intervaloRef.current) clearInterval(intervaloRef.current);
    intervaloRef.current = null;
    setManteniendo(false);
    setProgreso(0);
  }

  async function confirmarEmergencia(motivo: MotivoEmergencia) {
    if (!token) return;
    setEnviando(true);
    setError("");
    try {
      await apiPost("/emergencias", { motivo }, token);
      setMostrarModal(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo activar la emergencia.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <button
        type="button"
        aria-label="Emergencia / SOS: mantén presionado"
        onPointerDown={iniciarHold}
        onPointerUp={cancelarHold}
        onPointerLeave={cancelarHold}
        onPointerCancel={cancelarHold}
        className="relative flex h-9 w-9 select-none items-center justify-center rounded-full bg-fill-warning/10 text-fill-warning"
      >
        <IconAlertTriangle size={20} />
        {manteniendo && (
          <svg className="pointer-events-none absolute inset-0 -rotate-90" width={36} height={36}>
            <circle
              cx={18}
              cy={18}
              r={RADIO}
              fill="none"
              stroke="currentColor"
              strokeWidth={3}
              strokeDasharray={CIRCUNFERENCIA}
              strokeDashoffset={CIRCUNFERENCIA * (1 - progreso / 100)}
            />
          </svg>
        )}
      </button>

      {mostrarModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6">
          <div className="card flex w-full max-w-xs flex-col gap-3 p-5">
            <h2 className="text-sm font-semibold text-fill-warning">¿Qué está pasando?</h2>
            {MOTIVOS_EMERGENCIA.map((m) => (
              <button
                key={m}
                type="button"
                disabled={enviando}
                onClick={() => confirmarEmergencia(m)}
                className="rounded-app border border-border px-4 py-2 text-sm text-text-primary disabled:opacity-50"
              >
                {ETIQUETA_MOTIVO[m]}
              </button>
            ))}
            {error && <p className="text-xs text-fill-warning">{error}</p>}
            <button
              type="button"
              onClick={() => setMostrarModal(false)}
              className="text-xs text-text-secondary underline"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </>
  );
}
