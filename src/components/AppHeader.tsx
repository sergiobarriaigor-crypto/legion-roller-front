"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconBell, IconBellPlus, IconMessageCircle2, IconMapPin, IconCalendar } from "@tabler/icons-react";
import { useSession } from "@/context/SessionContext";
import { useEmergencias } from "@/context/EmergenciaContext";
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
import { proximaRodada, type RodadaProxima } from "@/lib/publicaciones";
import { misInvitacionesPendientes, ETIQUETA_CATEGORIA, type InvitacionPendiente } from "@/lib/calendario";
import { tiempoTranscurrido } from "@/lib/tiempo";
import { pushDisponible, estaSuscrito, suscribirPush } from "@/lib/push";
import { Capacitor } from "@capacitor/core";
import { estaSuscritoNativo, suscribirPushNativo } from "@/lib/pushNativo";
import { SosButton } from "@/components/SosButton";
import { PopupMencion } from "@/components/Historias/PopupMencion";
import { Avatar } from "@/components/Avatar";

export function AppHeader() {
  const { sesion } = useSession();
  const router = useRouter();
  const token = sesion?.token ?? null;
  const { refrescar: refrescarEmergencias } = useEmergencias();
  const [noLeidos, setNoLeidos] = useState(0);
  const [mencionesPendientes, setMencionesPendientes] = useState<Historia[]>([]);
  const [respuestasSinLeer, setRespuestasSinLeer] = useState<RespuestaSinLeer[]>([]);
  const [reaccionesAgrupadas, setReaccionesAgrupadas] = useState<ReaccionAgrupadaSinLeer[]>([]);
  const [respuestasSinLeerPost, setRespuestasSinLeerPost] = useState<RespuestaPostSinLeer[]>([]);
  const [reaccionesAgrupadasPost, setReaccionesAgrupadasPost] = useState<ReaccionPostAgrupadaSinLeer[]>([]);
  const [respuestasSinLeerImpulsa, setRespuestasSinLeerImpulsa] = useState<RespuestaEmprendedorSinLeer[]>([]);
  const [compartidosSinLeer, setCompartidosSinLeer] = useState<CompartidoSinLeer[]>([]);
  const [rodadaProxima, setRodadaProxima] = useState<RodadaProxima | null>(null);
  const [invitacionesActividad, setInvitacionesActividad] = useState<InvitacionPendiente[]>([]);
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

  const activarNotificaciones = useCallback(async () => {
    if (!token || activandoPush) return;
    setActivandoPush(true);
    try {
      const ok = Capacitor.isNativePlatform() ? await suscribirPushNativo(token) : await suscribirPush(token);
      if (ok) setPushActivo(true);
    } catch (e) {
      // el usuario puede reintentar tocando el botón de nuevo
      console.error("[push] activarNotificaciones fallo:", e);
    } finally {
      setActivandoPush(false);
    }
  }, [token, activandoPush]);

  // Recuerda para qué token nativo ya se intentó el registro automático en
  // esta apertura de la app (vive solo en memoria: se resetea solo con
  // cada arranque del proceso, a diferencia de un flag en localStorage que
  // sobrevive reinstalaciones y puede quedar mintiendo "ya lo intenté").
  // Sin esto, activarNotificaciones() cambia su propia referencia (useCallback
  // depende de activandoPush) y vuelve a disparar este efecto en bucle.
  const tokenNativoIntentadoRef = useRef<string | null>(null);

  useEffect(() => {
    if (!token || sesion?.rol === "visitante") return;

    // Se pide el permiso solo (sin esperar que el usuario toque la
    // campanita) la primera vez que se detecta sin activar en este
    // dispositivo -- igual criterio que el GPS, que tampoco requiere un
    // botón aparte para activarse. La campanita queda como respaldo manual
    // por si el usuario rechazó el permiso la primera vez (Android no deja
    // volver a pedirlo solo después de un rechazo).
    function intentarActivarUnaVez(activo: boolean) {
      setPushActivo(activo);
      if (activo) return;
      const clave = "legion-roller-push-auto-intentado";
      if (localStorage.getItem(clave)) return;
      localStorage.setItem(clave, "1");
      activarNotificaciones();
    }

    if (Capacitor.isNativePlatform()) {
      // A diferencia de la web, acá se reintenta SIEMPRE al abrir la app
      // (no solo la primera vez): el token FCM puede cambiar entre
      // reinstalaciones (p. ej. tras un rebuild en Android Studio) y el
      // dispositivo no tiene forma de saber que el token que ya tiene
      // guardado quedó desactualizado. register() es idempotente y el
      // backend hace upsert, así que repetirlo en cada apertura no tiene
      // costo real y evita quedar con push nativo roto en silencio.
      if (tokenNativoIntentadoRef.current === token) return;
      tokenNativoIntentadoRef.current = token;
      Promise.resolve(estaSuscritoNativo()).then((activo) => {
        setPushActivo(activo);
        activarNotificaciones();
      });
      return;
    }
    if (!pushDisponible()) return;
    estaSuscrito().then(intentarActivarUnaVez);
  }, [token, sesion?.rol, activarNotificaciones]);

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

  // Rodada con RSVP sí/tal vez que arranca en los próximos 30 minutos — a
  // diferencia del push del sistema (que se manda una sola vez), esto se
  // recalcula en cada consulta y desaparece solo cuando la rodada empieza.
  useEffect(() => {
    if (!token || sesion?.rol === "visitante") return;

    async function revisarRodadaProxima() {
      try {
        setRodadaProxima(await proximaRodada(token));
      } catch {
        // silencioso
      }
    }

    revisarRodadaProxima();
    const intervalo = setInterval(revisarRodadaProxima, 20000);
    return () => clearInterval(intervalo);
  }, [token, sesion?.rol]);

  // Invitaciones a patinadas libres/entrenamientos/reuniones que todavía no
  // respondiste — mismo criterio "en vivo" que rodadaProxima (desaparece
  // sola apenas aceptás o rechazás desde el calendario).
  useEffect(() => {
    if (!token || sesion?.rol === "visitante") return;

    async function revisarInvitaciones() {
      try {
        setInvitacionesActividad(await misInvitacionesPendientes(token));
      } catch {
        // silencioso
      }
    }

    revisarInvitaciones();
    const intervalo = setInterval(revisarInvitaciones, 20000);
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

  // Lleva al mapa centrado en el punto de encuentro real (el mapa ya dibuja
  // un marcador ahí para cualquier rodada activa/próxima — ver puntosPartida
  // en MapaView.tsx), no hace falta guardar "leído" en el backend: esto se
  // recalcula solo y desaparece cuando la rodada empieza.
  function irARodadaProxima() {
    if (!rodadaProxima) return;
    setMostrarLista(false);
    if (rodadaProxima.puntoLat !== null && rodadaProxima.puntoLon !== null) {
      // `t` cambia en cada toque (aunque sea la misma rodada, con el mismo
      // lat/lon de siempre) para que MapaView.tsx detecte que hay que volver
      // a centrar la cámara — si no, tocar el aviso una segunda vez no hacía
      // nada porque la URL quedaba idéntica a la anterior.
      router.push(
        `/mapa?lat=${rodadaProxima.puntoLat}&lon=${rodadaProxima.puntoLon}&t=${Date.now()}`,
      );
    } else {
      router.push("/mapa");
    }
  }

  // Lleva a Perfil con el calendario ya abierto (perfil/page.tsx interpreta
  // este mismo parámetro) — responder Aceptar/Rechazar se hace ahí mismo,
  // no hace falta duplicar esos botones acá en la campana.
  function irACalendario() {
    setMostrarLista(false);
    router.push("/perfil?calendario=1");
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
    (rodadaProxima ? 1 : 0) +
    invitacionesActividad.length +
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
      <SosButton onActivada={refrescarEmergencias} />

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
            <IconBellPlus size={24} />
          </button>
        )}
        <Link
          href="/chat"
          aria-label="Chat"
          className="relative flex h-9 w-9 items-center justify-center rounded-full text-text-secondary hover:text-text-primary"
        >
          <IconMessageCircle2 size={24} />
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
          <IconBell size={24} />
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
                  {rodadaProxima && (
                    <button
                      type="button"
                      onClick={irARodadaProxima}
                      className="flex w-full items-start gap-2 rounded-app px-2 py-2 text-left text-sm text-text-primary hover:bg-bg-accent"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-bg-accent text-text-accent">
                        <IconMapPin size={18} />
                      </span>
                      <span className="flex-1">
                        Tu rodada <strong>{rodadaProxima.titulo}</strong> empieza en{" "}
                        {rodadaProxima.minutosFaltan} min
                        <span className="block text-[11px] text-text-secondary">
                          Toca para ver el punto de encuentro en el mapa
                        </span>
                      </span>
                    </button>
                  )}
                  {invitacionesActividad.map((inv) => (
                    <button
                      key={`invitacion-${inv.id}`}
                      type="button"
                      onClick={irACalendario}
                      className="flex w-full items-start gap-2 rounded-app px-2 py-2 text-left text-sm text-text-primary hover:bg-bg-accent"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-bg-accent text-text-accent">
                        <IconCalendar size={18} />
                      </span>
                      <span className="flex-1">
                        {inv.creadorNombre} te invitó a <strong>{inv.titulo}</strong>
                        <span className="block text-[11px] text-text-secondary">
                          {ETIQUETA_CATEGORIA[inv.categoria]} · {inv.fecha}
                          {inv.hora ? ` · ${inv.hora}` : ""} · Toca para responder
                        </span>
                      </span>
                    </button>
                  ))}
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
