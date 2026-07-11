"use client";

import { useEffect, useRef, useState } from "react";
import { IconX } from "@tabler/icons-react";
import type { GrupoHistorias } from "@/lib/historias";
import { marcarVistaHistoria, parsearEstiloTexto, toggleReaccionHistoria } from "@/lib/historias";
import { apiPost, ApiError } from "@/lib/api";
import { salaIndividual } from "@/lib/chat";
import { useSession } from "@/context/SessionContext";
import { Avatar } from "@/components/Avatar";
import { estiloVisualTexto } from "@/components/Historias/TextoSobreImagen";
import { estiloVisualMencion } from "@/components/Historias/MencionSobreImagen";
import { ListaReaccionesHistoria } from "@/components/Historias/ListaReaccionesHistoria";

const DURACION_FOTO_MS = 5000;
const UMBRAL_SWIPE_CIERRE_PX = 80;
const UMBRAL_HOLD_MS = 200;

// Barra de progreso de un segmento, manejada con requestAnimationFrame (en vez
// de una transición CSS) para poder pausarla de verdad al mantener presionado
// — una transición CSS no se puede "congelar" a mitad de camino sin recalcular
// el tiempo restante a mano, así que es más simple llevar el avance en JS.
function SegmentoProgreso({
  duracionMs,
  pausado,
  onComplete,
}: {
  duracionMs: number;
  pausado: boolean;
  onComplete: () => void;
}) {
  const [progreso, setProgreso] = useState(0);
  const acumuladoRef = useRef(0);
  const inicioRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    if (pausado) {
      if (inicioRef.current !== null) {
        acumuladoRef.current += performance.now() - inicioRef.current;
        inicioRef.current = null;
      }
      return;
    }

    inicioRef.current = performance.now();
    function tick() {
      if (inicioRef.current === null) return;
      const transcurrido = acumuladoRef.current + (performance.now() - inicioRef.current);
      const fraccion = Math.min(1, transcurrido / duracionMs);
      setProgreso(fraccion);
      if (fraccion >= 1) {
        onCompleteRef.current();
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [pausado, duracionMs]);

  return <div className="h-full bg-white" style={{ width: `${progreso * 100}%` }} />;
}

export function VisorHistorias({
  grupos,
  indiceInicial,
  indiceHistoriaInicial = 0,
  token,
  onClose,
}: {
  grupos: GrupoHistorias[];
  indiceInicial: number;
  indiceHistoriaInicial?: number;
  token: string | null;
  onClose: () => void;
}) {
  const { sesion } = useSession();
  const [indiceGrupo, setIndiceGrupo] = useState(indiceInicial);
  const [indiceHistoria, setIndiceHistoria] = useState(indiceHistoriaInicial);
  const [duracionVideoMs, setDuracionVideoMs] = useState<number | null>(null);
  const [reaccionLocal, setReaccionLocal] = useState<{ count: number; mia: boolean } | null>(null);
  const [mostrarReacciones, setMostrarReacciones] = useState(false);
  const [pausado, setPausado] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [enviandoMensaje, setEnviandoMensaje] = useState(false);
  const [mensajeEnviado, setMensajeEnviado] = useState(false);
  const [mensajeError, setMensajeError] = useState("");
  const startYRef = useRef(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const holdTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdActivadoRef = useRef(false);

  const grupo = grupos[indiceGrupo];
  const historia = grupo?.historias[indiceHistoria];

  function avanzar() {
    if (!grupo) return;
    if (indiceHistoria < grupo.historias.length - 1) {
      setIndiceHistoria((i) => i + 1);
    } else if (indiceGrupo < grupos.length - 1) {
      setIndiceGrupo((g) => g + 1);
      setIndiceHistoria(0);
    } else {
      onClose();
    }
  }

  function retroceder() {
    if (indiceHistoria > 0) {
      setIndiceHistoria((i) => i - 1);
    } else if (indiceGrupo > 0) {
      const anterior = grupos[indiceGrupo - 1];
      setIndiceGrupo((g) => g - 1);
      setIndiceHistoria(anterior.historias.length - 1);
    }
  }

  useEffect(() => {
    setDuracionVideoMs(null);
    setReaccionLocal(null);
    setMostrarReacciones(false);
    setPausado(false);
    setMensaje("");
    setMensajeEnviado(false);
    setMensajeError("");
  }, [historia?.id]);

  // Se marca como vista apenas se muestra, no solo al abrir el visor completo.
  useEffect(() => {
    if (!historia || !token) return;
    marcarVistaHistoria(historia.id, token).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historia?.id]);

  // Mantener presionado pausa el video real, además de la barra de progreso.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (pausado) video.pause();
    else video.play().catch(() => {});
  }, [pausado]);

  if (!grupo || !historia) return null;

  const duracionMs = historia.tipo === "foto" ? DURACION_FOTO_MS : (duracionVideoMs ?? 0);
  // Ojo: el dueño del GRUPO puede no ser el autor real de esta historia en
  // particular (si el grupo es de alguien que aceptó una mención) — por eso
  // se compara contra `historia.autorId`, no `grupo.autorId`.
  const esAutor = sesion?.id === historia.autorId;
  const reaccionesCount = reaccionLocal?.count ?? historia.reaccionesCount;
  const miReaccion = reaccionLocal?.mia ?? historia.miReaccion;

  // El "patín dorado" de Legión Roller: actualización optimista (se ve al
  // toque, sin esperar la respuesta) con reversión si falla la llamada.
  async function reaccionar() {
    if (!token) return;
    const anterior = reaccionLocal;
    const nuevaMia = !miReaccion;
    setReaccionLocal({ count: reaccionesCount + (nuevaMia ? 1 : -1), mia: nuevaMia });
    try {
      const resultado = await toggleReaccionHistoria(historia.id, token);
      setReaccionLocal({ count: resultado.reaccionesCount, mia: resultado.miReaccion });
    } catch {
      setReaccionLocal(anterior);
    }
  }

  // Responder a la historia envía un mensaje directo de verdad al autor
  // (reusa el mismo chat/sala que ya existe) — se queda mostrando "Enviado"
  // dentro de la historia, sin abrir el chat, igual que Instagram.
  async function enviarMensajeHistoria() {
    const texto = mensaje.trim();
    if (!texto || !token || !sesion?.id || enviandoMensaje) return;
    setEnviandoMensaje(true);
    try {
      const sala = salaIndividual(sesion.id, historia.autorId);
      await apiPost(
        `/chat/mensajes/${sala}`,
        { texto, referenciaTipo: "historia", referenciaId: historia.id },
        token,
      );
      setMensaje("");
      setMensajeEnviado(true);
      setTimeout(() => setMensajeEnviado(false), 2000);
    } catch (err) {
      setMensajeError(err instanceof ApiError ? err.message : "No se pudo enviar el mensaje.");
    } finally {
      setEnviandoMensaje(false);
    }
  }

  // Mantener presionado pausa la historia (barra de progreso + video real);
  // un toque rápido sigue avanzando/retrocediendo como siempre. Se distingue
  // con un pequeño umbral: si se soltó antes de que se activara la pausa, fue
  // un toque normal; si se activó, soltar NO debe además navegar.
  function iniciarPausa(e: React.PointerEvent) {
    startYRef.current = e.clientY;
    holdActivadoRef.current = false;
    holdTimeoutRef.current = setTimeout(() => {
      holdActivadoRef.current = true;
      setPausado(true);
    }, UMBRAL_HOLD_MS);
  }

  function detenerPausa(e: React.PointerEvent) {
    if (holdTimeoutRef.current) clearTimeout(holdTimeoutRef.current);
    holdTimeoutRef.current = null;
    setPausado(false);
    if (e.clientY - startYRef.current > UMBRAL_SWIPE_CIERRE_PX) onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black"
      data-no-swipe
      onPointerDown={iniciarPausa}
      onPointerUp={detenerPausa}
      onPointerCancel={detenerPausa}
    >
      {/* Degradado oscuro detrás del encabezado: sin esto, la barra de progreso
          y el nombre quedaban difíciles de leer sobre fotos claras — no basta
          con el z-index, hace falta un fondo propio para que sea legible
          sobre cualquier imagen. */}
      <div className="absolute left-0 right-0 top-0 z-10 bg-gradient-to-b from-black/70 via-black/25 to-transparent px-2 pb-8 pt-2">
        <div className="flex gap-1">
          {grupo.historias.map((h, i) => (
            <div key={h.id} className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/30">
              {i < indiceHistoria ? (
                <div className="h-full w-full bg-white" />
              ) : i === indiceHistoria && duracionMs > 0 ? (
                <SegmentoProgreso duracionMs={duracionMs} pausado={pausado} onComplete={avanzar} />
              ) : null}
            </div>
          ))}
        </div>

        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* La autoría del creador original siempre se mantiene como
                dato principal; "Compartido por X" es solo una aclaración
                secundaria cuando llegó por una mención aceptada. */}
            <Avatar
              fotoUrl={historia.compartida ? historia.autorFotoUrl : grupo.autorFotoUrl}
              nombre={historia.compartida ? historia.autorNombre : grupo.autorNombre}
              tamano={28}
            />
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-white">
                {historia.compartida ? historia.autorNombre : grupo.autorNombre}
              </span>
              {historia.compartida && (
                <span className="text-[11px] text-white/70">Compartido por {grupo.autorNombre}</span>
              )}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="text-white">
            <IconX size={24} />
          </button>
        </div>
      </div>

      <div className="relative z-0 flex h-full w-full items-center justify-center">
        {/* Historias republicadas ("Compartido por..."): en vez del clásico
            fondo difuminado, se arma un estilo propio — difuminado + marca de
            agua del logo al 7% + resplandor dorado detrás, tarjeta flotante
            con marco dorado que brilla un segundo al abrir. Distinto de
            Instagram, mismo lenguaje visual dorado/oscuro de la app. */}
        {historia.compartida && (
          <div className="absolute inset-0 overflow-hidden" aria-hidden>
            {historia.tipo === "video" ? (
              <video
                src={historia.mediaUrl}
                className="absolute inset-0 h-full w-full scale-110 object-cover blur-2xl"
                autoPlay
                muted
                loop
                playsInline
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={historia.mediaUrl}
                alt=""
                className="absolute inset-0 h-full w-full scale-110 object-cover blur-2xl"
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/75 to-black" />
            <div
              className="absolute inset-0 opacity-[0.07]"
              style={{ backgroundImage: "url(/logo-legion-roller-mini.png)", backgroundRepeat: "repeat", backgroundSize: "140px 140px" }}
            />
            <div
              className="absolute inset-0"
              style={{ background: "radial-gradient(ellipse at center, rgba(231,193,104,0.16), transparent 65%)" }}
            />
          </div>
        )}

        <div
          className={
            historia.compartida
              ? "relative h-[80%] w-[80%] rounded-[18px]"
              : "relative h-full w-full"
          }
          style={
            historia.compartida
              ? {
                  padding: 2,
                  background: "linear-gradient(100deg, #b9852c, #fff3d6, #e7c168, #fff3d6, #b9852c)",
                  backgroundSize: "250% 100%",
                }
              : undefined
          }
        >
          {historia.compartida && (
            <div
              key={`brillo-${historia.id}`}
              className="animate-brillo-marco absolute inset-0 rounded-[18px]"
              style={{
                background: "linear-gradient(100deg, #b9852c, #fff3d6, #e7c168, #fff3d6, #b9852c)",
                backgroundSize: "250% 100%",
              }}
            />
          )}
          <div
            className={
              historia.compartida
                ? "relative h-full w-full overflow-hidden rounded-[16px] bg-black shadow-[0_10px_40px_rgba(0,0,0,0.6),0_0_25px_rgba(231,193,104,0.35)]"
                : "relative h-full w-full"
            }
          >
            {historia.tipo === "video" ? (
              <video
                ref={videoRef}
                key={historia.id}
                src={historia.mediaUrl}
                className="h-full w-full object-contain"
                autoPlay
                playsInline
                onLoadedMetadata={(e) => setDuracionVideoMs(e.currentTarget.duration * 1000)}
                onEnded={avanzar}
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={historia.mediaUrl} alt="" className="h-full w-full object-contain" />
            )}

            {historia.ubicacion && (
              <div className="absolute left-3 top-14 rounded-full bg-black/50 px-3 py-1 text-xs text-white">
                {historia.ubicacion}
              </div>
            )}
            {(() => {
              const estilo = parsearEstiloTexto(historia.textoEstilo);
              if (estilo) {
                return <div style={estiloVisualTexto(estilo)}>{estilo.contenido}</div>;
              }
              // Compatibilidad: historias creadas antes de este editor de texto
              // solo tienen el campo plano, sin posición/estilo — se muestran
              // centradas abajo, como antes.
              if (historia.texto) {
                return (
                  <p className="absolute bottom-10 left-0 right-0 px-6 text-center text-lg font-semibold text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.8)]">
                    {historia.texto}
                  </p>
                );
              }
              return null;
            })()}
            {historia.menciones.map((m) => (
              <div
                key={m.miembroId}
                style={estiloVisualMencion(m.x, m.y, m.escala)}
                className="flex items-center gap-1 whitespace-nowrap rounded-full bg-black/60 px-3 py-1.5 text-sm font-semibold text-white shadow"
              >
                <span className="text-text-accent">@</span>
                {m.nombre}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Zonas de tap sobre el media: mitad izquierda retrocede, derecha avanza.
          Si el toque activó la pausa (mantener presionado), soltar solo
          reanuda — no debe además navegar a la historia anterior/siguiente. */}
      <button
        type="button"
        aria-label="Historia anterior"
        onClick={() => {
          if (holdActivadoRef.current) {
            holdActivadoRef.current = false;
            return;
          }
          retroceder();
        }}
        className="absolute left-0 top-0 z-[5] h-full w-1/2"
      />
      <button
        type="button"
        aria-label="Historia siguiente"
        onClick={() => {
          if (holdActivadoRef.current) {
            holdActivadoRef.current = false;
            return;
          }
          avanzar();
        }}
        className="absolute right-0 top-0 z-[5] h-full w-1/2"
      />

      {/* El autor ve quién reaccionó (como Instagram); cualquier otro puede
          responder (mensaje directo real, mismo chat de siempre) y/o
          reaccionar con el patín dorado. */}
      <div className="absolute bottom-6 left-0 right-0 z-20 px-4" data-no-swipe>
        {esAutor ? (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => setMostrarReacciones(true)}
              className="flex items-center gap-2 rounded-full bg-black/60 px-4 py-2 text-sm font-semibold text-white"
            >
              <span>🛼</span>
              {reaccionesCount} · Ver quién reaccionó
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              {mensajeEnviado ? (
                <div className="flex h-11 flex-1 items-center justify-center rounded-full border border-fill-primary/60 bg-black/60 text-sm text-fill-primary">
                  Mensaje enviado ✓
                </div>
              ) : (
                <input
                  value={mensaje}
                  onChange={(e) => setMensaje(e.target.value)}
                  onFocus={() => setPausado(true)}
                  onBlur={() => setPausado(false)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") enviarMensajeHistoria();
                  }}
                  placeholder="Enviar mensaje"
                  maxLength={300}
                  disabled={enviandoMensaje}
                  className="h-11 flex-1 rounded-full border border-white/30 bg-black/40 px-4 text-sm text-white outline-none transition placeholder:text-white/50 focus:border-fill-primary focus:shadow-[0_0_12px_rgba(231,193,104,0.6)]"
                />
              )}
              <button
                type="button"
                onClick={() => (mensaje.trim() ? enviarMensajeHistoria() : reaccionar())}
                disabled={enviandoMensaje}
                aria-label={mensaje.trim() ? "Enviar mensaje" : "Reaccionar con un patín"}
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-black/60 text-2xl transition disabled:opacity-60 ${
                  miReaccion || mensaje.trim()
                    ? "drop-shadow-[0_0_10px_rgba(231,193,104,0.9)]"
                    : "opacity-60 grayscale"
                }`}
              >
                🛼
              </button>
            </div>
            {mensajeError && <p className="text-xs text-fill-warning">{mensajeError}</p>}
          </div>
        )}
      </div>

      {mostrarReacciones && (
        <ListaReaccionesHistoria
          historiaId={historia.id}
          token={token}
          onCerrar={() => setMostrarReacciones(false)}
        />
      )}
    </div>
  );
}
