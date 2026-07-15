"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { IconPin } from "@tabler/icons-react";
import { useSession } from "@/context/SessionContext";
import { apiGet, apiPost, ApiError } from "@/lib/api";
import type { Conversaciones, MensajeChat } from "@/lib/chat";

export default function ConversacionPage() {
  const params = useParams<{ sala: string }>();
  const sala = params.sala;
  const router = useRouter();
  const { sesion } = useSession();
  const token = sesion?.token ?? null;

  const [mensajes, setMensajes] = useState<MensajeChat[]>([]);
  const [titulo, setTitulo] = useState("Chat");
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

  async function cargarTitulo() {
    if (!token) return;
    if (sala === "grupal") {
      setTitulo("Chat grupal");
      return;
    }
    try {
      const conv = await apiGet<Conversaciones>("/chat/conversaciones", token);
      const encontrada = conv.individuales.find((c) => c.sala === sala);
      if (encontrada) setTitulo(encontrada.otroNombre);
    } catch {
      // ignorar
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargarMensajes();
    cargarTitulo();
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
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center gap-2">
        <Link href="/chat" className="text-sm text-text-secondary underline">
          ← Volver
        </Link>
        <h1 className="text-sm font-semibold text-text-accent">{titulo}</h1>
      </div>

      {error && <p className="text-xs text-fill-warning">{error}</p>}

      <div className="card flex flex-1 flex-col gap-2 overflow-y-auto p-4" style={{ minHeight: 320 }}>
        {mensajes.length === 0 && (
          <p className="text-xs text-text-secondary">Todavía no hay mensajes.</p>
        )}
        {mensajes.map((m) => {
          const esMio = m.autorId === sesion?.id;
          // Post o ficha de emprendedor compartidos: la burbuja se vuelve una
          // tarjeta clickeable que lleva directo al contenido (mismo
          // deep-link que usa la campana de notificaciones).
          if (
            (m.referenciaTipo === "post" || m.referenciaTipo === "emprendedor") &&
            m.referenciaId !== null
          ) {
            const destino =
              m.referenciaTipo === "emprendedor"
                ? `/impulsa?emprendedor=${m.referenciaId}`
                : `/post?post=${m.referenciaId}`;
            return (
              <div key={m.id} className={`flex flex-col ${esMio ? "items-end" : "items-start"}`}>
                <button
                  type="button"
                  onClick={() => router.push(destino)}
                  className={`flex max-w-[75%] items-center gap-2 rounded-app px-3 py-2 text-left text-sm ${
                    esMio ? "btn-hero" : "border border-border text-text-primary"
                  }`}
                >
                  <IconPin size={16} className="shrink-0" />
                  <span>
                    {!esMio && <span className="block text-xs font-semibold text-text-accent">{m.autorNombre}</span>}
                    {m.texto}
                  </span>
                </button>
              </div>
            );
          }
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
  );
}
