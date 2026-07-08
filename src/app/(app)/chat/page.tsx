"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "@/context/SessionContext";
import { apiGet, ApiError } from "@/lib/api";
import {
  salaIndividual,
  type Conversaciones,
  type MiembroSimple,
} from "@/lib/chat";

export default function ChatListaPage() {
  const { sesion } = useSession();
  const token = sesion?.token ?? null;

  const [conversaciones, setConversaciones] = useState<Conversaciones | null>(null);
  const [miembros, setMiembros] = useState<MiembroSimple[]>([]);
  const [mostrarNuevo, setMostrarNuevo] = useState(false);
  const [error, setError] = useState("");

  async function cargar() {
    if (!token) return;
    try {
      const datos = await apiGet<Conversaciones>("/chat/conversaciones", token);
      setConversaciones(datos);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cargar el chat.");
    }
  }

  useEffect(() => {
    cargar();
    const intervalo = setInterval(cargar, 15000);
    return () => clearInterval(intervalo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function abrirNuevo() {
    if (!token) return;
    try {
      const lista = await apiGet<MiembroSimple[]>("/chat/miembros", token);
      setMiembros(lista.filter((m) => m.id !== sesion?.id));
      setMostrarNuevo(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cargar la lista de miembros.");
    }
  }

  if (!conversaciones) {
    return <p className="text-sm text-text-secondary">Cargando...</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-lg font-semibold text-text-accent">Chat</h1>

      {error && <p className="text-xs text-fill-warning">{error}</p>}

      <Link href="/chat/grupal" className="card flex items-center justify-between p-4">
        <div>
          <p className="text-sm font-semibold text-text-primary">Chat grupal</p>
          {conversaciones.grupal.ultimoMensaje && (
            <p className="text-xs text-text-secondary">
              {conversaciones.grupal.ultimoMensaje.autorNombre}:{" "}
              {conversaciones.grupal.ultimoMensaje.texto}
            </p>
          )}
        </div>
        {conversaciones.grupal.noLeidos > 0 && (
          <span className="rounded-full bg-fill-primary px-2 py-0.5 text-xs text-on-primary">
            {conversaciones.grupal.noLeidos}
          </span>
        )}
      </Link>

      {conversaciones.individuales.map((c) => (
        <Link key={c.sala} href={`/chat/${c.sala}`} className="card flex items-center justify-between p-4">
          <div>
            <p className="text-sm font-semibold text-text-primary">{c.otroNombre}</p>
            {c.ultimoMensaje && (
              <p className="text-xs text-text-secondary">{c.ultimoMensaje.texto}</p>
            )}
          </div>
          {c.noLeidos > 0 && (
            <span className="rounded-full bg-fill-primary px-2 py-0.5 text-xs text-on-primary">
              {c.noLeidos}
            </span>
          )}
        </Link>
      ))}

      {!mostrarNuevo ? (
        <button type="button" onClick={abrirNuevo} className="btn-hero rounded-app px-4 py-2 text-sm">
          Nuevo chat
        </button>
      ) : (
        <div className="card flex flex-col gap-2 p-4">
          <p className="text-sm font-semibold text-text-primary">Elige con quién chatear</p>
          {miembros.map((m) => (
            <Link
              key={m.id}
              href={`/chat/${salaIndividual(sesion!.id!, m.id)}`}
              className="text-sm text-text-secondary underline"
            >
              {m.nombre}
            </Link>
          ))}
          <button
            type="button"
            onClick={() => setMostrarNuevo(false)}
            className="text-xs text-text-secondary underline"
          >
            Cancelar
          </button>
        </div>
      )}
    </div>
  );
}
