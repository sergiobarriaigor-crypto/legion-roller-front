"use client";

import { useRef, useState } from "react";
import dynamic from "next/dynamic";
import { IconArrowBackUp, IconCheck, IconChecks, IconMapPin, IconPin } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import type { EstadoEnvio } from "@/hooks/useConversacion";
import type { MensajeChat } from "@/lib/chat";
import { TarjetaRuta } from "@/components/Chat/TarjetaRuta";

const MiniMapaUbicacion = dynamic(
  () => import("@/components/Chat/MiniMapaUbicacion").then((m) => m.MiniMapaUbicacion),
  { ssr: false, loading: () => <div className="mb-1 h-32 rounded-app bg-black/20" /> },
);
const VisorUbicacionMensaje = dynamic(
  () => import("@/components/Chat/VisorUbicacionMensaje").then((m) => m.VisorUbicacionMensaje),
  { ssr: false },
);
const VisorFotoMensaje = dynamic(
  () => import("@/components/Chat/VisorFotoMensaje").then((m) => m.VisorFotoMensaje),
  { ssr: false },
);

const MS_LONG_PRESS = 500;
const PX_UMBRAL_SWIPE = 48;
const PX_UMBRAL_CANCELAR_LONG_PRESS = 10;
const PX_MAX_ARRASTRE = 60;

// Opción 2 elegida por el usuario entre 4 mockups: burbuja con "colita"
// clásica (esquina pegada al autor queda casi recta, el resto bien
// redondeado) — mismo criterio en los dos lugares donde se dibuja una
// burbuja (mensaje normal y la tarjeta de post/emprendedor compartido).
const RADIO_BURBUJA_MIA = "14px 4px 14px 14px";
const RADIO_BURBUJA_OTRO = "4px 14px 14px 14px";

// Burbuja de un mensaje del chat. `compacto` (usado por ChatFlotante) omite
// reacciones/respuesta citada/menú/swipe — ese modal no reemplaza aún la
// pantalla completa de chat, solo un envío rápido con lo esencial en vivo.
export function BurbujaMensaje({
  mensaje,
  esMio,
  estadoEnvio,
  compacto = false,
  propioId,
  onResponder,
  onAbrirMenu,
  onReaccionar,
}: {
  mensaje: MensajeChat;
  esMio: boolean;
  estadoEnvio: EstadoEnvio | null;
  compacto?: boolean;
  propioId?: number | null;
  onResponder?: (mensaje: MensajeChat) => void;
  onAbrirMenu?: (mensaje: MensajeChat, rect: DOMRect) => void;
  onReaccionar?: (mensaje: MensajeChat, emoji: string) => void;
}) {
  const router = useRouter();
  const [arrastreX, setArrastreX] = useState(0);
  const [mostrarVisorUbicacion, setMostrarVisorUbicacion] = useState(false);
  const [mostrarVisorFoto, setMostrarVisorFoto] = useState(false);
  const inicioXRef = useRef<number | null>(null);
  const timeoutLongPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const esSwipeRef = useRef(false);

  function limpiarLongPress() {
    if (timeoutLongPressRef.current) {
      clearTimeout(timeoutLongPressRef.current);
      timeoutLongPressRef.current = null;
    }
  }

  function onTouchStart(e: React.TouchEvent) {
    if (compacto) return;
    const el = e.currentTarget;
    inicioXRef.current = e.touches[0].clientX;
    esSwipeRef.current = false;
    timeoutLongPressRef.current = setTimeout(() => {
      timeoutLongPressRef.current = null;
      onAbrirMenu?.(mensaje, el.getBoundingClientRect());
    }, MS_LONG_PRESS);
  }

  function onTouchMove(e: React.TouchEvent) {
    if (compacto || inicioXRef.current === null) return;
    const delta = e.touches[0].clientX - inicioXRef.current;
    if (!esSwipeRef.current && Math.abs(delta) > PX_UMBRAL_CANCELAR_LONG_PRESS) {
      esSwipeRef.current = true;
      limpiarLongPress();
    }
    if (esSwipeRef.current && delta > 0) {
      setArrastreX(Math.min(delta, PX_MAX_ARRASTRE));
    }
  }

  function onTouchEnd() {
    if (compacto) return;
    limpiarLongPress();
    if (arrastreX >= PX_UMBRAL_SWIPE) onResponder?.(mensaje);
    setArrastreX(0);
    inicioXRef.current = null;
    esSwipeRef.current = false;
  }

  // Si el gesto se interrumpe (el navegador cancela la secuencia táctil, un
  // gesto del sistema la corta a mitad de camino, etc.) sin llegar a
  // `touchend`, `arrastreX` podía quedar atascado en un valor distinto de
  // cero — y como el transform de abajo solo se omite cuando `arrastreX` es
  // 0, la burbuja se quedaba siendo el containing block de cualquier overlay
  // `fixed` anidado (visor de ubicación o de foto) para siempre. Mismo
  // reseteo que `onTouchEnd`, sin disparar la respuesta.
  function onTouchCancel() {
    if (compacto) return;
    limpiarLongPress();
    setArrastreX(0);
    inicioXRef.current = null;
    esSwipeRef.current = false;
  }

  function onContextMenu(e: React.MouseEvent) {
    if (compacto || !onAbrirMenu) return;
    e.preventDefault();
    onAbrirMenu(mensaje, e.currentTarget.getBoundingClientRect());
  }

  // Post/emprendedor compartidos: burbuja-tarjeta clickeable (mismo criterio
  // que ya existía en chat/[sala]/page.tsx antes del rediseño). Sin swipe acá
  // (el click ya navega), pero sí menú (copiar/reenviar/eliminar también
  // tienen sentido sobre un mensaje compartido).
  if (
    (mensaje.referenciaTipo === "post" || mensaje.referenciaTipo === "emprendedor") &&
    mensaje.referenciaId !== null
  ) {
    const destino =
      mensaje.referenciaTipo === "emprendedor"
        ? `/impulsa?emprendedor=${mensaje.referenciaId}`
        : `/post?post=${mensaje.referenciaId}`;
    return (
      <div className={`flex flex-col ${esMio ? "items-end" : "items-start"}`}>
        <button
          type="button"
          onClick={() => router.push(destino)}
          onContextMenu={onContextMenu}
          style={{ borderRadius: esMio ? RADIO_BURBUJA_MIA : RADIO_BURBUJA_OTRO }}
          className={`flex max-w-[75%] items-center gap-2 px-3 py-2 text-left text-sm ${
            esMio ? "chat-burbuja-mia" : "bg-surface-2 text-text-primary"
          }`}
        >
          <IconPin size={16} className="shrink-0" />
          <span>
            {!esMio && (
              <span className="block text-xs font-semibold text-text-accent">
                {mensaje.autorNombre}
              </span>
            )}
            {mensaje.texto}
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className={`flex flex-col ${esMio ? "items-end" : "items-start"}`}>
      <div className="relative w-full max-w-[75%]" style={{ [esMio ? "marginLeft" : "marginRight"]: "auto" }}>
        {!compacto && arrastreX > 0 && (
          <IconArrowBackUp
            size={16}
            className="absolute left-[-24px] top-1/2 -translate-y-1/2 text-text-accent"
            style={{ opacity: Math.min(arrastreX / PX_UMBRAL_SWIPE, 1) }}
          />
        )}
        <div
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchCancel}
          onContextMenu={onContextMenu}
          // `translateX(0px)` sigue siendo un transform "distinto de none" para
          // efectos de CSS — incluso en reposo, convierte a este div en el
          // containing block de sus descendientes `position: fixed` (el visor
          // de ubicación de pantalla completa que se abre más abajo), atrapando
          // ese overlay dentro del pequeño rectángulo de la burbuja en vez de
          // cubrir la pantalla. Por eso solo se aplica el transform mientras
          // hay un arrastre real en curso.
          style={{
            borderRadius: esMio ? RADIO_BURBUJA_MIA : RADIO_BURBUJA_OTRO,
            ...(arrastreX ? { transform: `translateX(${arrastreX}px)` } : undefined),
          }}
          className={`px-3 py-2 text-sm ${esMio ? "chat-burbuja-mia" : "bg-surface-2 text-text-primary"}`}
        >
          {!esMio && <p className="text-xs font-semibold text-text-accent">{mensaje.autorNombre}</p>}

          {!compacto && mensaje.reenviado && (
            <p className="text-[10px] italic opacity-70">Reenviado</p>
          )}

          {!compacto && mensaje.respuestaA && (
            <div
              className={`mb-1 rounded-app border-l-2 px-2 py-1 text-xs opacity-80 ${
                esMio ? "border-white/50" : "border-text-accent"
              }`}
            >
              <p className="font-semibold">{mensaje.respuestaA.autorNombre}</p>
              <p className="truncate">{mensaje.respuestaA.texto}</p>
            </div>
          )}

          {mensaje.adjuntoTipo === "foto" && mensaje.adjuntoUrl && (
            // Mismo criterio que el botón de ubicación: detiene la
            // propagación de touch/click/contextmenu para que tocar la foto
            // no dispare a la vez el long-press del mensaje.
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setMostrarVisorFoto(true);
              }}
              onTouchStart={(e) => e.stopPropagation()}
              onTouchMove={(e) => e.stopPropagation()}
              onTouchEnd={(e) => e.stopPropagation()}
              onContextMenu={(e) => e.stopPropagation()}
              className="mb-1 block w-full"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={mensaje.adjuntoUrl}
                alt="Foto"
                className="max-h-64 w-full rounded-app object-cover"
              />
            </button>
          )}

          {mostrarVisorFoto && mensaje.adjuntoUrl && (
            <VisorFotoMensaje url={mensaje.adjuntoUrl} onCerrar={() => setMostrarVisorFoto(false)} />
          )}

          {mensaje.adjuntoTipo === "ubicacion" &&
            mensaje.adjuntoUbicacionLat !== null &&
            mensaje.adjuntoUbicacionLon !== null && (
              // Detiene la propagación de touch/click/contextmenu: sin esto, un
              // toque un poco largo sobre el mini-mapa (natural en un mapa
              // chico) también disparaba el long-press del div padre, abriendo
              // a la vez el menú de mensaje Y este visor de pantalla completa.
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setMostrarVisorUbicacion(true);
                }}
                onTouchStart={(e) => e.stopPropagation()}
                onTouchMove={(e) => e.stopPropagation()}
                onTouchEnd={(e) => e.stopPropagation()}
                onContextMenu={(e) => e.stopPropagation()}
                className="mb-1 block w-full text-left"
              >
                <MiniMapaUbicacion
                  lat={mensaje.adjuntoUbicacionLat}
                  lon={mensaje.adjuntoUbicacionLon}
                  fotoUrl={mensaje.autorFotoUrl}
                  nombre={mensaje.autorNombre}
                />
                {mensaje.adjuntoUbicacionNombre && (
                  <span className="mt-1 flex items-center gap-1 text-xs opacity-80">
                    <IconMapPin size={13} className="shrink-0" />
                    Cerca de {mensaje.adjuntoUbicacionNombre}
                  </span>
                )}
              </button>
            )}

          {mensaje.adjuntoTipo === "ubicacion" &&
            (mensaje.adjuntoUbicacionLat === null || mensaje.adjuntoUbicacionLon === null) &&
            mensaje.adjuntoUbicacionNombre && (
              <div className="mb-1 flex items-center gap-1.5 rounded-app bg-black/20 px-2 py-1.5">
                <IconMapPin size={16} className="shrink-0" />
                <span className="text-xs font-semibold">{mensaje.adjuntoUbicacionNombre}</span>
              </div>
            )}

          {mostrarVisorUbicacion &&
            mensaje.adjuntoUbicacionLat !== null &&
            mensaje.adjuntoUbicacionLon !== null && (
              <VisorUbicacionMensaje
                lat={mensaje.adjuntoUbicacionLat}
                lon={mensaje.adjuntoUbicacionLon}
                nombre={mensaje.adjuntoUbicacionNombre}
                autorNombre={mensaje.autorNombre}
                autorFotoUrl={mensaje.autorFotoUrl}
                onCerrar={() => setMostrarVisorUbicacion(false)}
              />
            )}

          {mensaje.adjuntoTipo === "ruta" &&
            mensaje.adjuntoRutaPuntos &&
            mensaje.adjuntoRutaDistanciaKm !== null &&
            mensaje.adjuntoRutaDuracionSeg !== null && (
              <div className="mb-1 bg-black/20 rounded-app">
                <TarjetaRuta
                  puntos={JSON.parse(mensaje.adjuntoRutaPuntos)}
                  distanciaKm={mensaje.adjuntoRutaDistanciaKm}
                  duracionSeg={mensaje.adjuntoRutaDuracionSeg}
                />
              </div>
            )}

          {mensaje.texto && <p>{mensaje.texto}</p>}

          <div className="mt-0.5 flex items-center justify-end gap-1">
            <span className="text-[10px] opacity-70">
              {new Date(mensaje.createdAt).toLocaleTimeString("es-CL", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            {estadoEnvio && (
              <span className={estadoEnvio === "leido" ? "text-sky-300" : "opacity-70"}>
                {estadoEnvio === "enviado" ? <IconCheck size={13} /> : <IconChecks size={13} />}
              </span>
            )}
          </div>
        </div>
      </div>

      {!compacto && mensaje.reacciones.length > 0 && (
        <div className="-mt-1 flex gap-1">
          {Object.entries(
            mensaje.reacciones.reduce<Record<string, number>>((acc, r) => {
              acc[r.emoji] = (acc[r.emoji] ?? 0) + 1;
              return acc;
            }, {}),
          ).map(([emoji, cantidad]) => {
            const esMiReaccion = mensaje.reacciones.some(
              (r) => r.miembroId === propioId && r.emoji === emoji,
            );
            return (
              <button
                key={emoji}
                type="button"
                onClick={() => onReaccionar?.(mensaje, emoji)}
                className={`rounded-full border px-1.5 py-0.5 text-xs ${
                  esMiReaccion ? "border-text-accent bg-text-accent/10" : "border-border bg-surface-2"
                }`}
              >
                {emoji}
                {cantidad > 1 ? cantidad : ""}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
