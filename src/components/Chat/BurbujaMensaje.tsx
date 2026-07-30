"use client";

import { useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  IconArrowBackUp,
  IconCheck,
  IconChecks,
  IconMapPin,
  IconPin,
  IconFileTypePdf,
  IconFileTypeDoc,
  IconFileTypeXls,
  IconFile,
  IconDownload,
  IconChartBar,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import type { EstadoEnvio } from "@/hooks/useConversacion";
import type { MensajeChat } from "@/lib/chat";
import { TarjetaRuta } from "@/components/Chat/TarjetaRuta";
import { ReproductorAudioMensaje } from "@/components/Chat/ReproductorAudioMensaje";

// Ícono según extensión del nombre original — solo cubre los tipos que
// uploads.controller.ts acepta hoy (PDF, Word, Excel); cualquier otra cosa
// cae en el genérico.
function IconoArchivo({ nombre, size }: { nombre: string; size: number }) {
  const ext = nombre.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return <IconFileTypePdf size={size} />;
  if (ext === "doc" || ext === "docx") return <IconFileTypeDoc size={size} />;
  if (ext === "xls" || ext === "xlsx") return <IconFileTypeXls size={size} />;
  return <IconFile size={size} />;
}

function formatearTamano(kb: number): string {
  if (kb < 1024) return `${kb} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

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
  seleccionado = false,
  propioId,
  onResponder,
  onAbrirMenu,
  onReaccionar,
  onVotarEncuesta,
}: {
  mensaje: MensajeChat;
  esMio: boolean;
  estadoEnvio: EstadoEnvio | null;
  compacto?: boolean;
  seleccionado?: boolean;
  propioId?: number | null;
  onResponder?: (mensaje: MensajeChat) => void;
  onAbrirMenu?: (mensaje: MensajeChat, rect: DOMRect) => void;
  onReaccionar?: (mensaje: MensajeChat, emoji: string) => void;
  onVotarEncuesta?: (mensajeId: number, opcionId: number) => void;
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

  // Adjuntos "de borde a borde": en vez de una vista previa chica flotando
  // dentro del padding de la burbuja, el adjunto ocupa el ancho completo de
  // la burbuja (y el radio de sus esquinas superiores) igual que
  // WhatsApp/Telegram/iMessage. `estiloSangrado` cancela el px-3/py-2 del
  // contenedor padre con márgenes negativos (mismo truco ya usado para el
  // header fijo del chat) y calca el radio de la burbuja: las esquinas de
  // arriba solo si el adjunto es lo primero (si hay "Reenviado" o una cita
  // de respuesta antes, esas ya tienen su propio padding y quedan rectas),
  // las de abajo solo si el adjunto es lo último (ningún adjunto de este chat
  // hoy manda texto junto con el archivo, pero se deja la condición por si
  // algún día se agrega esa combinación).
  const hayEncabezadoAntes = !compacto && (mensaje.reenviado || mensaje.respuestaA !== null);
  const radioSuperior = esMio ? "14px 4px" : "4px 14px";
  function estiloSangrado(esUltimo: boolean): React.CSSProperties {
    return {
      marginLeft: "-0.75rem",
      marginRight: "-0.75rem",
      marginTop: hayEncabezadoAntes ? 0 : "-0.5rem",
      marginBottom: esUltimo ? "-0.5rem" : 0,
      borderRadius: `${hayEncabezadoAntes ? "0px 0px" : radioSuperior} ${esUltimo ? "14px 14px" : "0px 0px"}`,
    };
  }

  // Se ocultan aquí (no en la burbuja) porque solo se usan en los adjuntos
  // que se superponen al contenido (foto, ubicación con mapa, ruta) — el
  // resto (video, documento, audio, encuesta) conserva la fila de abajo tal
  // cual, sin superponer nada sobre sus propios controles.
  const horaTexto = new Date(mensaje.createdAt).toLocaleTimeString("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const iconoEnvio = estadoEnvio && (
    <span className={estadoEnvio === "leido" ? "text-sky-300" : "opacity-90"}>
      {estadoEnvio === "enviado" ? <IconCheck size={12} /> : <IconChecks size={12} />}
    </span>
  );
  function pastillaTiempo() {
    return (
      <span className="absolute bottom-1.5 right-1.5 flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[10px] text-white">
        {mensaje.fijado && <IconPin size={10} />}
        <span>{horaTexto}</span>
        {iconoEnvio}
      </span>
    );
  }
  const ocultarFilaInferior =
    !mensaje.texto &&
    (mensaje.adjuntoTipo === "foto" ||
      (mensaje.adjuntoTipo === "ubicacion" &&
        mensaje.adjuntoUbicacionLat !== null &&
        mensaje.adjuntoUbicacionLon !== null) ||
      mensaje.adjuntoTipo === "ruta");

  return (
    <div id={`mensaje-${mensaje.id}`} className={`flex flex-col ${esMio ? "items-end" : "items-start"}`}>
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
            // El resaltado usa solo box-shadow (nunca transform) para no crear
            // un containing block en reposo — mismo motivo por el que
            // `arrastreX` de abajo solo aplica transform durante el arrastre
            // real: un transform persistente atraparía los overlays `fixed`
            // del visor de foto/ubicación dentro del rectángulo chico de la
            // burbuja en vez de cubrir la pantalla completa.
            transition: "box-shadow 150ms ease",
            boxShadow: seleccionado ? "0 0 0 2px var(--border-accent)" : undefined,
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
              style={estiloSangrado(!mensaje.texto)}
              className="relative block overflow-hidden"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={mensaje.adjuntoUrl}
                alt="Foto"
                className="block max-h-80 w-full object-cover"
              />
              {!mensaje.texto && pastillaTiempo()}
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
                style={estiloSangrado(!mensaje.texto)}
                className="block overflow-hidden text-left"
              >
                <div className="relative">
                  <MiniMapaUbicacion
                    lat={mensaje.adjuntoUbicacionLat}
                    lon={mensaje.adjuntoUbicacionLon}
                    fotoUrl={mensaje.autorFotoUrl}
                    nombre={mensaje.autorNombre}
                    alto={180}
                  />
                  {!mensaje.texto && pastillaTiempo()}
                </div>
                {mensaje.adjuntoUbicacionNombre && (
                  <span className="flex items-center gap-1 px-3 pb-2 pt-1 text-xs opacity-80">
                    <IconMapPin size={13} className="shrink-0" />
                    Cerca de {mensaje.adjuntoUbicacionNombre}
                  </span>
                )}
              </button>
            )}

          {mensaje.adjuntoTipo === "ubicacion" &&
            (mensaje.adjuntoUbicacionLat === null || mensaje.adjuntoUbicacionLon === null) &&
            mensaje.adjuntoUbicacionNombre && (
              <div
                style={estiloSangrado(false)}
                className="flex items-center gap-1.5 bg-black/20 px-3 py-2"
              >
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
              <div style={estiloSangrado(!mensaje.texto)} className="overflow-hidden">
                <TarjetaRuta
                  puntos={JSON.parse(mensaje.adjuntoRutaPuntos)}
                  distanciaKm={mensaje.adjuntoRutaDistanciaKm}
                  duracionSeg={mensaje.adjuntoRutaDuracionSeg}
                  horaTexto={!mensaje.texto ? horaTexto : undefined}
                  marcaEnvio={!mensaje.texto ? iconoEnvio : undefined}
                  fijado={!mensaje.texto && mensaje.fijado}
                />
              </div>
            )}

          {/* El video conserva la fila de hora/check debajo (no superpuesta):
              los controles nativos del navegador ya ocupan la franja
              inferior del video, y una pastilla propia ahí se vería encimada
              con ellos. */}
          {mensaje.adjuntoTipo === "video" && mensaje.adjuntoUrl && (
            <video
              src={mensaje.adjuntoUrl}
              controls
              style={estiloSangrado(false)}
              className="block max-h-80 w-full"
            />
          )}

          {mensaje.adjuntoTipo === "audio" && mensaje.adjuntoUrl && (
            <div
              style={estiloSangrado(false)}
              className="overflow-hidden"
              onTouchStart={(e) => e.stopPropagation()}
              onTouchMove={(e) => e.stopPropagation()}
              onTouchEnd={(e) => e.stopPropagation()}
              onContextMenu={(e) => e.stopPropagation()}
            >
              <ReproductorAudioMensaje
                url={mensaje.adjuntoUrl}
                duracionSeg={mensaje.adjuntoAudioDuracionSeg}
              />
            </div>
          )}

          {mensaje.adjuntoTipo === "archivo" && mensaje.adjuntoUrl && (
            <a
              href={mensaje.adjuntoUrl}
              target="_blank"
              rel="noopener noreferrer"
              download={mensaje.adjuntoArchivoNombre ?? undefined}
              style={estiloSangrado(false)}
              className="flex w-full items-center gap-3 bg-black/25 px-3 py-3"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-app bg-black/20">
                <IconoArchivo nombre={mensaje.adjuntoArchivoNombre ?? ""} size={26} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">
                  {mensaje.adjuntoArchivoNombre ?? "Documento"}
                </span>
                {mensaje.adjuntoArchivoTamanoKb !== null && (
                  <span className="block text-xs opacity-70">
                    {formatearTamano(mensaje.adjuntoArchivoTamanoKb)}
                  </span>
                )}
              </span>
              <IconDownload size={18} className="shrink-0 opacity-70" />
            </a>
          )}

          {mensaje.adjuntoTipo === "encuesta" && mensaje.encuesta && (
            // Detiene la propagación de touch/click/contextmenu: mismo motivo
            // que la foto/ubicación — votar no debe disparar a la vez el
            // long-press del mensaje.
            <div
              onTouchStart={(e) => e.stopPropagation()}
              onTouchMove={(e) => e.stopPropagation()}
              onTouchEnd={(e) => e.stopPropagation()}
              onContextMenu={(e) => e.stopPropagation()}
              style={estiloSangrado(false)}
              className="flex flex-col gap-1.5 overflow-hidden bg-black/20 px-2.5 py-2"
            >
              <p className="flex items-center gap-1.5 text-sm font-semibold">
                <IconChartBar size={15} className="shrink-0" />
                {mensaje.texto}
              </p>
              <div className="flex flex-col gap-1.5">
                {mensaje.encuesta.opciones.map((o) => {
                  const total = mensaje.encuesta!.totalVotos;
                  const pct = total > 0 ? Math.round((o.votos / total) * 100) : 0;
                  const votada = mensaje.encuesta!.miVotoOpcionId === o.id;
                  return (
                    <button
                      key={o.id}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onVotarEncuesta?.(mensaje.id, o.id);
                      }}
                      className={`relative overflow-hidden rounded-app border px-2.5 py-1.5 text-left text-xs ${
                        votada ? "border-text-accent" : "border-white/15"
                      }`}
                    >
                      <span
                        className="absolute inset-y-0 left-0 bg-text-accent/25"
                        style={{ width: `${pct}%` }}
                      />
                      <span className="relative flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1">
                          {votada && <IconCheck size={12} className="shrink-0" />}
                          {o.texto}
                        </span>
                        <span className="shrink-0 opacity-70">{pct}%</span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <span className="text-[11px] opacity-60">
                {mensaje.encuesta.totalVotos} voto{mensaje.encuesta.totalVotos === 1 ? "" : "s"}
              </span>
            </div>
          )}

          {mensaje.texto && mensaje.adjuntoTipo !== "encuesta" && <p>{mensaje.texto}</p>}

          {!ocultarFilaInferior && (
            <div className="mt-0.5 flex items-center justify-end gap-1">
              {mensaje.fijado && <IconPin size={11} className="opacity-70" />}
              <span className="text-[10px] opacity-70">{horaTexto}</span>
              {iconoEnvio}
            </div>
          )}
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
