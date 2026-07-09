"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { IconX, IconChevronLeft } from "@tabler/icons-react";
import { useSession } from "@/context/SessionContext";
import { apiGet, apiPost, ApiError } from "@/lib/api";
import type { MensajeChat } from "@/lib/chat";

// Chat flotante sobre el Mapa: al tocar "Enviar mensaje" en la tarjeta de otro
// patinador, esto se abre como una hoja inferior (mismo patrón que
// MisRutasPanel) en vez de navegar a /chat/[sala] — así no se pierde el
// contexto del mapa ni a los demás patinadores visibles.
export function ChatFlotante({
  sala,
  nombreOtro,
  fotoOtro,
  token,
  onClose,
}: {
  sala: string;
  nombreOtro: string;
  fotoOtro: string | null;
  token: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const { sesion } = useSession();
  const [mensajes, setMensajes] = useState<MensajeChat[]>([]);
  const [texto, setTexto] = useState("");
  const [error, setError] = useState("");
  const finRef = useRef<HTMLDivElement>(null);

  async function cargarMensajes() {
    if (!token) return;
    try {
      const lista = await apiGet<MensajeChat[]>(`/chat/mensajes/${sala}`, token);
      setMensajes(lista);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cargar la conversación.");
    }
  }

  useEffect(() => {
    cargarMensajes();
    const intervalo = setInterval(cargarMensajes, 5000);
    return () => clearInterval(intervalo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, sala]);

  useEffect(() => {
    finRef.current?.scrollIntoView({ block: "end" });
  }, [mensajes]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !texto.trim()) return;
    try {
      await apiPost(`/chat/mensajes/${sala}`, { texto }, token);
      setTexto("");
      cargarMensajes();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo enviar el mensaje.");
    }
  }

  return (
    <>
      {/* Mismo velo oscuro que MisRutasPanel, para que el mapa se siga viendo
          de fondo pero sin competir visualmente. Tocarlo cierra. */}
      <div className="fixed inset-0 z-40 bg-black/45" onClick={onClose} />

      <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center pointer-events-none">
        <div
          className="card pointer-events-auto flex w-full max-w-md flex-col gap-3 rounded-b-none p-4 shadow-2xl"
          style={{ height: "48vh" }}
        >
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => router.push("/chat")}
              className="flex shrink-0 items-center gap-1 text-xs text-text-secondary"
            >
              <IconChevronLeft size={16} />
              Chats
            </button>
            <div className="flex flex-1 items-center justify-center gap-2 overflow-hidden">
              {fotoOtro ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={fotoOtro}
                  alt={nombreOtro}
                  className="h-7 w-7 shrink-0 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs font-semibold text-text-accent">
                  {nombreOtro.charAt(0).toUpperCase()}
                </div>
              )}
              <span className="truncate text-sm font-semibold text-text-accent">{nombreOtro}</span>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="shrink-0 text-text-secondary"
            >
              <IconX size={18} />
            </button>
          </div>

          {error && <p className="text-xs text-fill-warning">{error}</p>}

          <div className="flex flex-1 flex-col gap-2 overflow-y-auto">
            {mensajes.length === 0 && (
              <p className="text-xs text-text-secondary">Todavía no hay mensajes.</p>
            )}
            {mensajes.map((m) => {
              const esMio = m.autorId === sesion?.id;
              return (
                <div key={m.id} className={`flex flex-col ${esMio ? "items-end" : "items-start"}`}>
                  <div
                    className={`max-w-[75%] rounded-app px-3 py-2 text-sm ${
                      esMio ? "btn-hero" : "border border-border text-text-primary"
                    }`}
                  >
                    {!esMio && <p className="text-xs font-semibold text-text-accent">{m.autorNombre}</p>}
                    <p>{m.texto}</p>
                  </div>
                </div>
              );
            })}
            <div ref={finRef} />
          </div>

          <p className="text-center text-[10px] text-text-secondary">
            Los mensajes se eliminan solos a los 7 días.
          </p>

          <form onSubmit={enviar} className="flex gap-2">
            <input
              type="text"
              placeholder="Escribe un mensaje..."
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              className="flex-1 rounded-app border border-border bg-surface-2 px-3 py-2 text-sm text-text-primary outline-none"
            />
            <button type="submit" className="btn-hero rounded-app px-4 py-2 text-sm">
              Enviar
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
