"use client";

import { useState } from "react";
import { IconX, IconPlus, IconTrash } from "@tabler/icons-react";
import { ApiError } from "@/lib/api";

const MIN_OPCIONES = 2;
const MAX_OPCIONES = 10;

// Encuestas: solo en el chat grupal (validado también en el backend).
// Pregunta + entre 2 y 10 opciones, mismo patrón visual de hoja inferior que
// los demás selectores de adjunto (SelectorRutaMensaje, SelectorUbicacionChat).
export function CrearEncuestaModal({
  onCrear,
  onCerrar,
}: {
  onCrear: (pregunta: string, opciones: string[]) => Promise<void>;
  onCerrar: () => void;
}) {
  const [pregunta, setPregunta] = useState("");
  const [opciones, setOpciones] = useState(["", ""]);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  function actualizarOpcion(indice: number, valor: string) {
    setOpciones((prev) => prev.map((o, i) => (i === indice ? valor : o)));
  }

  function agregarOpcion() {
    setOpciones((prev) => (prev.length < MAX_OPCIONES ? [...prev, ""] : prev));
  }

  function quitarOpcion(indice: number) {
    setOpciones((prev) => (prev.length > MIN_OPCIONES ? prev.filter((_, i) => i !== indice) : prev));
  }

  const opcionesValidas = opciones.map((o) => o.trim()).filter((o) => o.length > 0);
  const puedeEnviar = pregunta.trim().length > 0 && opcionesValidas.length >= MIN_OPCIONES;

  async function enviar() {
    if (!puedeEnviar || enviando) return;
    setEnviando(true);
    setError("");
    try {
      await onCrear(pregunta.trim(), opcionesValidas);
      onCerrar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo crear la encuesta.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50" data-no-swipe>
      <div className="absolute inset-0 bg-black/75" onClick={onCerrar} aria-hidden />
      <div className="absolute inset-x-0 bottom-0 flex max-h-[80%] flex-col rounded-t-2xl bg-surface-2 shadow-[0_-8px_30px_rgba(0,0,0,0.5)]">
        <div className="flex justify-center pb-1 pt-2">
          <span className="h-1 w-10 rounded-full bg-white/20" />
        </div>
        <div className="flex items-center justify-between border-b border-border px-3 pb-3">
          <h3 className="text-sm font-semibold text-text-primary">Crear encuesta</h3>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="text-text-secondary">
            <IconX size={20} />
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-3">
          <input
            type="text"
            placeholder="Pregunta"
            value={pregunta}
            onChange={(e) => setPregunta(e.target.value)}
            maxLength={300}
            className="rounded-app border border-border bg-surface-1 px-3 py-2 text-sm text-text-primary outline-none"
          />

          <div className="flex flex-col gap-2">
            {opciones.map((o, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder={`Opción ${i + 1}`}
                  value={o}
                  onChange={(e) => actualizarOpcion(i, e.target.value)}
                  maxLength={120}
                  className="min-w-0 flex-1 rounded-app border border-border bg-surface-1 px-3 py-2 text-sm text-text-primary outline-none"
                />
                {opciones.length > MIN_OPCIONES && (
                  <button
                    type="button"
                    onClick={() => quitarOpcion(i)}
                    aria-label="Quitar opción"
                    className="shrink-0 text-text-secondary"
                  >
                    <IconTrash size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>

          {opciones.length < MAX_OPCIONES && (
            <button
              type="button"
              onClick={agregarOpcion}
              className="flex items-center gap-1.5 self-start rounded-app px-2 py-1 text-xs text-text-accent active:bg-white/5"
            >
              <IconPlus size={14} />
              Agregar opción
            </button>
          )}

          {error && <p className="text-xs text-fill-warning">{error}</p>}
        </div>

        <div className="border-t border-border p-3">
          <button
            type="button"
            onClick={enviar}
            disabled={!puedeEnviar || enviando}
            className="btn-hero w-full rounded-app px-4 py-2.5 text-sm disabled:opacity-60"
          >
            {enviando ? "Creando..." : "Crear encuesta"}
          </button>
        </div>
      </div>
    </div>
  );
}
