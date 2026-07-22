"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconBell, IconBellPlus, IconMessageCircle2 } from "@tabler/icons-react";
import { useSession } from "@/context/SessionContext";
import { apiGet } from "@/lib/api";
import { listarCompartidosSinLeer, type Conversaciones, type CompartidoSinLeer } from "@/lib/chat";
import {
  listarHistorias,
  responderMencionHistoria,
  listarRespuestasSinLeer,
  marcarRespuestaLeida,
  listarReaccionesAgrupadasSinLeer,
  type Historia,
  type RespuestaSinLeer,
  type ReaccionAgrupadaSinLeer,
} from "@/lib/historias";
import {
  listarRespuestasSinLeerPost,
  marcarRespuestaLeidaPost,
  listarReaccionesAgrupadasSinLeerPost,
  type RespuestaPostSinLeer,
  type ReaccionPostAgrupadaSinLeer,
} from "@/lib/posts";
import {
  listarRespuestasSinLeerImpulsa,
  marcarRespuestaLeidaImpulsa,
  type RespuestaEmprendedorSinLeer,
} from "@/lib/emprendedores";
import { tiempoTranscurrido } from "@/lib/tiempo";
import { pushDisponible, estaSuscrito, suscribirPush } from "@/lib/push";
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
  const [reaccionesAgrupadas, setReaccionesAgrupadas] = useState<ReaccionAgrupadaSinLeer[]>([]);
  const [respuestasSinLeerPost, setRespuestasSinLeerPost] = useState<RespuestaPostSinLeer[]>([]);
  const [reaccionesAgrupadasPost, setReaccionesAgrupadasPost] = useState<ReaccionPostAgrupadaSinLeer[]>([]);
  const [respuestasSinLeerImpulsa, setRespuestasSinLeerImpulsa] = useState<RespuestaEmprendedorSinLeer[]>([]);
  const [compartidosSinLeer, setCompartidosSinLeer] = useState<CompartidoSinLeer[]>([]);
  const [mostrarLista, setMostrarLista] = useState(false);
  const [mencionAbierta, setMencionAbierta] = useState<Historia | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [pushActivo, setPushActivo] = useState(true);
  const [activandoPush, setActivandoPush] = useState(false);

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

  useEffect(() => {
    if (!token || sesion?.rol === "visitante" || !pushDisponible()) return;
    estaSuscrito().then(setPushActivo);
  }, [token, sesion?.rol]);

  async function activarNotificaciones() {
    if (!token || activandoPush) return;
    setActivandoPush(true);
    try {
      const ok = await suscribirPush(token);
      if (ok) setPushActivo(true);
    } catch {
      // el usuario puede reintentar tocando el botón de nuevo
    } finally {
      setActivandoPush(false);
    }
  }

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

  // Reacciones (corazón) sin leer en mis historias, agrupadas por historia.
  useEffect(() => {
    if (!token || sesion?.rol === "visitante") return;

    async function revisarReacciones() {
      try {
        setReaccionesAgrupadas(await listarReaccionesAgrupadasSinLeer(token));
      } catch {
        // silencioso
      }
    }

    revisarReacciones();
    const intervalo = setInterval(revisarReacciones, 20000);
    return () => clearInterval(intervalo);
  }, [token, sesion?.rol]);

  // Respuestas a mis comentarios en Posts que todavía no vi.
  useEffect(() => {
    if (!token || sesion?.rol === "visitante") return;

    async function revisarRespuestasPost() {
      try {
        setRespuestasSinLeerPost(await listarRespuestasSinLeerPost(token));
      } catch {
        // silencioso
      }
    }

    revisarRespuestasPost();
    const intervalo = setInterval(revisarRespuestasPost, 20000);
    return () => clearInterval(intervalo);
  }, [token, sesion?.rol]);

  // "Me gusta" sin leer en mis posts, agrupados por post.
  useEffect(() => {
    if (!token || sesion?.rol === "visitante") return;

    async function revisarReaccionesPost() {
      try {
        setReaccionesAgrupadasPost(await listarReaccionesAgrupadasSinLeerPost(token));
      } catch {
        // silencioso
      }
    }

    revisarReaccionesPost();
    const intervalo = setInterval(revisarReaccionesPost, 20000);
    return () => clearInterval(intervalo);
  }, [token, sesion?.rol]);

  // Respuestas a mis reseñas en Impulsa que todavía no vi.
  useEffect(() => {
    if (!token || sesion?.rol === "visitante") return;

    async function revisarRespuestasImpulsa() {
      try {
        setRespuestasSinLeerImpulsa(await listarRespuestasSinLeerImpulsa(token));
      } catch {
        // silencioso
      }
    }

    revisarRespuestasImpulsa();
    const intervalo = setInterval(revisarRespuestasImpulsa, 20000);
    return () => clearInterval(intervalo);
  }, [token, sesion?.rol]);

  // Posts que me compartieron por chat y todavía no vi.
  useEffect(() => {
    if (!token || sesion?.rol === "visitante") return;

    async function revisarCompartidos() {
      try {
        setCompartidosSinLeer(await listarCompartidosSinLeer(token));
      } catch {
        // silencioso
      }
    }

    revisarCompartidos();
    const intervalo = setInterval(revisarCompartidos, 20000);
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

  // Al tocar: se abre directo la pestaña de reacciones de esa historia — con
  // eso ya alcanza para marcarlas leídas (mismo mecanismo que el puntito
  // liviano del avatar, ver `reaccionesDe()` en el backend), sin necesitar un
  // endpoint aparte de "marcar leída".
  function irAReaccionAgrupada(r: ReaccionAgrupadaSinLeer) {
    setMostrarLista(false);
    setReaccionesAgrupadas((prev) => prev.filter((x) => x.historiaId !== r.historiaId));
    router.push(`/post?historia=${r.historiaId}&reacciones=1`);
  }

  // Texto adaptado al estilo Legión, calcado de los ejemplos pedidos: 1
  // nombre, 2 nombres, o los primeros 2 + "y otras N personas".
  function textoReaccionAgrupada(r: ReaccionAgrupadaSinLeer): string {
    const [n1, n2] = r.primeros.map((p) => p.nombre);
    if (r.total <= 1) return `${n1} indicó que le gusta tu historia`;
    if (r.total === 2) return `${n1} y ${n2} indicaron que les gusta tu historia`;
    return `${n1}, ${n2} y otras ${r.total - 2} personas reaccionaron a tu historia`;
  }

  // Mismo mecanismo que las notificaciones de Historias, apuntando a /post
  // con la publicación en vez de la historia (post/page.tsx interpreta estos
  // mismos parámetros).
  function irARespuestaPost(r: RespuestaPostSinLeer) {
    setMostrarLista(false);
    setRespuestasSinLeerPost((prev) => prev.filter((x) => x.id !== r.id));
    if (token) marcarRespuestaLeidaPost(r.id, token).catch(() => {});
    router.push(`/post?post=${r.postId}&comentario=${r.id}`);
  }

  function irAReaccionAgrupadaPost(r: ReaccionPostAgrupadaSinLeer) {
    setMostrarLista(false);
    setReaccionesAgrupadasPost((prev) => prev.filter((x) => x.postId !== r.postId));
    router.push(`/post?post=${r.postId}&reacciones=1`);
  }

  function textoReaccionAgrupadaPost(r: ReaccionPostAgrupadaSinLeer): string {
    const [n1, n2] = r.primeros.map((p) => p.nombre);
    if (r.total <= 1) return `${n1} indicó que le gusta tu publicación`;
    if (r.total === 2) return `${n1} y ${n2} indicaron que les gusta tu publicación`;
    return `${n1}, ${n2} y otras ${r.total - 2} personas reaccionaron a tu publicación`;
  }

  // Mismo mecanismo que las notificaciones de Post, apuntando a /impulsa con
  // la ficha en vez del post (impulsa/page.tsx interpreta estos parámetros).
  function irARespuestaImpulsa(r: RespuestaEmprendedorSinLeer) {
    setMostrarLista(false);
    setRespuestasSinLeerImpulsa((prev) => prev.filter((x) => x.id !== r.id));
    if (token) marcarRespuestaLeidaImpulsa(r.id, token).catch(() => {});
    router.push(`/impulsa?emprendedor=${r.emprendedorId}&resena=${r.id}`);
  }

  // Marcar leído no tiene endpoint propio: abrir la conversación (GET
  // /chat/mensajes/:sala) ya actualiza LecturaChat como efecto secundario —
  // se descarta el resultado, solo interesa navegar directo al post o ficha
  // según corresponda.
  function irACompartido(c: CompartidoSinLeer) {
    setMostrarLista(false);
    setCompartidosSinLeer((prev) => prev.filter((x) => x.mensajeId !== c.mensajeId));
    if (token) apiGet(`/chat/mensajes/${c.sala}`, token).catch(() => {});
    if (c.tipo === "emprendedor") {
      router.push(`/impulsa?emprendedor=${c.referenciaId}`);
    } else {
      router.push(`/post?post=${c.referenciaId}`);
    }
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

  const totalNotificaciones =
    mencionesPendientes.length +
    respuestasSinLeer.length +
    reaccionesAgrupadas.length +
    respuestasSinLeerPost.length +
    reaccionesAgrupadasPost.length +
    respuestasSinLeerImpulsa.length +
    compartidosSinLeer.length;

  // El visitante no participa (sin chat, sin notificaciones, sin SOS) — solo
  // mira. Se dejan espaciadores del mismo ancho para que el título quede
  // centrado igual que con los botones presentes.
  if (sesion?.rol === "visitante") {
    return (
      <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-page-bg">
        <div className="w-9" />
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold tracking-wide text-text-accent">LEGIÓN</span>
          <span className="text-lg font-bold tracking-wide text-text-primary">ROLLER</span>
        </div>
        <div className="w-9" />
      </header>
    );
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
        {!pushActivo && (
          <button
            type="button"
            onClick={activarNotificaciones}
            disabled={activandoPush}
            aria-label="Activar notificaciones"
            className="flex h-9 w-9 items-center justify-center rounded-full text-text-secondary hover:text-text-primary disabled:opacity-60"
          >
            <IconBellPlus size={20} />
          </button>
        )}
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
          {totalNotificaciones > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-fill-primary px-1 text-[10px] text-on-primary">
              {totalNotificaciones}
            </span>
          )}
        </button>

        {mostrarLista && (
          <>
            <div className="fixed inset-0 z-20" onClick={() => setMostrarLista(false)} />
            <div className="card absolute right-0 top-11 z-30 w-72 p-2">
              {totalNotificaciones === 0 ? (
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
                        <strong>{r.autorNombre}</strong>{" "}
                        {r.esRespuesta ? "respondió tu comentario" : "comentó tu historia"}: &ldquo;
                        {r.texto.length > 40 ? `${r.texto.slice(0, 40)}…` : r.texto}&rdquo;
                        <span className="block text-[11px] text-text-secondary">
                          {tiempoTranscurrido(r.createdAt)}
                        </span>
                      </span>
                    </button>
                  ))}
                  {/* Agrupadas por historia (no una fila por persona): los
                      primeros dos reactores siempre muestran su foto, en
                      avatares apilados con un corazón dorado de acento. */}
                  {reaccionesAgrupadas.map((r) => (
                    <button
                      key={`reaccion-${r.historiaId}`}
                      type="button"
                      onClick={() => irAReaccionAgrupada(r)}
                      className="flex w-full items-start gap-2 rounded-app px-2 py-2 text-left text-sm text-text-primary hover:bg-bg-accent"
                    >
                      <div className="relative h-8 w-11 shrink-0">
                        {r.primeros[1] && (
                          <div className="absolute left-3 top-0 rounded-full ring-2 ring-page-bg">
                            <Avatar fotoUrl={r.primeros[1].fotoUrl} nombre={r.primeros[1].nombre} tamano={32} />
                          </div>
                        )}
                        <div className="absolute left-0 top-0 rounded-full ring-2 ring-page-bg">
                          <Avatar fotoUrl={r.primeros[0].fotoUrl} nombre={r.primeros[0].nombre} tamano={32} />
                        </div>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src="/corazon2.png"
                          alt=""
                          className="absolute -bottom-1 -right-1 h-4 w-4 drop-shadow-[0_0_6px_rgba(231,193,104,0.8)]"
                        />
                      </div>
                      <span className="flex-1 pt-1">
                        {textoReaccionAgrupada(r)}
                        <span className="block text-[11px] text-text-secondary">
                          {tiempoTranscurrido(r.createdAt)}
                        </span>
                      </span>
                    </button>
                  ))}
                  {respuestasSinLeerPost.map((r) => (
                    <button
                      key={`respuesta-post-${r.id}`}
                      type="button"
                      onClick={() => irARespuestaPost(r)}
                      className="flex w-full items-start gap-2 rounded-app px-2 py-2 text-left text-sm text-text-primary hover:bg-bg-accent"
                    >
                      <Avatar fotoUrl={r.autorFotoUrl} nombre={r.autorNombre} tamano={32} />
                      <span className="flex-1">
                        <strong>{r.autorNombre}</strong>{" "}
                        {r.esRespuesta ? "respondió tu comentario" : "comentó tu publicación"}: &ldquo;
                        {r.texto.length > 40 ? `${r.texto.slice(0, 40)}…` : r.texto}&rdquo;
                        <span className="block text-[11px] text-text-secondary">
                          {tiempoTranscurrido(r.createdAt)}
                        </span>
                      </span>
                    </button>
                  ))}
                  {reaccionesAgrupadasPost.map((r) => (
                    <button
                      key={`reaccion-post-${r.postId}`}
                      type="button"
                      onClick={() => irAReaccionAgrupadaPost(r)}
                      className="flex w-full items-start gap-2 rounded-app px-2 py-2 text-left text-sm text-text-primary hover:bg-bg-accent"
                    >
                      <div className="relative h-8 w-11 shrink-0">
                        {r.primeros[1] && (
                          <div className="absolute left-3 top-0 rounded-full ring-2 ring-page-bg">
                            <Avatar fotoUrl={r.primeros[1].fotoUrl} nombre={r.primeros[1].nombre} tamano={32} />
                          </div>
                        )}
                        <div className="absolute left-0 top-0 rounded-full ring-2 ring-page-bg">
                          <Avatar fotoUrl={r.primeros[0].fotoUrl} nombre={r.primeros[0].nombre} tamano={32} />
                        </div>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src="/corazon2.png"
                          alt=""
                          className="absolute -bottom-1 -right-1 h-4 w-4 drop-shadow-[0_0_6px_rgba(231,193,104,0.8)]"
                        />
                      </div>
                      <span className="flex-1 pt-1">
                        {textoReaccionAgrupadaPost(r)}
                        <span className="block text-[11px] text-text-secondary">
                          {tiempoTranscurrido(r.createdAt)}
                        </span>
                      </span>
                    </button>
                  ))}
                  {respuestasSinLeerImpulsa.map((r) => (
                    <button
                      key={`respuesta-impulsa-${r.id}`}
                      type="button"
                      onClick={() => irARespuestaImpulsa(r)}
                      className="flex w-full items-start gap-2 rounded-app px-2 py-2 text-left text-sm text-text-primary hover:bg-bg-accent"
                    >
                      <Avatar fotoUrl={r.autorFotoUrl} nombre={r.autorNombre} tamano={32} />
                      <span className="flex-1">
                        <strong>{r.autorNombre}</strong>{" "}
                        {r.esRespuesta ? "respondió tu reseña" : "comentó tu ficha"}: &ldquo;
                        {r.texto.length > 40 ? `${r.texto.slice(0, 40)}…` : r.texto}&rdquo;
                        <span className="block text-[11px] text-text-secondary">
                          {tiempoTranscurrido(r.createdAt)}
                        </span>
                      </span>
                    </button>
                  ))}
                  {compartidosSinLeer.map((c) => (
                    <button
                      key={`compartido-${c.mensajeId}`}
                      type="button"
                      onClick={() => irACompartido(c)}
                      className="flex w-full items-start gap-2 rounded-app px-2 py-2 text-left text-sm text-text-primary hover:bg-bg-accent"
                    >
                      <Avatar fotoUrl={c.autorFotoUrl} nombre={c.autorNombre} tamano={32} />
                      <span className="flex-1">
                        <strong>{c.autorNombre}</strong>{" "}
                        {c.tipo === "emprendedor" ? "te compartió un emprendimiento" : "te compartió una publicación"}
                        <span className="block text-[11px] text-text-secondary">
                          {tiempoTranscurrido(c.createdAt)}
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
