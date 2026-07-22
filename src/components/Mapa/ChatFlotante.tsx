"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { IconX, IconChevronLeft } from "@tabler/icons-react";
import { useSession } from "@/context/SessionContext";
import { useConversacion } from "@/hooks/useConversacion";
import { BurbujaMensaje } from "@/components/Chat/BurbujaMensaje";

const MS_PAUSA_ESCRIBIENDO = 2000;

// Chat flotante sobre el Mapa: al tocar "Enviar mensaje" en la tarjeta de otro
// patinador, esto se abre como un modal centrado (mismo patrón que el modal
// de "Enviar reconocimiento") en vez de navegar a /chat/[sala] — así no se
// pierde el contexto del mapa ni a los demás patinadores visibles. Migrado al
// motor compartido (useConversacion + BurbujaMensaje en modo `compacto`): vivo
// en tiempo real igual que la pantalla completa, pero sin swipe/reacciones/
// adjuntos/menú — ese modal no reemplaza la pantalla completa de chat, solo un
// envío rápido con lo esencial en vivo.
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
  const propioId = sesion?.id ?? null;
  const finRef = useRef<HTMLDivElement>(null);
  const propioEscribiendoRef = useRef(false);
  const pausaEscribiendoRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [texto, setTexto] = useState("");

  const { mensajes, error, enviando, escribiendo, enviar, notificarEscribiendo, estadoEnvio } =
    useConversacion({ sala, token, propioId });

  useEffect(() => {
    finRef.current?.scrollIntoView({ block: "end" });
  }, [mensajes]);

  function onCambioTexto(valor: string) {
    setTexto(valor);
    if (!propioEscribiendoRef.current) {
      propioEscribiendoRef.current = true;
      notificarEscribiendo(true);
    }
    if (pausaEscribiendoRef.current) clearTimeout(pausaEscribiendoRef.current);
    pausaEscribiendoRef.current = setTimeout(() => {
      propioEscribiendoRef.current = false;
      notificarEscribiendo(false);
    }, MS_PAUSA_ESCRIBIENDO);
  }

  async function onEnviar(e: React.FormEvent) {
    e.preventDefault();
    if (!texto.trim()) return;
    if (pausaEscribiendoRef.current) clearTimeout(pausaEscribiendoRef.current);
    propioEscribiendoRef.current = false;
    notificarEscribiendo(false);
    await enviar({ texto });
    setTexto("");
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6"
      onClick={onClose}
      data-no-swipe
    >
      <div
        className="card flex w-full max-w-xs flex-col gap-3 p-5 shadow-2xl"
        style={{ height: "60vh" }}
        onClick={(e) => e.stopPropagation()}
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
            <div className="flex flex-1 flex-col items-center overflow-hidden">
              <div className="flex items-center gap-2">
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
              {escribiendo && (
                <p className="truncate text-[10px] text-text-muted">{escribiendo.nombre} está escribiendo...</p>
              )}
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
            {mensajes.map((m) => (
              <BurbujaMensaje
                key={m.id}
                mensaje={m}
                esMio={m.autorId === propioId}
                estadoEnvio={estadoEnvio(m)}
                compacto
              />
            ))}
            <div ref={finRef} />
          </div>

          <p className="text-center text-[10px] text-text-secondary">
            Los mensajes se eliminan solos a los 7 días.
          </p>

          <form onSubmit={onEnviar} className="flex gap-2">
            <input
              type="text"
              placeholder="Escribe un mensaje..."
              value={texto}
              onChange={(e) => onCambioTexto(e.target.value)}
              className="flex-1 rounded-app border border-border bg-surface-2 px-3 py-2 text-sm text-text-primary outline-none"
            />
            <button type="submit" disabled={enviando} className="btn-hero rounded-app px-4 py-2 text-sm disabled:opacity-60">
              Enviar
            </button>
          </form>
      </div>
    </div>
  );
}
