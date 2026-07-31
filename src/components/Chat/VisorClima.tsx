"use client";

import { useEffect, useState } from "react";
import {
  IconArrowLeft,
  IconDroplet,
  IconWind,
  IconRefresh,
  IconMapPinOff,
} from "@tabler/icons-react";
import { obtenerClima, type ClimaDetalle, type SemaforoClima } from "@/lib/clima";
import { ApiError } from "@/lib/api";

const SEMAFORO: Record<SemaforoClima, { emoji: string; texto: string; color: string }> = {
  bueno: { emoji: "🟢", texto: "Buen clima para patinar", color: "var(--fill-success)" },
  precaucion: { emoji: "🟡", texto: "Patinar con precaución", color: "var(--fill-warning)" },
  no_recomendado: { emoji: "🔴", texto: "No recomendado patinar", color: "#d8342f" },
};

function formatearHora(iso: string): string {
  return iso.slice(11, 16);
}

function formatearDiaSemana(fecha: string): string {
  return new Date(`${fecha}T12:00:00`).toLocaleDateString("es-CL", {
    weekday: "short",
    day: "numeric",
    month: "numeric",
  });
}

// Pantalla completa (mismo criterio que SelectorNuevoChat/VisorFotoMensaje)
// con el clima real de donde está el usuario — se pide el GPS cada vez que
// se abre, sin recordar un "permiso denegado" ni caer a ciudades fijas.
export function VisorClima({ token, onCerrar }: { token: string | null; onCerrar: () => void }) {
  const [clima, setClima] = useState<ClimaDetalle | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  function pedirUbicacion() {
    setError("");
    setCargando(true);
    setClima(null);
    if (!navigator.geolocation) {
      setError("Tu navegador no permite compartir la ubicación.");
      setCargando(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        obtenerClima(pos.coords.latitude, pos.coords.longitude, token)
          .then(setClima)
          .catch((err) =>
            setError(err instanceof ApiError ? err.message : "No se pudo cargar el clima."),
          )
          .finally(() => setCargando(false));
      },
      () => {
        setError("Activa tu ubicación para ver el clima de donde estás.");
        setCargando(false);
      },
      { timeout: 8000 },
    );
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    pedirUbicacion();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const semaforo = clima ? SEMAFORO[clima.semaforo] : null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-page-bg" data-no-swipe>
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Volver"
          className="shrink-0 text-text-secondary"
        >
          <IconArrowLeft size={22} />
        </button>
        <p className="text-base font-semibold text-text-primary">Clima</p>
      </div>

      <div className="flex flex-1 flex-col gap-4 px-4 pb-6">
        {cargando && <p className="py-8 text-center text-sm text-text-secondary">Buscando tu ubicación...</p>}

        {!cargando && error && (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <IconMapPinOff size={32} className="text-text-muted" />
            <p className="text-sm text-text-secondary">{error}</p>
            <button
              type="button"
              onClick={pedirUbicacion}
              className="btn-hero flex items-center gap-1.5 rounded-app px-4 py-2 text-sm"
            >
              <IconRefresh size={16} />
              Reintentar
            </button>
          </div>
        )}

        {!cargando && clima && semaforo && (
          <>
            <div
              className="flex items-center gap-2 rounded-app px-3 py-2.5"
              style={{ backgroundColor: `${semaforo.color}22` }}
            >
              <span className="text-lg">{semaforo.emoji}</span>
              <span className="text-sm font-semibold" style={{ color: semaforo.color }}>
                {semaforo.texto}
              </span>
            </div>

            <div className="card flex flex-col gap-3 p-4">
              <div className="flex items-center gap-3">
                <span className="text-4xl">{clima.icono}</span>
                <div>
                  <p className="text-3xl font-semibold text-text-primary">{clima.temperatura}°</p>
                  <p className="text-xs text-text-secondary">
                    {clima.descripcion} · Sensación {clima.sensacionTermica}°
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4 border-t border-border pt-3 text-xs text-text-secondary">
                <span className="flex items-center gap-1.5">
                  <IconDroplet size={15} />
                  {clima.probabilidadLluvia}% lluvia
                </span>
                <span className="flex items-center gap-1.5">
                  <IconWind size={15} />
                  {clima.vientoVelocidad} km/h {clima.vientoDireccion}
                </span>
              </div>
            </div>

            {clima.proximasHoras.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-semibold text-text-accent">Próximas horas</p>
                <div className="flex gap-3 overflow-x-auto pb-1">
                  {clima.proximasHoras.map((h) => (
                    <div
                      key={h.hora}
                      className="flex shrink-0 flex-col items-center gap-1 rounded-app bg-surface-2 px-3 py-2"
                    >
                      <span className="text-[11px] text-text-secondary">{formatearHora(h.hora)}</span>
                      <span className="text-lg">{h.icono}</span>
                      <span className="text-xs font-semibold text-text-primary">{h.temperatura}°</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {clima.proximosDias.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-semibold text-text-accent">Próximos días</p>
                <div className="card flex flex-col p-3">
                  {clima.proximosDias.map((d) => (
                    <div
                      key={d.fecha}
                      className="flex items-center justify-between gap-2 border-t border-border py-2 first:border-t-0 first:pt-0"
                    >
                      <span className="w-20 shrink-0 text-xs text-text-secondary">
                        {formatearDiaSemana(d.fecha)}
                      </span>
                      <span className="text-lg">{d.icono}</span>
                      <span className="min-w-0 flex-1 truncate text-xs text-text-secondary">
                        {d.descripcion}
                      </span>
                      <span className="shrink-0 text-xs text-text-secondary">{d.probabilidadLluvia}%</span>
                      <span className="shrink-0 text-sm text-text-primary">
                        {d.tempMax}° / {d.tempMin}°
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {clima.historialDias.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-semibold text-text-accent">Últimos días</p>
                <div className="card flex flex-col p-3 opacity-80">
                  {clima.historialDias.map((d) => (
                    <div
                      key={d.fecha}
                      className="flex items-center justify-between gap-2 border-t border-border py-2 first:border-t-0 first:pt-0"
                    >
                      <span className="w-20 shrink-0 text-xs text-text-secondary">
                        {formatearDiaSemana(d.fecha)}
                      </span>
                      <span className="text-lg">{d.icono}</span>
                      <span className="min-w-0 flex-1 truncate text-xs text-text-secondary">
                        {d.descripcion}
                      </span>
                      <span className="shrink-0 text-sm text-text-primary">
                        {d.tempMax}° / {d.tempMin}°
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p className="text-center text-[11px] text-text-muted">
              Actualizado:{" "}
              {new Date(clima.actualizadoEn).toLocaleTimeString("es-CL", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
