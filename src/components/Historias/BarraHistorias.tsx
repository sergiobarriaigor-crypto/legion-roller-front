"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { IconAt, IconCamera, IconPhoto, IconPlus } from "@tabler/icons-react";
import { useSession } from "@/context/SessionContext";
import { apiGet } from "@/lib/api";
import { listarHistorias, type GrupoHistorias } from "@/lib/historias";
import { Avatar } from "@/components/Avatar";
import { EditorHistoria } from "@/components/Historias/EditorHistoria";
import { VisorHistorias } from "@/components/Historias/VisorHistorias";
import { Toast } from "@/components/Toast";

// Barra horizontal de historias arriba del feed de Post, estilo Instagram.
// Oculta por completo para Visitante (sin token, no hay forma de calcular
// "vistoCompleto" ni de publicar) — mismo criterio que Mapa/Perfil/Chat.
export function BarraHistorias() {
  const { sesion } = useSession();
  const token = sesion?.token ?? null;
  const inputCamaraRef = useRef<HTMLInputElement>(null);
  const inputGaleriaRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  // Guarda "historiaId:comentarioId" del último deep-link ya procesado (no
  // solo un booleano de "primera vez"): si ya se estaba en /post y se toca
  // otra notificación desde la campana, el `router.push` de AppHeader.tsx es
  // navegación del lado del cliente — este componente sigue montado, así que
  // hace falta reaccionar al cambio de `searchParams`, no solo al montar.
  const ultimoDeepLinkRef = useRef<string | null>(null);

  const [grupos, setGrupos] = useState<GrupoHistorias[]>([]);
  const [miFotoUrl, setMiFotoUrl] = useState<string | null>(null);
  const [archivoElegido, setArchivoElegido] = useState<File | null>(null);
  const [indiceVisor, setIndiceVisor] = useState<number | null>(null);
  const [indiceHistoriaVisor, setIndiceHistoriaVisor] = useState(0);
  const [comentarioDestacadoVisor, setComentarioDestacadoVisor] = useState<number | undefined>(undefined);
  const [abrirReaccionesVisor, setAbrirReaccionesVisor] = useState(false);
  const [historiaNoDisponible, setHistoriaNoDisponible] = useState(false);
  const [mostrarOpcionesOrigen, setMostrarOpcionesOrigen] = useState(false);
  const [camaraBloqueada, setCamaraBloqueada] = useState(false);

  async function cargar() {
    if (!token) return null;
    try {
      const lista = await listarHistorias(token);
      setGrupos(lista);
      return lista;
    } catch {
      // silencioso: si falla, la barra simplemente no muestra historias de otros
      return null;
    }
  }

  // Deep-link desde la notificación de "te respondieron/comentaron/reaccionaron"
  // (ver AppHeader.tsx): abre directo la historia con el panel de comentarios
  // o de reacciones, según cuál haya originado la notificación.
  async function cargarYManejarDeepLink() {
    const historiaIdParam = searchParams.get("historia");
    if (!historiaIdParam) return;
    const comentarioIdParam = searchParams.get("comentario");
    const reaccionesParam = searchParams.get("reacciones");
    const clave = `${historiaIdParam}:${comentarioIdParam ?? ""}:${reaccionesParam ?? ""}`;
    if (ultimoDeepLinkRef.current === clave) return;
    ultimoDeepLinkRef.current = clave;

    const lista = await cargar();
    if (!lista) return;

    const historiaId = Number(historiaIdParam);
    const indiceGrupo = lista.findIndex((g) => g.historias.some((h) => h.id === historiaId));
    if (indiceGrupo === -1) {
      setHistoriaNoDisponible(true);
    } else {
      const indiceHistoria = lista[indiceGrupo].historias.findIndex((h) => h.id === historiaId);
      setIndiceHistoriaVisor(indiceHistoria);
      setComentarioDestacadoVisor(comentarioIdParam ? Number(comentarioIdParam) : undefined);
      setAbrirReaccionesVisor(!!reaccionesParam);
      setIndiceVisor(indiceGrupo);
    }
    router.replace("/post", { scroll: false });
  }

  // Aparte del efecto de carga normal: reacciona a `searchParams` para que
  // funcione también cuando ya se estaba en /post y se toca otra notificación
  // (navegación del lado del cliente, este componente no se remonta).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargarYManejarDeepLink();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargar();

    if (token) {
      apiGet<{ fotoUrl: string | null }>("/perfil/mio", token)
        .then((p) => setMiFotoUrl(p.fotoUrl))
        .catch(() => {});
    }
    // Sondeo periódico (mismo patrón que la campana de menciones y el badge
    // de chat sin leer): si el usuario acepta una mención desde la campana
    // — un componente aparte, montado en el header — esta barra no se entera
    // sola; sin esto, el anillo dorado de "Mi historia" quedaría desactualizado
    // hasta recargar la página.
    const intervalo = setInterval(cargar, 20000);
    return () => clearInterval(intervalo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (!token) return null;

  const misHistorias = grupos.find((g) => g.autorId === sesion?.id);
  const otrosGrupos = grupos.filter((g) => g.autorId !== sesion?.id);

  function abrirMiHistoriaOEditor() {
    if (misHistorias) {
      setIndiceHistoriaVisor(0);
      setIndiceVisor(grupos.indexOf(misHistorias));
    } else {
      setMostrarOpcionesOrigen(true);
    }
  }

  // Si alguna historia del grupo te menciona y todavía no la viste, abre el
  // visor directo ahí — acceso directo a la mención, no solo a la primera
  // historia del autor.
  function abrirGrupo(g: GrupoHistorias) {
    const indiceMencion = g.historias.findIndex((h) => h.mencionSinVer);
    setIndiceHistoriaVisor(indiceMencion !== -1 ? indiceMencion : 0);
    setIndiceVisor(grupos.indexOf(g));
  }

  // El "+" primero pregunta Cámara o Galería (antes se abría directo la
  // cámara vía `capture`, pero en varios Android eso salta la elección y a
  // veces la cámara nativa falla sin dejar caer a Galería); recién elegido el
  // archivo aparece el editor a pantalla completa, sin pantalla intermedia.
  function onArchivoElegido(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    if (archivo) setArchivoElegido(archivo);
    setMostrarOpcionesOrigen(false);
  }

  // No hay forma de que una página reactive un permiso ya bloqueado por el
  // usuario (restricción del navegador) — lo único práctico es detectar el
  // bloqueo con la API de Permisos y explicar cómo reactivarlo, en vez de que
  // el botón "Cámara" no haga nada sin dar ninguna pista. Si el navegador no
  // soporta esta consulta (Safari/WebViews viejos), simplemente se abre la
  // cámara igual y, si está bloqueada, el propio sistema no mostrará nada.
  async function intentarAbrirCamara() {
    try {
      const estado = await navigator.permissions.query({
        name: "camera" as PermissionName,
      });
      if (estado.state === "denied") {
        setMostrarOpcionesOrigen(false);
        setCamaraBloqueada(true);
        return;
      }
    } catch {
      // API no soportada: seguimos igual, sin bloquear el flujo normal.
    }
    inputCamaraRef.current?.click();
  }

  return (
    <>
      <input
        ref={inputCamaraRef}
        type="file"
        accept="image/*,video/*"
        capture="environment"
        onChange={onArchivoElegido}
        className="hidden"
      />
      <input
        ref={inputGaleriaRef}
        type="file"
        accept="image/*,video/*"
        onChange={onArchivoElegido}
        className="hidden"
      />

      <div className="flex gap-3 overflow-x-auto pt-2 pb-1">
        <div className="flex flex-col items-center gap-1">
          <div
            role="button"
            tabIndex={0}
            className="relative cursor-pointer"
            onClick={abrirMiHistoriaOEditor}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                abrirMiHistoriaOEditor();
              }
            }}
          >
            <Avatar
              fotoUrl={miFotoUrl}
              nombre={sesion?.nombre ?? "Yo"}
              tamano={64}
              anillo={misHistorias && !misHistorias.vistoCompleto ? "dorado" : "ninguno"}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setMostrarOpcionesOrigen(true);
                }}
                aria-label="Agregar historia"
                className="absolute bottom-0 right-0 flex h-5 w-5 items-center justify-center rounded-full border-2 border-page-bg bg-fill-primary text-on-primary"
              >
                <IconPlus size={12} />
              </button>
              {/* Notificación liviana: alguien reaccionó con el patín y todavía no lo viste. */}
              {misHistorias?.reaccionesSinLeer && (
                <span className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full border-2 border-page-bg bg-fill-primary" />
              )}
            </Avatar>
          </div>
          <span className="max-w-[60px] truncate text-center text-[11px] text-text-secondary">
            Mi historia
          </span>
        </div>

        {otrosGrupos.map((g) => (
          <button
            key={g.autorId}
            type="button"
            onClick={() => abrirGrupo(g)}
            className="flex flex-col items-center gap-1"
          >
            <Avatar
              fotoUrl={g.autorFotoUrl}
              nombre={g.autorNombre}
              tamano={64}
              anillo={g.vistoCompleto ? "ninguno" : "dorado"}
            >
              {/* Te mencionaron en una historia de esta persona y todavía no la viste. */}
              {g.historias.some((h) => h.mencionSinVer) && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-page-bg bg-text-accent text-on-primary">
                  <IconAt size={10} />
                </span>
              )}
            </Avatar>
            <span className="max-w-[60px] truncate text-center text-[11px] text-text-secondary">
              {g.autorNombre.split(" ")[0]}
            </span>
          </button>
        ))}
      </div>

      {mostrarOpcionesOrigen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50"
          onClick={() => setMostrarOpcionesOrigen(false)}
        >
          <div
            className="flex w-full max-w-md flex-col gap-2 rounded-t-app bg-surface-1 p-4 pb-6"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="pb-1 text-center text-sm font-semibold text-text-primary">
              Nueva historia
            </p>
            <button
              type="button"
              onClick={intentarAbrirCamara}
              className="flex items-center gap-3 rounded-app px-3 py-3 text-sm text-text-primary hover:bg-surface-2"
            >
              <IconCamera size={20} className="text-text-accent" />
              Cámara
            </button>
            <button
              type="button"
              onClick={() => inputGaleriaRef.current?.click()}
              className="flex items-center gap-3 rounded-app px-3 py-3 text-sm text-text-primary hover:bg-surface-2"
            >
              <IconPhoto size={20} className="text-text-accent" />
              Galería
            </button>
            <button
              type="button"
              onClick={() => setMostrarOpcionesOrigen(false)}
              className="mt-1 rounded-app px-3 py-2 text-center text-sm text-text-secondary"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {archivoElegido && (
        <EditorHistoria
          archivoInicial={archivoElegido}
          token={token}
          onClose={() => {
            setArchivoElegido(null);
            if (inputCamaraRef.current) inputCamaraRef.current.value = "";
            if (inputGaleriaRef.current) inputGaleriaRef.current.value = "";
          }}
          onPublicado={() => {
            setArchivoElegido(null);
            if (inputCamaraRef.current) inputCamaraRef.current.value = "";
            if (inputGaleriaRef.current) inputGaleriaRef.current.value = "";
            cargar();
          }}
        />
      )}

      {indiceVisor !== null && (
        <VisorHistorias
          grupos={grupos}
          indiceInicial={indiceVisor}
          indiceHistoriaInicial={indiceHistoriaVisor}
          comentarioDestacadoInicial={comentarioDestacadoVisor}
          abrirReaccionesInicial={abrirReaccionesVisor}
          token={token}
          onClose={() => {
            setIndiceVisor(null);
            setComentarioDestacadoVisor(undefined);
            setAbrirReaccionesVisor(false);
            cargar();
          }}
        />
      )}

      {historiaNoDisponible && (
        <Toast
          mensaje="Esa historia ya no está disponible (venció o fue eliminada)."
          onDismiss={() => setHistoriaNoDisponible(false)}
          duracionMs={3500}
        />
      )}

      {camaraBloqueada && (
        <Toast
          mensaje="Cámara bloqueada: actívala en ⋮ (arriba a la derecha) → Información del sitio → Permisos → Cámara → Permitir, y vuelve a intentar."
          onDismiss={() => setCamaraBloqueada(false)}
          duracionMs={6000}
        />
      )}
    </>
  );
}
