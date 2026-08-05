"use client";

import { useState } from "react";
import { IconPhoto, IconUsers, IconX } from "@tabler/icons-react";
import {
  crearActividad,
  CATEGORIAS_ACTIVIDAD,
  ETIQUETA_CATEGORIA,
  MINUTOS_AVISO_CREADOR_VALIDOS,
  type CategoriaActividad,
} from "@/lib/calendario";
import { useNoAutofill } from "@/lib/useNoAutofill";
import { SelectorInvitadosActividad } from "./SelectorInvitadosActividad";
import { ApoyoVisualActividad } from "./ApoyoVisualActividad";

export function CrearActividadModal({
  propioId,
  token,
  fechaInicial,
  onCreada,
  onCerrar,
}: {
  propioId: number | null | undefined;
  token: string | null;
  fechaInicial: string;
  onCreada: () => void;
  onCerrar: () => void;
}) {
  const [categoria, setCategoria] = useState<CategoriaActividad>("patinada_libre");
  const [titulo, setTitulo] = useState("");
  const [fecha, setFecha] = useState(fechaInicial);
  const [hora, setHora] = useState("");
  const [puntoEncuentro, setPuntoEncuentro] = useState("");
  const [invitadosIds, setInvitadosIds] = useState<number[]>([]);
  const [minutosAvisoCreador, setMinutosAvisoCreador] = useState<number | null>(null);
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);
  const [musicaId, setMusicaId] = useState<string | null>(null);
  const [mostrarInvitados, setMostrarInvitados] = useState(false);
  const [mostrarApoyoVisual, setMostrarApoyoVisual] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const noAutofillTitulo = useNoAutofill();
  const noAutofillPunto = useNoAutofill();

  async function guardar() {
    if (!token || !titulo.trim() || !fecha || invitadosIds.length === 0) return;
    setGuardando(true);
    setError("");
    try {
      await crearActividad(
        {
          categoria,
          titulo: titulo.trim(),
          fecha,
          hora: hora || undefined,
          puntoEncuentro: puntoEncuentro.trim() || undefined,
          fotoUrl: fotoUrl ?? undefined,
          musicaId: musicaId ?? undefined,
          minutosAvisoCreador: minutosAvisoCreador ?? undefined,
          invitadosIds,
        },
        token,
      );
      onCreada();
    } catch {
      setError("No se pudo crear la actividad. Probá de nuevo.");
      setGuardando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6" onClick={onCerrar}>
      <div
        className="card flex w-full max-w-xs flex-col gap-3 p-5"
        style={{ maxHeight: "88vh", overflowY: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-accent">Nueva actividad</h2>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="text-text-secondary">
            <IconX size={18} />
          </button>
        </div>

        <div className="flex gap-1.5 rounded-app bg-surface-2 p-1">
          {CATEGORIAS_ACTIVIDAD.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoria(cat)}
              className={`flex-1 rounded-app py-1.5 text-[11px] font-semibold ${
                categoria === cat ? "bg-fill-primary text-on-primary" : "text-text-secondary"
              }`}
            >
              {ETIQUETA_CATEGORIA[cat]}
            </button>
          ))}
        </div>

        <input
          type="text"
          autoComplete="off"
          {...noAutofillTitulo}
          placeholder="Título"
          value={titulo}
          maxLength={60}
          onChange={(e) => setTitulo(e.target.value)}
          className="rounded-app border border-border bg-surface-2 px-3 py-2 text-sm text-text-primary outline-none"
        />

        <div className="flex gap-2">
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="w-1/2 rounded-app border border-border bg-surface-2 px-3 py-2 text-sm text-text-primary outline-none"
          />
          <input
            type="time"
            value={hora}
            onChange={(e) => setHora(e.target.value)}
            className="w-1/2 rounded-app border border-border bg-surface-2 px-3 py-2 text-sm text-text-primary outline-none"
          />
        </div>

        <input
          type="text"
          autoComplete="off"
          {...noAutofillPunto}
          placeholder="Punto de encuentro (opcional)"
          value={puntoEncuentro}
          onChange={(e) => setPuntoEncuentro(e.target.value)}
          className="rounded-app border border-border bg-surface-2 px-3 py-2 text-sm text-text-primary outline-none"
        />

        <button
          type="button"
          onClick={() => setMostrarInvitados(true)}
          className="flex items-center gap-2 rounded-app border border-border bg-surface-2 px-3 py-2 text-sm text-text-primary"
        >
          <IconUsers size={16} className="text-text-accent" />
          {invitadosIds.length > 0 ? `${invitadosIds.length} invitado(s)` : "Invitar personas"}
        </button>

        <button
          type="button"
          onClick={() => setMostrarApoyoVisual(true)}
          className="flex items-center gap-2 rounded-app border border-border bg-surface-2 px-3 py-2 text-sm text-text-primary"
        >
          <IconPhoto size={16} className="text-text-accent" />
          {fotoUrl ? "Foto agregada" : "Apoyo visual (opcional)"}
        </button>

        <div className="flex flex-col gap-1">
          <p className="text-xs text-text-secondary">Tu recordatorio personal (opcional)</p>
          <div className="flex gap-1.5">
            {MINUTOS_AVISO_CREADOR_VALIDOS.map((min) => (
              <button
                key={min}
                type="button"
                onClick={() => setMinutosAvisoCreador((prev) => (prev === min ? null : min))}
                className={`flex-1 rounded-app border py-1.5 text-xs ${
                  minutosAvisoCreador === min
                    ? "border-fill-primary bg-fill-primary text-on-primary"
                    : "border-border text-text-secondary"
                }`}
              >
                {min < 60 ? `${min} min` : `${min / 60} h`}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-xs text-fill-warning">{error}</p>}

        <button
          type="button"
          disabled={!titulo.trim() || !fecha || invitadosIds.length === 0 || guardando}
          onClick={guardar}
          className="btn-hero rounded-app px-4 py-2 text-sm disabled:opacity-50"
        >
          {guardando ? "Creando..." : "Crear actividad"}
        </button>
      </div>

      {mostrarInvitados && (
        <SelectorInvitadosActividad
          propioId={propioId}
          token={token}
          seleccionados={invitadosIds}
          onCambiar={setInvitadosIds}
          onCerrar={() => setMostrarInvitados(false)}
        />
      )}

      {mostrarApoyoVisual && (
        <ApoyoVisualActividad
          token={token}
          onListo={(url, musica) => {
            setFotoUrl(url);
            setMusicaId(musica);
            setMostrarApoyoVisual(false);
          }}
          onCerrar={() => setMostrarApoyoVisual(false)}
        />
      )}
    </div>
  );
}
