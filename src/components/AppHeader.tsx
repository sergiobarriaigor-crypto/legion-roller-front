"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconBell, IconMessageCircle2 } from "@tabler/icons-react";
import { useSession } from "@/context/SessionContext";
import { apiGet } from "@/lib/api";
import type { Conversaciones } from "@/lib/chat";
import {
  listarHistorias,
  responderMencionHistoria,
  listarRespuestasSinLeer,
  marcarRespuestaLeida,
  type Historia,
  type RespuestaSinLeer,
} from "@/lib/historias";
import { tiempoTranscurrido } from "@/lib/tiempo";
import { SosButton } from "@/components/SosButton";
import { PopupMencion } from "@/components/Historias/PopupMencion";
import { Avatar } from "@/components/Avatar";

export function AppHeader() {
  const { sesion } = useSession();
  const router = useRouter();
  const token = sesion?.token ?? null;
  const [noLeidos, setNoLeidos] = useState(0);
  const [mencionesPendientes, setMencionesPendientes] = useState<Historia[]>([]);
  const [respuestasSinLeer, setRespuestasSinLeer] = useState<RespuestaSinLeer[]>([]);
  const [mostrarLista, setMostrarLista] = useState(false);
  const [mencionAbierta, setMencionAbierta] = useState<Historia | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!token || sesion?.rol === "visitante") return;

    async function revisar() {
      try {
        const conv = await apiGet<Conversaciones>("/chat/conversaciones", token);
        const total =
          conv.grupal.noLeidos + conv.individuales.reduce((s, c) => s + c.noLeidos, 0);
        setNoLeidos(total);
      } catch {
        // silencioso
      }
    }

    revisar();
    const intervalo = setInterval(revisar, 15000);
    return () => clearInterval(intervalo);
  }, [token, sesion?.rol]);

  // Menciones pendientes de respuesta (aceptar/rechazar republicar): se
  // muestran en la campana, no dentro de la historia misma.
  useEffect(() => {
    if (!token || sesion?.rol === "visitante" || !sesion?.id) return;

    async function revisarMenciones() {
      try {
        const grupos = await listarHistorias(token);
        const pendientes = grupos
          .flatMap((g) => g.historias)
          .filter((h) => h.menciones.some((m) => m.miembroId === sesion?.id && m.aceptada === null));
        setMencionesPendientes([...new Map(pendientes.map((h) => [h.id, h])).values()]);
      } catch {
        // silencioso
      }
    }

    revisarMenciones();
    const intervalo = setInterval(revisarMenciones, 20000);
    return () => clearInterval(intervalo);
  }, [token, sesion?.rol, sesion?.id]);

  // Respuestas a mis comentarios en Historias que todavía no vi.
  useEffect(() => {
    if (!token || sesion?.rol === "visitante") return;

    async function revisarRespuestas() {
      try {
        setRespuestasSinLeer(await listarRespuestasSinLeer(token));
      } catch {
        // silencioso
      }
    }

    revisarRespuestas();
    const intervalo = setInterval(revisarRespuestas, 20000);
    return () => clearInterval(intervalo);
  }, [token, sesion?.rol]);

  // Al tocar la notificación: se marca leída y se abre directo la historia
  // (BarraHistorias.tsx lee estos parámetros y muestra el panel de
  // comentarios con el hilo, resaltando esta respuesta).
  function irARespuesta(r: RespuestaSinLeer) {
    setMostrarLista(false);
    setRespuestasSinLeer((prev) => prev.filter((x) => x.id !== r.id));
    if (token) marcarRespuestaLeida(r.id, token).catch(() => {});
    router.push(`/post?historia=${r.historiaId}&comentario=${r.id}`);
  }

  async function responderMencion(aceptar: boolean) {
    if (!mencionAbierta || !token) return;
    setEnviando(true);
    try {
      await responderMencionHistoria(mencionAbierta.id, aceptar, token);
      setMencionesPendientes((prev) => prev.filter((h) => h.id !== mencionAbierta.id));
      setMencionAbierta(null);
    } catch {
      // se deja abierto para reintentar
    } finally {
      setEnviando(false);
    }
  }

  return (
    <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-page-bg">
      <SosButton />

      <div className="flex items-center gap-2">
        <span className="text-lg font-bold tracking-wide text-text-accent">
          LEGIÓN
        </span>
        <span className="text-lg font-bold tracking-wide text-text-primary">
          ROLLER
        </span>
      </div>

      <div className="relative flex items-center gap-3">
        <Link
          href="/chat"
          aria-label="Chat"
          className="relative flex h-9 w-9 items-center justify-center rounded-full text-text-secondary hover:text-text-primary"
        >
          <IconMessageCircle2 size={20} />
          {noLeidos > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-fill-primary px-1 text-[10px] text-on-primary">
              {noLeidos}
            </span>
          )}
        </Link>
        <button
          type="button"
          onClick={() => setMostrarLista((v) => !v)}
          aria-label="Notificaciones"
          className="relative flex h-9 w-9 items-center justify-center rounded-full text-text-secondary hover:text-text-primary"
        >
          <IconBell size={20} />
          {mencionesPendientes.length + respuestasSinLeer.length > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-fill-primary px-1 text-[10px] text-on-primary">
              {mencionesPendientes.length + respuestasSinLeer.length}
            </span>
          )}
        </button>

        {mostrarLista && (
          <>
            <div className="fixed inset-0 z-20" onClick={() => setMostrarLista(false)} />
            <div className="card absolute right-0 top-11 z-30 w-72 p-2">
              {mencionesPendientes.length === 0 && respuestasSinLeer.length === 0 ? (
                <p className="px-2 py-3 text-center text-sm text-text-secondary">
                  Sin notificaciones nuevas.
                </p>
              ) : (
                <>
                  {mencionesPendientes.map((h) => (
                    <button
                      key={`mencion-${h.id}`}
                      type="button"
                      onClick={() => {
                        setMencionAbierta(h);
                        setMostrarLista(false);
                      }}
                      className="block w-full rounded-app px-2 py-2 text-left text-sm text-text-primary hover:bg-bg-accent"
                    >
                      <strong>{h.autorNombre}</strong> te ha mencionado en una historia
                    </button>
                  ))}
                  {respuestasSinLeer.map((r) => (
                    <button
                      key={`respuesta-${r.id}`}
                      type="button"
                      onClick={() => irARespuesta(r)}
                      className="flex w-full items-start gap-2 rounded-app px-2 py-2 text-left text-sm text-text-primary hover:bg-bg-accent"
                    >
                      <Avatar fotoUrl={r.autorFotoUrl} nombre={r.autorNombre} tamano={32} />
                      <span className="flex-1">
                        <strong>{r.autorNombre}</strong> respondió tu comentario: &ldquo;
                        {r.texto.length > 40 ? `${r.texto.slice(0, 40)}…` : r.texto}&rdquo;
                        <span className="block text-[11px] text-text-secondary">
                          {tiempoTranscurrido(r.createdAt)}
                        </span>
                      </span>
                    </button>
                  ))}
                </>
              )}
            </div>
          </>
        )}
      </div>

      {mencionAbierta && (
        <PopupMencion
          historia={mencionAbierta}
          enviando={enviando}
          onResponder={responderMencion}
          onCerrar={() => setMencionAbierta(null)}
        />
      )}
    </header>
  );
}
