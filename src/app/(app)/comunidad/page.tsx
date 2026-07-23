"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/context/SessionContext";
import { apiGet, apiPost, ApiError } from "@/lib/api";
import {
  ETIQUETA_TIPO,
  misAsistenciasEvento,
  confirmarAsistenciaEvento,
  type Publicacion,
} from "@/lib/publicaciones";
import { CarruselFotosPublicacion } from "@/components/Admin/CarruselFotosPublicacion";

function textoVencimiento(p: Publicacion): string | null {
  if (!p.duracionHoras) return null;
  const expiraEn = new Date(p.createdAt).getTime() + p.duracionHoras * 60 * 60 * 1000;
  const horasRestantes = Math.max(0, Math.round((expiraEn - Date.now()) / (60 * 60 * 1000)));
  return horasRestantes <= 1 ? "Vence en menos de 1h" : `Vence en ${horasRestantes}h`;
}

export default function ComunidadPage() {
  const { sesion } = useSession();
  const token = sesion?.token ?? null;
  const [publicaciones, setPublicaciones] = useState<Publicacion[]>([]);
  const [misRespuestas, setMisRespuestas] = useState<Record<number, string>>({});
  const [misAsistencias, setMisAsistencias] = useState<Record<number, boolean>>({});
  const [codigosIngresados, setCodigosIngresados] = useState<Record<number, string>>({});
  const [confirmandoAsistencia, setConfirmandoAsistencia] = useState<number | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  async function cargar() {
    try {
      const lista = await apiGet<Publicacion[]>("/publicaciones", null);
      setPublicaciones(lista);

      if (token) {
        const mias = await apiGet<Record<number, string>>("/publicaciones/mis-rsvps", token);
        setMisRespuestas(mias);
        const asistencias = await misAsistenciasEvento(token);
        setMisAsistencias(asistencias);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cargar la Comunidad.");
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function responderRsvp(publicacionId: number, estado: string) {
    if (!token) return;
    try {
      await apiPost(`/publicaciones/${publicacionId}/rsvp`, { estado }, token);
      setMisRespuestas((prev) => ({ ...prev, [publicacionId]: estado }));
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo registrar tu respuesta.");
    }
  }

  async function confirmarAsistencia(
    publicacionId: number,
    body: { lat?: number; lon?: number; codigo?: string },
  ) {
    if (!token) return;
    setError("");
    setConfirmandoAsistencia(publicacionId);
    try {
      await confirmarAsistenciaEvento(publicacionId, body, token);
      setMisAsistencias((prev) => ({ ...prev, [publicacionId]: true }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo confirmar tu asistencia.");
    } finally {
      setConfirmandoAsistencia(null);
    }
  }

  function confirmarAsistenciaGps(publicacionId: number) {
    if (!navigator.geolocation) {
      setError("Tu navegador no soporta geolocalización.");
      return;
    }
    setConfirmandoAsistencia(publicacionId);
    navigator.geolocation.getCurrentPosition(
      (posicion) => {
        confirmarAsistencia(publicacionId, {
          lat: posicion.coords.latitude,
          lon: posicion.coords.longitude,
        });
      },
      () => {
        setError("No se pudo obtener tu ubicación.");
        setConfirmandoAsistencia(null);
      },
    );
  }

  if (cargando) {
    return <p className="text-sm text-text-secondary">Cargando...</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="card -mx-4 bg-bg-accent px-3 py-4">
        <p className="text-xs font-semibold text-amber-text">NO TE PIERDAS</p>
        <p className="text-sm text-text-primary">Las últimas noticias de la comunidad</p>
      </div>

      {error && <p className="text-xs text-fill-warning">{error}</p>}

      {publicaciones.length === 0 && (
        <p className="text-sm text-text-secondary">Todavía no hay publicaciones.</p>
      )}

      {publicaciones.map((p) => {
        const vencimiento = textoVencimiento(p);
        const miRespuesta = misRespuestas[p.id];
        const esAlerta = p.tipo === "alerta";

        return (
          <div
            key={p.id}
            className={`card -mx-4 flex flex-col gap-2 px-3 py-4 ${esAlerta ? "border-fill-warning" : ""}`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-text-accent">
                {ETIQUETA_TIPO[p.tipo as keyof typeof ETIQUETA_TIPO] ?? p.tipo}
              </span>
              {vencimiento && (
                <span className="text-xs text-fill-warning">{vencimiento}</span>
              )}
            </div>

            <h2 className="text-sm font-semibold text-text-primary">{p.titulo}</h2>
            <p className="whitespace-pre-wrap text-sm text-text-secondary">{p.texto}</p>

            <CarruselFotosPublicacion fotos={p.fotos} alt={p.titulo} />

            {(p.fecha || p.hora || p.puntoEncuentro) && (
              <p className="text-xs text-text-muted">
                {[p.fecha, p.hora, p.puntoEncuentro].filter(Boolean).join(" · ")}
              </p>
            )}

            {p.rsvp && (
              <div className="flex flex-col gap-2 border-t border-border pt-2">
                {sesion?.rol === "visitante" || !token ? (
                  <p className="text-xs text-text-muted">
                    Inicia sesión para confirmar tu asistencia.
                  </p>
                ) : (
                  <div className="flex gap-2">
                    {(["yes", "maybe", "no"] as const).map((estado) => (
                      <button
                        key={estado}
                        type="button"
                        onClick={() => responderRsvp(p.id, estado)}
                        className={`flex-1 rounded-app px-2 py-1 text-xs ${
                          miRespuesta === estado
                            ? "btn-hero"
                            : "border border-border text-text-secondary"
                        }`}
                      >
                        {estado === "yes" ? "Voy" : estado === "maybe" ? "Tal vez" : "No voy"}
                      </button>
                    ))}
                  </div>
                )}
                <p className="text-xs text-text-muted">
                  {p.rsvpCounts.yes} van · {p.rsvpCounts.maybe} tal vez · {p.rsvpCounts.no} no van
                </p>

                {p.tipo === "evento" &&
                  p.tipoAsistenciaEvento &&
                  token &&
                  (miRespuesta === "yes" || miRespuesta === "maybe") && (
                    <div className="border-t border-border pt-2">
                      {misAsistencias[p.id] ? (
                        <p className="text-xs text-fill-success">✓ Asistencia confirmada</p>
                      ) : p.tipoAsistenciaEvento === "cierre_manual" ? (
                        <p className="text-xs text-text-muted">
                          Un organizador confirmará tu asistencia en el lugar.
                        </p>
                      ) : p.tipoAsistenciaEvento === "autoconfirmacion" ? (
                        <button
                          type="button"
                          onClick={() => confirmarAsistencia(p.id, {})}
                          disabled={confirmandoAsistencia === p.id}
                          className="btn-hero rounded-app px-3 py-1.5 text-xs disabled:opacity-60"
                        >
                          {confirmandoAsistencia === p.id ? "Confirmando..." : "Confirmar mi asistencia"}
                        </button>
                      ) : p.tipoAsistenciaEvento === "gps_puntual" ? (
                        <button
                          type="button"
                          onClick={() => confirmarAsistenciaGps(p.id)}
                          disabled={confirmandoAsistencia === p.id}
                          className="btn-hero rounded-app px-3 py-1.5 text-xs disabled:opacity-60"
                        >
                          {confirmandoAsistencia === p.id ? "Marcando..." : "Marcar llegada"}
                        </button>
                      ) : (
                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder="Código de asistencia"
                            value={codigosIngresados[p.id] ?? ""}
                            onChange={(e) =>
                              setCodigosIngresados((prev) => ({ ...prev, [p.id]: e.target.value }))
                            }
                            className="flex-1 rounded-app border border-border bg-surface-2 px-2 py-1 text-xs text-text-primary outline-none"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              confirmarAsistencia(p.id, { codigo: codigosIngresados[p.id] })
                            }
                            disabled={confirmandoAsistencia === p.id}
                            className="btn-hero rounded-app px-3 py-1.5 text-xs disabled:opacity-60"
                          >
                            Confirmar
                          </button>
                        </div>
                      )}
                    </div>
                  )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
