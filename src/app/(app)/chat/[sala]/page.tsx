"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  IconArrowBackUp,
  IconArrowForwardUp,
  IconCheck,
  IconChevronLeft,
  IconCloud,
  IconCopy,
  IconDots,
  IconMoodSmile,
  IconPaperclip,
  IconUser,
  IconX,
} from "@tabler/icons-react";
import { useSession } from "@/context/SessionContext";
import { apiGet, apiUpload, ApiError } from "@/lib/api";
import { obtenerSocket } from "@/lib/socket";
import { tiempoTranscurrido } from "@/lib/tiempo";
import type { PuntoGps } from "@/lib/geo";
import {
  estadoDeMiembro,
  type Conversaciones,
  type EstadoMiembro,
  type EventoPresencia,
  type MensajeChat,
} from "@/lib/chat";
import { useConversacion } from "@/hooks/useConversacion";
import { BurbujaMensaje } from "@/components/Chat/BurbujaMensaje";
import { SelectorReenviarMensaje } from "@/components/Chat/SelectorReenviarMensaje";
import { SelectorEmojiMensaje } from "@/components/Chat/SelectorEmojiMensaje";
import { SelectorUbicacionChat } from "@/components/Chat/SelectorUbicacionChat";
import { SelectorRutaMensaje } from "@/components/Chat/SelectorRutaMensaje";
import { PopoverClima } from "@/components/Chat/PopoverClima";
import { Avatar } from "@/components/Avatar";

const MS_PAUSA_ESCRIBIENDO = 2000;
const IMAGEN_CHAT_GRUPAL = "/avatar-chat-grupal.png";

interface OtroParticipante {
  id: number;
  nombre: string;
  fotoUrl: string | null;
}

function lineaEstado(estado: EstadoMiembro | null): string | null {
  if (!estado) return null;
  if (estado.patinando === "patinando") return "Patinando ahora";
  if (estado.patinando === "ruta") return "En ruta";
  if (estado.enLinea) return "En línea";
  if (estado.ultimaConexion) return `Últ. conexión ${tiempoTranscurrido(estado.ultimaConexion)}`;
  return null;
}

export default function ConversacionPage() {
  const params = useParams<{ sala: string }>();
  const sala = params.sala;
  const { sesion } = useSession();
  const token = sesion?.token ?? null;
  const propioId = sesion?.id ?? null;
  const esAdmin = sesion?.rol === "admin";

  const [titulo, setTitulo] = useState("Chat");
  const [otro, setOtro] = useState<OtroParticipante | null>(null);
  const [estado, setEstado] = useState<EstadoMiembro | null>(null);
  const [texto, setTexto] = useState("");
  const [mensajeMenu, setMensajeMenu] = useState<MensajeChat | null>(null);
  const [menuRect, setMenuRect] = useState<DOMRect | null>(null);
  const [posicionMenu, setPosicionMenu] = useState<{ left: number; barTop: number; subTop: number } | null>(
    null,
  );
  const [mostrarMasOpciones, setMostrarMasOpciones] = useState(false);
  const [mensajeAReenviar, setMensajeAReenviar] = useState<MensajeChat | null>(null);
  const [mensajeAReaccionar, setMensajeAReaccionar] = useState<MensajeChat | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [mostrarAdjuntos, setMostrarAdjuntos] = useState(false);
  const [mostrarClima, setMostrarClima] = useState(false);
  const [mostrarUbicacion, setMostrarUbicacion] = useState(false);
  const [mostrarRuta, setMostrarRuta] = useState(false);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const [errorAdjunto, setErrorAdjunto] = useState("");
  const raizRef = useRef<HTMLDivElement>(null);
  const contenedorRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const cantidadAnteriorRef = useRef(0);
  const propioEscribiendoRef = useRef(false);
  const pausaEscribiendoRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputFotoRef = useRef<HTMLInputElement>(null);

  const {
    mensajes,
    error,
    enviando,
    escribiendo,
    respondiendoA,
    setRespondiendoA,
    enviar,
    eliminar,
    reaccionar,
    reenviar,
    notificarEscribiendo,
    estadoEnvio,
  } = useConversacion({ sala, token, propioId });

  async function cargarTitulo() {
    if (!token) return;
    if (sala === "grupal") {
      setTitulo("Chat grupal");
      setOtro(null);
      return;
    }
    try {
      const conv = await apiGet<Conversaciones>("/chat/conversaciones", token);
      const encontrada = conv.individuales.find((c) => c.sala === sala);
      if (encontrada) {
        setTitulo(encontrada.otroNombre);
        setOtro({
          id: encontrada.otroMiembroId,
          nombre: encontrada.otroNombre,
          fotoUrl: encontrada.otroFotoUrl,
        });
      }
    } catch {
      // ignorar
    }
  }

  useEffect(() => {
    cantidadAnteriorRef.current = 0;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargarTitulo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, sala]);

  useEffect(() => {
    if (!token || !otro) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEstado(null);
      return;
    }
    let cancelado = false;
    estadoDeMiembro(otro.id, token).then((datos) => {
      if (!cancelado) setEstado(datos);
    });
    const socket = obtenerSocket(token);
    function onPresencia(ev: EventoPresencia) {
      if (!otro || ev.miembroId !== otro.id) return;
      setEstado((prev) => ({
        patinando: prev?.patinando ?? null,
        enLinea: ev.enLinea,
        ultimaConexion: ev.ultimaConexion ?? prev?.ultimaConexion ?? null,
      }));
    }
    socket.on("chat:presencia", onPresencia);
    return () => {
      cancelado = true;
      socket.off("chat:presencia", onPresencia);
    };
  }, [token, otro]);

  // El contenedor "card" de los mensajes no tiene overflow propio en la
  // práctica (crece para mostrar todo su contenido): el que realmente hace
  // scroll es el wrapper de SwipeNavigator, un ancestro fuera de esta
  // pantalla. `scrollIntoView` en el formulario de envío (el último elemento
  // de la página) resuelve esto sin tener que asumir cuál ancestro scrollea.
  function scrollAlFondo() {
    formRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }

  // Solo baja cuando llegaron mensajes nuevos de verdad.
  useEffect(() => {
    if (mensajes.length > cantidadAnteriorRef.current) {
      scrollAlFondo();
    }
    cantidadAnteriorRef.current = mensajes.length;
  }, [mensajes]);

  // Si el mensaje citado quedó arriba, fuera de vista, "Responder" (desde el
  // menú flotante o desde el swipe) debe bajar el chat hasta el compositor
  // para que la barra de cita quede visible sin scroll manual.
  useEffect(() => {
    if (respondiendoA) scrollAlFondo();
  }, [respondiendoA]);

  // Posiciona la barra flotante de acciones pegada al mensaje presionado, en
  // vez de la hoja inferior anterior que oscurecía toda la conversación. Se
  // ancla contra `raizRef` (no contra el viewport ni con `position: fixed`)
  // para no toparse con la trampa de "transform:translateX(0) también crea
  // containing block" que ya causó un bug real en el visor de ubicación.
  useLayoutEffect(() => {
    if (!mensajeMenu || !menuRect || !raizRef.current) {
      setPosicionMenu(null);
      return;
    }
    const raiz = raizRef.current.getBoundingClientRect();
    const ANCHO_BARRA = 224;
    const ALTO_BARRA = 44;
    const ALTO_SUB = 96;
    const GAP = 8;
    let left = menuRect.left + menuRect.width / 2 - raiz.left - ANCHO_BARRA / 2;
    left = Math.max(8, Math.min(left, raiz.width - ANCHO_BARRA - 8));
    const espacioArriba = menuRect.top - raiz.top;
    const arriba = espacioArriba > ALTO_BARRA + ALTO_SUB + GAP * 2 + 20;
    const barTop = arriba ? espacioArriba - ALTO_BARRA - GAP : menuRect.bottom - raiz.top + GAP;
    const subTop = arriba ? barTop - ALTO_SUB - GAP : barTop + ALTO_BARRA + GAP;
    setPosicionMenu({ left, barTop, subTop });
  }, [mensajeMenu, menuRect]);

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

  async function onElegirFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    if (inputFotoRef.current) inputFotoRef.current.value = "";
    if (!archivo || !token) return;
    setMostrarAdjuntos(false);
    setSubiendoFoto(true);
    setErrorAdjunto("");
    try {
      const subida = await apiUpload<{ url: string }>("/uploads", archivo, token, archivo.name);
      await enviar({ adjuntoTipo: "foto", adjuntoUrl: subida.url });
    } catch (err) {
      setErrorAdjunto(err instanceof ApiError ? err.message : "No se pudo subir la foto.");
    } finally {
      setSubiendoFoto(false);
    }
  }

  async function onElegirUbicacion(datos: { lat: number; lon: number; nombre: string }) {
    setMostrarUbicacion(false);
    await enviar({
      adjuntoTipo: "ubicacion",
      adjuntoUbicacionNombre: datos.nombre,
      adjuntoUbicacionLat: datos.lat,
      adjuntoUbicacionLon: datos.lon,
    });
  }

  async function onElegirRuta(recorrido: { distanciaKm: number; duracionSeg: number; puntos: PuntoGps[] }) {
    setMostrarRuta(false);
    await enviar({
      adjuntoTipo: "ruta",
      adjuntoRutaDistanciaKm: recorrido.distanciaKm,
      adjuntoRutaDuracionSeg: recorrido.duracionSeg,
      adjuntoRutaPuntos: JSON.stringify(recorrido.puntos),
    });
  }

  function abrirMenuMensaje(mensaje: MensajeChat, rect: DOMRect) {
    setMensajeMenu(mensaje);
    setMenuRect(rect);
    setMostrarMasOpciones(false);
  }

  function cerrarMenuMensaje() {
    setMensajeMenu(null);
    setMenuRect(null);
    setMostrarMasOpciones(false);
  }

  async function copiarTexto() {
    if (!mensajeMenu) return;
    try {
      await navigator.clipboard.writeText(mensajeMenu.texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {
      // silencioso: si el navegador bloquea el portapapeles no hay mucho más que hacer
    }
    cerrarMenuMensaje();
  }

  async function eliminarMensaje(modo: "todos" | "mi") {
    if (!mensajeMenu) return;
    await eliminar(mensajeMenu.id, modo);
    cerrarMenuMensaje();
  }

  const estadoTexto = escribiendo ? `${escribiendo.nombre} está escribiendo...` : lineaEstado(estado);
  const puedeEliminarParaTodos = mensajeMenu && (mensajeMenu.autorId === propioId || esAdmin);

  return (
    <div ref={raizRef} className="relative flex h-full flex-col gap-3">
      <div className="card -mx-4 flex items-center gap-2 px-3 py-2.5">
        <Link href="/chat" aria-label="Volver" className="shrink-0 text-text-secondary">
          <IconChevronLeft size={20} />
        </Link>
        {otro ? (
          <Avatar fotoUrl={otro.fotoUrl} nombre={otro.nombre} tamano={36}>
            {estado?.enLinea && (
              <span className="absolute bottom-0 right-0 h-2 w-2 rounded-full border-2 border-surface-1 bg-fill-success" />
            )}
          </Avatar>
        ) : (
          sala === "grupal" && <Avatar fotoUrl={IMAGEN_CHAT_GRUPAL} nombre="Legión" tamano={36} />
        )}
        <div className="min-w-0 flex-1">
          <h1 className="text-sm font-semibold text-text-accent">{titulo}</h1>
          {estadoTexto && <p className="truncate text-xs text-text-muted">{estadoTexto}</p>}
        </div>
        {otro && (
          <Link href={`/perfil/${otro.id}`} aria-label="Ver perfil" className="shrink-0 text-text-secondary">
            <IconUser size={20} />
          </Link>
        )}
      </div>

      {error && <p className="text-xs text-fill-warning">{error}</p>}

      <div
        ref={contenedorRef}
        className="card -mx-4 flex flex-1 flex-col gap-2 overflow-y-auto px-3 py-4"
        style={{ minHeight: 320 }}
      >
        {mensajes.length === 0 && (
          <p className="text-xs text-text-secondary">Todavía no hay mensajes.</p>
        )}
        {mensajes.map((m) => (
          <BurbujaMensaje
            key={m.id}
            mensaje={m}
            esMio={m.autorId === propioId}
            estadoEnvio={estadoEnvio(m)}
            propioId={propioId}
            onResponder={setRespondiendoA}
            onAbrirMenu={abrirMenuMensaje}
            onReaccionar={(mensaje, emoji) => reaccionar(mensaje.id, emoji)}
          />
        ))}
      </div>

      {respondiendoA && (
        <div className="flex items-center gap-2 rounded-app border border-border bg-surface-2 px-3 py-1.5">
          <div className="min-w-0 flex-1 border-l-2 border-text-accent pl-2">
            <p className="text-xs font-semibold text-text-accent">{respondiendoA.autorNombre}</p>
            <p className="truncate text-xs text-text-secondary">{respondiendoA.texto}</p>
          </div>
          <button
            type="button"
            onClick={() => setRespondiendoA(null)}
            aria-label="Cancelar respuesta"
            className="shrink-0 text-text-secondary"
          >
            <IconX size={16} />
          </button>
        </div>
      )}

      {errorAdjunto && <p className="text-xs text-fill-warning">{errorAdjunto}</p>}

      <form ref={formRef} onSubmit={onEnviar} className="flex gap-2">
        <input ref={inputFotoRef} type="file" accept="image/*" onChange={onElegirFoto} className="hidden" />
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setMostrarClima((v) => !v)}
            aria-label="Ver el clima"
            className="rounded-app border border-border px-3 py-2 text-text-secondary"
          >
            <IconCloud size={18} />
          </button>
          {mostrarClima && <PopoverClima token={token} onCerrar={() => setMostrarClima(false)} />}
        </div>
        <button
          type="button"
          onClick={() => setMostrarAdjuntos(true)}
          disabled={subiendoFoto}
          aria-label="Adjuntar"
          className="shrink-0 rounded-app border border-border px-3 py-2 text-text-secondary disabled:opacity-60"
        >
          <IconPaperclip size={18} />
        </button>
        <input
          type="text"
          placeholder="Escribe un mensaje..."
          value={texto}
          onChange={(e) => onCambioTexto(e.target.value)}
          className="min-w-0 flex-1 rounded-app border border-border bg-surface-2 px-3 py-2 text-sm text-text-primary outline-none"
        />
        <button
          type="submit"
          disabled={enviando}
          className="btn-hero shrink-0 rounded-app px-4 py-2 text-sm disabled:opacity-60"
        >
          Enviar
        </button>
      </form>

      {mensajeMenu && posicionMenu && (
        // Barra flotante pegada al mensaje presionado, sin fondo oscuro de por
        // medio — el resto de la conversación queda visible y legible. Esta
        // capa transparente de tamaño completo solo sirve para detectar el
        // toque "afuera" y cerrar el menú (no oscurece nada).
        <div className="absolute inset-0 z-50" data-no-swipe onClick={cerrarMenuMensaje}>
          <div
            className="absolute flex items-center gap-0.5 rounded-full border border-border bg-surface-2 p-1.5 shadow-lg"
            style={{ left: posicionMenu.left, top: posicionMenu.barTop, width: 224 }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => {
                setRespondiendoA(mensajeMenu);
                cerrarMenuMensaje();
              }}
              aria-label="Responder"
              className="flex flex-1 items-center justify-center rounded-full py-2 text-text-primary active:bg-white/10"
            >
              <IconArrowBackUp size={18} />
            </button>
            <button
              type="button"
              onClick={() => {
                setMensajeAReenviar(mensajeMenu);
                cerrarMenuMensaje();
              }}
              aria-label="Reenviar"
              className="flex flex-1 items-center justify-center rounded-full py-2 text-text-primary active:bg-white/10"
            >
              <IconArrowForwardUp size={18} />
            </button>
            <button
              type="button"
              onClick={copiarTexto}
              aria-label="Copiar"
              className="flex flex-1 items-center justify-center rounded-full py-2 text-text-primary active:bg-white/10"
            >
              {copiado ? <IconCheck size={18} /> : <IconCopy size={18} />}
            </button>
            <button
              type="button"
              onClick={() => {
                setMensajeAReaccionar(mensajeMenu);
                cerrarMenuMensaje();
              }}
              aria-label="Reaccionar"
              className="flex flex-1 items-center justify-center rounded-full py-2 text-text-primary active:bg-white/10"
            >
              <IconMoodSmile size={18} />
            </button>
            <button
              type="button"
              onClick={() => setMostrarMasOpciones((v) => !v)}
              aria-label="Más opciones"
              className="flex flex-1 items-center justify-center rounded-full py-2 text-text-secondary active:bg-white/10"
            >
              <IconDots size={18} />
            </button>
          </div>
          {mostrarMasOpciones && (
            <div
              className="absolute flex min-w-[180px] flex-col gap-0.5 rounded-app border border-border bg-surface-2 p-1.5 shadow-lg"
              style={{ left: posicionMenu.left, top: posicionMenu.subTop }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => eliminarMensaje("mi")}
                className="rounded-app px-3 py-2 text-left text-sm text-fill-warning active:bg-white/5"
              >
                Eliminar para mí
              </button>
              {puedeEliminarParaTodos && (
                <button
                  type="button"
                  onClick={() => eliminarMensaje("todos")}
                  className="rounded-app px-3 py-2 text-left text-sm text-fill-warning active:bg-white/5"
                >
                  Eliminar para todos
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {mensajeAReenviar && (
        <SelectorReenviarMensaje
          propioId={propioId}
          token={token}
          onReenviar={(destinatarioIds) => reenviar(mensajeAReenviar.id, destinatarioIds)}
          onCerrar={() => setMensajeAReenviar(null)}
        />
      )}

      {mensajeAReaccionar && (
        <SelectorEmojiMensaje
          onElegir={(emoji) => {
            reaccionar(mensajeAReaccionar.id, emoji);
            setMensajeAReaccionar(null);
          }}
          onCerrar={() => setMensajeAReaccionar(null)}
        />
      )}

      {mostrarAdjuntos && (
        <div className="fixed inset-0 z-50" data-no-swipe>
          <div className="absolute inset-0 bg-black/75" onClick={() => setMostrarAdjuntos(false)} aria-hidden />
          <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1 rounded-t-2xl bg-surface-2 p-2 pb-4">
            <div className="flex justify-center pb-1 pt-1">
              <span className="h-1 w-10 rounded-full bg-white/20" />
            </div>
            <button
              type="button"
              onClick={() => {
                setMostrarAdjuntos(false);
                inputFotoRef.current?.click();
              }}
              className="rounded-app px-3 py-2.5 text-left text-sm text-text-primary active:bg-white/5"
            >
              Foto
            </button>
            <button
              type="button"
              onClick={() => {
                setMostrarAdjuntos(false);
                setMostrarUbicacion(true);
              }}
              className="rounded-app px-3 py-2.5 text-left text-sm text-text-primary active:bg-white/5"
            >
              Ubicación
            </button>
            <button
              type="button"
              onClick={() => {
                setMostrarAdjuntos(false);
                setMostrarRuta(true);
              }}
              className="rounded-app px-3 py-2.5 text-left text-sm text-text-primary active:bg-white/5"
            >
              Ruta registrada
            </button>
            <button
              type="button"
              onClick={() => setMostrarAdjuntos(false)}
              className="rounded-app px-3 py-2.5 text-left text-sm text-text-secondary active:bg-white/5"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {mostrarUbicacion && (
        <SelectorUbicacionChat
          propioId={propioId}
          token={token}
          onConfirmar={onElegirUbicacion}
          onCerrar={() => setMostrarUbicacion(false)}
        />
      )}

      {mostrarRuta && (
        <SelectorRutaMensaje
          token={token}
          onElegir={onElegirRuta}
          onCerrar={() => setMostrarRuta(false)}
        />
      )}
    </div>
  );
}
