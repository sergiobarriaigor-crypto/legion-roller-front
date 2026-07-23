"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { IconMaximize, IconX, IconCurrentLocation, IconMap2, IconSatellite, IconMessage2, IconHeartHandshake, IconPlus, IconMinus } from "@tabler/icons-react";
import { useSession } from "@/context/SessionContext";
import { apiPost, apiPut, apiGet, apiDelete, ApiError } from "@/lib/api";
import { distanciaTotalKm, distanciaHaversineKm, type PuntoGps } from "@/lib/geo";
import type { Publicacion } from "@/lib/publicaciones";
import {
  combinarFechaHora,
  rodadaEnVentana,
  rodadaActivable,
  minutosHasta,
  puntoPartidaVisible,
} from "@/lib/rodadas";
import { ETIQUETA_MOTIVO, type EmergenciaActiva } from "@/lib/emergencias";
import { salaIndividual } from "@/lib/chat";
import { tiempoTranscurrido } from "@/lib/tiempo";
import { notificarme } from "@/lib/push";
import { PatinadoresActivosPanel } from "@/components/Mapa/PatinadoresActivosPanel";
import { MisRutasPanel } from "@/components/Mapa/MisRutasPanel";
import { ChatFlotante } from "@/components/Mapa/ChatFlotante";

const MAX_CARACTERES_RECONOCIMIENTO = 100;

// Centro por defecto: entre Puerto Montt y Puerto Varas (sección 1 del PDF).
const CENTRO_DEFECTO: [number, number] = [-41.4, -72.96];

// Ajuste post-Fase 11: detección de inactividad para cerrar solo el recorrido.
const KM_MOVIMIENTO_SIGNIFICATIVO = 0.03; // ~30 metros
const MIN_AVISO_INACTIVIDAD = 25; // dentro del rango pedido (20 a 30 min)
const MIN_CIERRE_AUTOMATICO = 10;

// Anti-trampa: si la velocidad entre dos puntos grabados se mantiene arriba de
// este umbral de forma sostenida (sin bajar ni un momento), lo más probable es
// que la persona ande en auto con el modo activo, no patinando. 35 km/h es más
// rápido que un patinador sostenido en llano; 5 minutos seguidos descarta que
// sea solo una bajada rápida o un salto de GPS puntual.
const KMH_VELOCIDAD_SOSPECHOSA = 35;
const MS_VELOCIDAD_SOSPECHOSA_SOSTENIDA = 5 * 60 * 1000;

// Zoom usado para centrar el mapa automáticamente al activar un modo (más cercano
// que el zoom inicial de la sección 1 del PDF, pensado para ubicarte de un vistazo).
const ZOOM_CENTRADO_AUTOMATICO = 16;

// Mismo patrón de tap-vs-hold que el botón central del bottom-nav.
const HOLD_MS_CENTRAR = 1500;

// Capas de mapa disponibles (botón inferior izquierdo): estándar (OpenStreetMap,
// ya usado en el resto de la app) y satélite (Esri World Imagery, gratis y sin
// API key, igual que OpenStreetMap).
const CAPAS_MAPA = {
  estandar: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
  satelite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri",
  },
} as const;

type CapaMapa = keyof typeof CAPAS_MAPA;

// Capa de referencia (transparente, solo calles/nombres/límites) que se superpone
// a la vista satélite para no perder la orientación — mismo servicio gratuito de
// Esri, sin API key, pensado justo para combinarse con World_Imagery.
const CAPA_ETIQUETAS_SATELITE_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}";

type Modo = "patinando" | "ruta" | null;

interface RodadaCercana {
  id: number;
  titulo: string;
  hora: string | null;
  distanciaKm: number;
}

function escapeHtml(texto: string) {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function crearIcono(color: string) {
  return L.divIcon({
    className: "",
    html: `<div style="width:16px;height:16px;border-radius:9999px;background:${color};border:2px solid #171008;box-shadow:0 0 0 2px rgba(201,154,61,0.55);"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

const iconoEmergencia = crearIcono("#D8342F");

// Punto de partida de una rodada/evento (mismo dorado que el selector de mapa
// del Admin), visible en el Mapa solo para quien respondió "Voy"/"Tal vez",
// desde 30 min antes hasta la hora exacta de inicio.
const iconoPuntoPartida = L.divIcon({
  className: "",
  html: `<div style="width:22px;height:22px;border-radius:9999px;background:#e7c168;border:2px solid #171008;box-shadow:0 0 8px 2px rgba(231,193,104,0.85);"></div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

// Colores neón por modo (ajuste de este pedido): verde = en ruta, rojo = solo
// patinando ahora, para identificar el estado de cada patinador de un vistazo.
const GLOW_POR_MODO: Record<string, { anillo: string; sombra: string }> = {
  ruta: { anillo: "#39FF14", sombra: "rgba(57, 255, 20, 0.85)" },
  patinando: { anillo: "#FF3131", sombra: "rgba(255, 49, 49, 0.85)" },
};

// Bajo este umbral, dos patinadores se consideran "el mismo punto" del mapa
// (~15 metros — el ancho de una plaza chica) y se agrupan en un solo marcador
// con insignia "+N" en vez de quedar superpuestos e inidentificables.
const UMBRAL_CLUSTER_KM = 0.015;

// Avatar circular (foto o inicial) con burbuja de estado opcional y un borde con
// brillo (glow) según el modo del miembro, para verse en el mapa mientras
// comparte su ubicación.
function crearIconoAvatar({
  fotoUrl,
  nombre,
  estado,
  modo,
  masPersonas,
}: {
  fotoUrl: string | null;
  nombre: string;
  estado?: string | null;
  modo: string;
  masPersonas?: number;
}) {
  const TAM = 40;
  const { anillo, sombra } = GLOW_POR_MODO[modo] ?? GLOW_POR_MODO.patinando;
  const inicial = escapeHtml((nombre.charAt(0) || "?").toUpperCase());
  const contenido = fotoUrl
    ? `<img src="${escapeHtml(fotoUrl)}" style="width:100%;height:100%;object-fit:cover;" />`
    : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-weight:600;color:#171008;">${inicial}</div>`;

  const burbuja = estado
    ? `<div style="position:absolute;bottom:${TAM + 6}px;left:50%;transform:translateX(-50%);max-width:110px;background:#171008;color:#f2ead8;font-size:10px;line-height:1.25;padding:4px 8px;border-radius:10px;text-align:center;box-shadow:0 1px 4px rgba(0,0,0,0.4);">${escapeHtml(estado)}</div>`
    : "";

  // Insignia "+N": cuando este marcador representa a varios patinadores
  // agrupados por estar en el mismo punto (ver UMBRAL_CLUSTER_KM), en vez de
  // quedar todos superpuestos e inidentificables se ve uno solo con este
  // contador — tocarlo abre la lista completa (ver `clusterAbierto`).
  const insignia = masPersonas
    ? `<div style="position:absolute;right:-4px;bottom:-4px;min-width:18px;height:18px;padding:0 3px;border-radius:9999px;background:#171008;border:1.5px solid #c99a3d;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#e7c168;">+${masPersonas}</div>`
    : "";

  return L.divIcon({
    className: "",
    html: `
      <div style="position:relative;width:${TAM}px;height:${TAM}px;">
        ${burbuja}
        <div style="width:${TAM}px;height:${TAM}px;border-radius:9999px;background:#e7c168;border:2px solid ${anillo};box-shadow:0 0 8px 2px ${sombra},0 0 3px 1px ${sombra};overflow:hidden;">
          ${contenido}
        </div>
        ${insignia}
      </div>
    `,
    iconSize: [TAM, TAM],
    iconAnchor: [TAM / 2, TAM / 2],
  });
}

interface OtroMiembro {
  miembroId: number;
  nombre: string;
  fotoUrl: string | null;
  estado: string | null;
  lat: number;
  lon: number;
  modo: string;
  iniciadoEn: string;
}

// Tarjeta emergente al tocar la foto de otro patinador en el mapa: solo dos
// botones (mensaje directo / reconocimiento breve). El formulario de
// reconocimiento se abre en un modal aparte (no dentro de este Popup de
// Leaflet) — un Popup se puede cerrar solo por gestos del mapa (clic fuera,
// reposicionamiento al abrirse el teclado en el celular, etc.), lo que hacía
// que el formulario desapareciera a mitad de escribir/enviar.
function PopupOtroMiembro({
  miembro,
  onAbrirChat,
  onAbrirReconocimiento,
}: {
  miembro: OtroMiembro;
  onAbrirChat: (miembro: OtroMiembro) => void;
  onAbrirReconocimiento: (miembro: OtroMiembro) => void;
}) {
  const map = useMap();

  function manejarAbrirChat() {
    map.closePopup();
    onAbrirChat(miembro);
  }

  function manejarAbrirReconocimiento() {
    map.closePopup();
    onAbrirReconocimiento(miembro);
  }

  return (
    <div className="flex items-center gap-2.5 rounded-full border border-border bg-surface-1 py-2 pr-2.5 pl-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-text-primary">{miembro.nombre}</p>
        <p className="text-[10px] text-text-secondary">{tiempoTranscurrido(miembro.iniciadoEn)}</p>
      </div>
      <div className="h-8 w-px shrink-0 bg-border" />
      <div className="flex shrink-0 gap-0.5">
        <button
          type="button"
          aria-label="Enviar mensaje"
          onClick={manejarAbrirChat}
          className="flex h-8 w-8 items-center justify-center rounded-full text-amber-text active:bg-amber-bg"
        >
          <IconMessage2 size={17} />
        </button>
        <button
          type="button"
          aria-label="Enviar reconocimiento"
          onClick={manejarAbrirReconocimiento}
          className="flex h-8 w-8 items-center justify-center rounded-full text-amber-text active:bg-amber-bg"
        >
          <IconHeartHandshake size={17} />
        </button>
      </div>
    </div>
  );
}

// Agrupa a los que están a menos de UMBRAL_CLUSTER_KM entre sí (comparando
// siempre contra el primero de cada grupo — alcanza para la cantidad de
// patinadores activos a la vez, no hace falta un algoritmo de clustering real).
function agruparPorCercania(miembros: OtroMiembro[]): OtroMiembro[][] {
  const grupos: OtroMiembro[][] = [];
  for (const miembro of miembros) {
    const grupo = grupos.find(
      (g) =>
        distanciaHaversineKm(
          { lat: g[0].lat, lon: g[0].lon, timestamp: 0 },
          { lat: miembro.lat, lon: miembro.lon, timestamp: 0 },
        ) < UMBRAL_CLUSTER_KM,
    );
    if (grupo) grupo.push(miembro);
    else grupos.push([miembro]);
  }
  return grupos;
}

// Fila dentro de la lista de un cluster (mismo contenido que PopupOtroMiembro,
// sin `useMap()` — este modal vive fuera del <MapContainer>, no dentro de él).
function FilaMiembroCluster({
  miembro,
  onAbrirChat,
  onAbrirReconocimiento,
}: {
  miembro: OtroMiembro;
  onAbrirChat: (miembro: OtroMiembro) => void;
  onAbrirReconocimiento: (miembro: OtroMiembro) => void;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-full border border-border bg-surface-2 py-2 pr-2.5 pl-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-text-primary">{miembro.nombre}</p>
        <p className="text-[10px] text-text-secondary">{tiempoTranscurrido(miembro.iniciadoEn)}</p>
      </div>
      <div className="h-8 w-px shrink-0 bg-border" />
      <div className="flex shrink-0 gap-0.5">
        <button
          type="button"
          aria-label="Enviar mensaje"
          onClick={() => onAbrirChat(miembro)}
          className="flex h-8 w-8 items-center justify-center rounded-full text-amber-text active:bg-amber-bg"
        >
          <IconMessage2 size={17} />
        </button>
        <button
          type="button"
          aria-label="Enviar reconocimiento"
          onClick={() => onAbrirReconocimiento(miembro)}
          className="flex h-8 w-8 items-center justify-center rounded-full text-amber-text active:bg-amber-bg"
        >
          <IconHeartHandshake size={17} />
        </button>
      </div>
    </div>
  );
}

export function MapaView() {
  const { sesion } = useSession();
  const token = sesion?.token ?? null;

  const [posicion, setPosicion] = useState<{ lat: number; lon: number } | null>(null);
  const [errorGeo, setErrorGeo] = useState("");
  const [otros, setOtros] = useState<OtroMiembro[]>([]);
  const [modo, setModo] = useState<Modo>(null);
  const [grabando, setGrabando] = useState(false);
  const [puntosGrabados, setPuntosGrabados] = useState<PuntoGps[]>([]);
  const [resumen, setResumen] = useState<{ distanciaKm: number; duracionSeg: number } | null>(null);
  const [emergenciasActivas, setEmergenciasActivas] = useState<EmergenciaActiva[]>([]);
  const [mensaje, setMensaje] = useState("");
  const [limiteRutasAlcanzado, setLimiteRutasAlcanzado] = useState(false);
  const [rodadaActiva, setRodadaActiva] = useState<Publicacion | null>(null);
  const [candidatasRodada, setCandidatasRodada] = useState<RodadaCercana[]>([]);
  const [puntosPartida, setPuntosPartida] = useState<
    { id: number; tipo: string; titulo: string; lat: number; lon: number }[]
  >([]);

  const [pantallaCompleta, setPantallaCompleta] = useState(false);
  const [capaMapa, setCapaMapa] = useState<CapaMapa>("estandar");

  const [miFotoUrl, setMiFotoUrl] = useState<string | null>(null);
  const [miEstadoTexto, setMiEstadoTexto] = useState<string | null>(null);
  const [mostrarEditorEstado, setMostrarEditorEstado] = useState(false);
  const [textoEstadoForm, setTextoEstadoForm] = useState("");
  const [guardandoEstado, setGuardandoEstado] = useState(false);

  const [avisoInactividad, setAvisoInactividad] = useState(false);
  const [avisoVelocidad, setAvisoVelocidad] = useState(false);
  const [mostrarPreguntaMapeo, setMostrarPreguntaMapeo] = useState(false);
  const [mostrarMisRutas, setMostrarMisRutas] = useState(false);
  const [chatFlotante, setChatFlotante] = useState<{
    sala: string;
    nombre: string;
    fotoUrl: string | null;
  } | null>(null);
  const [reconocerA, setReconocerA] = useState<OtroMiembro | null>(null);
  const [clusterAbierto, setClusterAbierto] = useState<OtroMiembro[] | null>(null);
  const [textoReconocimiento, setTextoReconocimiento] = useState("");
  const [enviandoReconocimiento, setEnviandoReconocimiento] = useState(false);
  const [reconocimientoEnviado, setReconocimientoEnviado] = useState(false);

  const posicionRef = useRef<{ lat: number; lon: number } | null>(null);
  const grabandoRef = useRef(false);
  const inicioGrabacionRef = useRef<number>(0);
  const mapRef = useRef<L.Map | null>(null);

  const gruposOtros = useMemo(() => agruparPorCercania(otros), [otros]);

  // Espejos en refs de estado/token, para poder leerlos desde callbacks de
  // geolocalización y temporizadores de larga duración sin closures obsoletas.
  const modoRef = useRef<Modo>(null);
  const puntosGrabadosRef = useRef<PuntoGps[]>([]);
  const tokenRef = useRef<string | null>(null);
  const necesitaEnvioInicialRef = useRef(false);
  const ultimaPosSignificativaRef = useRef<PuntoGps | null>(null);
  const ultimoMovimientoEnRef = useRef<number>(Date.now());
  const avisoInactividadRef = useRef(false);
  const cierreAutomaticoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Marca desde cuándo el tramo actual viene sostenido arriba de
  // KMH_VELOCIDAD_SOSPECHOSA — se reinicia a null apenas la velocidad baja del
  // umbral, así que solo cuenta tiempo *seguido* arriba, no acumulado.
  const inicioTramoRapidoRef = useRef<number | null>(null);
  const avisoVelocidadRef = useRef(false);
  const necesitaCentrarInicialRef = useRef(false);
  // Rodadas cercanas (asistencia confirmada): al activar "Estoy en Ruta" se
  // revisa una sola vez, con el primer fix GPS, si hay alguna rodada donde el
  // usuario marcó "Voy" dentro de la ventana horaria y radio de 2 km (ver
  // GET /mapa/rodadas-cercanas). rodadaUnidaIdRef guarda a cuál se unió, si
  // eligió alguna, para mandarla junto con el recorrido al finalizar.
  const necesitaRevisarRodadaRef = useRef(false);
  const rodadaUnidaIdRef = useRef<number | null>(null);
  const holdCentrarTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdCentrarActivadoRef = useRef(false);
  const restauroModoRef = useRef(false);
  // Modo seguimiento: mientras esté activo, el mapa se recentra solo con cada
  // posición nueva del GPS (como la navegación de Google Maps). Se desactiva
  // apenas el usuario arrastra el mapa a mano (evento "dragstart", que Leaflet
  // solo dispara ante gestos del usuario, nunca ante un panTo/flyTo programático)
  // y se reactiva al tocar "Centrar en mi ubicación".
  const siguiendoRef = useRef(false);

  useEffect(() => {
    modoRef.current = modo;
  }, [modo]);
  useEffect(() => {
    puntosGrabadosRef.current = puntosGrabados;
  }, [puntosGrabados]);
  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  // Mi foto y estado (para mostrarme en el mapa apenas comparta ubicación).
  useEffect(() => {
    if (!token) return;
    apiGet<{ fotoUrl: string | null; estado: { texto: string } | null }>("/perfil/mio", token)
      .then((p) => {
        setMiFotoUrl(p.fotoUrl);
        setMiEstadoTexto(p.estado?.texto ?? null);
      })
      .catch(() => {});
  }, [token]);

  function registrarMovimiento(punto: { lat: number; lon: number }) {
    const anterior = ultimaPosSignificativaRef.current;
    const ahora: PuntoGps = { ...punto, timestamp: Date.now() };
    if (!anterior) {
      ultimaPosSignificativaRef.current = ahora;
      ultimoMovimientoEnRef.current = Date.now();
      return;
    }
    const distanciaKm = distanciaHaversineKm(anterior, ahora);
    if (distanciaKm >= KM_MOVIMIENTO_SIGNIFICATIVO) {
      ultimaPosSignificativaRef.current = ahora;
      ultimoMovimientoEnRef.current = Date.now();
      if (avisoInactividadRef.current) {
        continuarPatinando();
      }
      // Modo "Exploración": si el usuario arrastró el mapa a mano (seguimiento
      // apagado) y recién ahora se detecta que empezó a desplazarse de verdad
      // (no solo el ruido normal del GPS), se retoma el seguimiento solo.
      if (!siguiendoRef.current && mapRef.current) {
        mapRef.current.flyTo([punto.lat, punto.lon], mapRef.current.getZoom());
        siguiendoRef.current = true;
      }
    }
  }

  // Anti-trampa: compara el punto nuevo contra el último ya grabado. Si la
  // velocidad implícita supera KMH_VELOCIDAD_SOSPECHOSA de forma sostenida por
  // MS_VELOCIDAD_SOSPECHOSA_SOSTENIDA, descarta todo ese tramo (nada de lo
  // grabado desde que empezó a ir rápido cuenta como distancia patinada) y
  // pausa la grabación con un aviso — mismo criterio que la inactividad, pero
  // al revés. Devuelve true si acaba de pausar (para que el llamador no
  // agregue el punto sospechoso a la lista ya truncada).
  function revisarVelocidadSospechosa(puntoNuevo: PuntoGps): boolean {
    const anteriores = puntosGrabadosRef.current;
    const anterior = anteriores[anteriores.length - 1];
    if (!anterior) return false;

    const dtSeg = (puntoNuevo.timestamp - anterior.timestamp) / 1000;
    if (dtSeg <= 0) return false;
    const kmh = (distanciaHaversineKm(anterior, puntoNuevo) / dtSeg) * 3600;

    if (kmh <= KMH_VELOCIDAD_SOSPECHOSA) {
      inicioTramoRapidoRef.current = null;
      return false;
    }

    if (inicioTramoRapidoRef.current === null) {
      inicioTramoRapidoRef.current = anterior.timestamp;
      return false;
    }

    if (Date.now() - inicioTramoRapidoRef.current < MS_VELOCIDAD_SOSPECHOSA_SOSTENIDA) {
      return false;
    }

    const inicioTramo = inicioTramoRapidoRef.current;
    const puntosLimpios = anteriores.filter((p) => p.timestamp < inicioTramo);
    setPuntosGrabados(puntosLimpios);
    puntosGrabadosRef.current = puntosLimpios;
    setAvisoVelocidad(true);
    avisoVelocidadRef.current = true;
    // Push real (no solo el modal en pantalla): quien está patinando suele
    // llevar el celular guardado, con la pantalla apagada, así que el aviso
    // tiene que llegar como notificación del sistema, no solo como un modal
    // que nadie va a ver hasta sacar el teléfono.
    notificarme(tokenRef.current, {
      titulo: "⚠️ Recorrido pausado",
      cuerpo: "Detectamos una velocidad que no parece de patinaje. Revisa la app.",
      url: "/mapa",
    }).catch(() => {});
    return true;
  }

  function continuarTrasVelocidad() {
    inicioTramoRapidoRef.current = null;
    setAvisoVelocidad(false);
    avisoVelocidadRef.current = false;
  }

  // GPS: solo se activa mientras haya un modo seleccionado (privacidad primero).
  // Al desactivar un modo, la posición se borra de inmediato y el navegador deja
  // de usar el GPS para esta función.
  useEffect(() => {
    if (!modo) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPosicion(null);
      posicionRef.current = null;
      siguiendoRef.current = false;
      return;
    }
    if (!navigator.geolocation) {
      setErrorGeo("Tu navegador no soporta geolocalización.");
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const punto = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        posicionRef.current = punto;
        setPosicion(punto);
        setErrorGeo("");
        registrarMovimiento(punto);

        if (grabandoRef.current && !avisoVelocidadRef.current) {
          const puntoGrabado = { ...punto, timestamp: Date.now() };
          const acabaDePausar = revisarVelocidadSospechosa(puntoGrabado);
          if (!acabaDePausar) {
            setPuntosGrabados((prev) => [...prev, puntoGrabado]);
          }
        }

        if (necesitaEnvioInicialRef.current && tokenRef.current) {
          necesitaEnvioInicialRef.current = false;
          apiPost("/mapa/patinando", { ...punto, modo: modoRef.current }, tokenRef.current).catch(() => {});
        }

        if (necesitaRevisarRodadaRef.current && tokenRef.current) {
          necesitaRevisarRodadaRef.current = false;
          apiGet<RodadaCercana[]>(
            `/mapa/rodadas-cercanas?lat=${punto.lat}&lon=${punto.lon}`,
            tokenRef.current,
          )
            .then((candidatas) => {
              if (candidatas.length > 0) setCandidatasRodada(candidatas);
            })
            .catch(() => {});
        }

        if (necesitaCentrarInicialRef.current && mapRef.current) {
          necesitaCentrarInicialRef.current = false;
          mapRef.current.flyTo([punto.lat, punto.lon], ZOOM_CENTRADO_AUTOMATICO);
          siguiendoRef.current = true;
        } else if (siguiendoRef.current && mapRef.current) {
          // Modo seguimiento: recentra el mapa en cada posición nueva, como en
          // la navegación de Google Maps, mientras el usuario no lo haya
          // desactivado arrastrando el mapa a mano.
          mapRef.current.panTo([punto.lat, punto.lon]);
        }
      },
      () => setErrorGeo("No se pudo obtener tu ubicación (revisa los permisos)."),
      { enableHighAccuracy: true, maximumAge: 5000 },
    );

    return () => navigator.geolocation.clearWatch(watchId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modo]);

  // Ver quién más está patinando ahora (polling cada 15s).
  useEffect(() => {
    if (!token) return;

    async function cargarOtros() {
      try {
        const lista = await apiGet<OtroMiembro[]>("/mapa/patinando-ahora", token);
        setOtros(lista.filter((m) => m.miembroId !== sesion?.id));

        // Cada vez que se cambia de pestaña, SwipeNavigator desmonta y vuelve
        // a montar esta pantalla (misma ruta = mismo componente, pero el
        // estado local de React se pierde). Sin esto, "modo"/"posicion"
        // volvían a null y mi propio avatar desaparecía del mapa aunque el
        // backend todavía me tuviera como activo — se restaura una sola vez
        // por montaje a partir de mi propio registro en esta misma lista.
        if (!restauroModoRef.current) {
          restauroModoRef.current = true;
          const mia = lista.find((m) => m.miembroId === sesion?.id);
          if (mia && !modoRef.current) {
            setModo(mia.modo as Modo);
            setPosicion({ lat: mia.lat, lon: mia.lon });
            posicionRef.current = { lat: mia.lat, lon: mia.lon };
            // El prop `center` de MapContainer solo se usa al crear el mapa
            // (react-leaflet no lo reactualiza si cambia después) — sin este
            // `setView` explícito, el mapa se quedaba en el centro por
            // defecto mientras el marcador ya aparecía en la posición real.
            mapRef.current?.setView([mia.lat, mia.lon], ZOOM_CENTRADO_AUTOMATICO);
            siguiendoRef.current = true;
          }
        }
      } catch {
        // silencioso: no interrumpir la vista del mapa por un fallo de polling
      }
    }

    cargarOtros();
    const intervalo = setInterval(cargarOtros, 15000);
    return () => clearInterval(intervalo);
  }, [token, sesion?.id]);

  // Etiqueta SOS roja: emergencias activas de otros miembros con ubicación conocida.
  useEffect(() => {
    if (!token) return;

    async function cargarEmergencias() {
      try {
        const lista = await apiGet<EmergenciaActiva[]>("/emergencias/activas", token);
        setEmergenciasActivas(lista);
      } catch {
        // silencioso
      }
    }

    cargarEmergencias();
    const intervalo = setInterval(cargarEmergencias, 15000);
    return () => clearInterval(intervalo);
  }, [token]);

  // Mientras haya un modo activo, reenvía la ubicación cada 20s para no expirar (HORAS_VIGENCIA_PATINANDO).
  useEffect(() => {
    if (!modo || !token) return;

    const intervalo = setInterval(() => {
      if (posicionRef.current) {
        apiPost("/mapa/patinando", { ...posicionRef.current, modo }, token).catch(() => {});
      }
    }, 20000);

    return () => clearInterval(intervalo);
  }, [modo, token]);

  // Aviso de inactividad: revisa cada 30s si pasó el umbral sin movimiento significativo.
  useEffect(() => {
    if (!modo) return;

    const intervalo = setInterval(() => {
      if (avisoInactividadRef.current) return;
      const inactivoMs = Date.now() - ultimoMovimientoEnRef.current;
      if (inactivoMs >= MIN_AVISO_INACTIVIDAD * 60000) {
        setAvisoInactividad(true);
        avisoInactividadRef.current = true;
        cierreAutomaticoTimeoutRef.current = setTimeout(() => {
          finalizarModo();
        }, MIN_CIERRE_AUTOMATICO * 60000);
      }
    }, 30000);

    return () => clearInterval(intervalo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modo]);

  function activarModo(nuevoModo: "patinando" | "ruta") {
    setMensaje("");
    setLimiteRutasAlcanzado(false);
    necesitaEnvioInicialRef.current = true;
    necesitaCentrarInicialRef.current = true;
    ultimaPosSignificativaRef.current = null;
    ultimoMovimientoEnRef.current = Date.now();
    setResumen(null);
    setModo(nuevoModo);
    setMostrarPreguntaMapeo(true);
    rodadaUnidaIdRef.current = null;
    setCandidatasRodada([]);
    necesitaRevisarRodadaRef.current = nuevoModo === "ruta";
  }

  function unirseARodada(id: number) {
    rodadaUnidaIdRef.current = id;
    setCandidatasRodada([]);
  }

  // Atajo del banner "Tu rodada está por comenzar": a diferencia del botón
  // genérico "Estoy en Ruta" (que recién sabe a qué rodada unirse después de
  // detectarla por GPS y que el usuario confirme en un modal), acá ya
  // sabemos exactamente cuál es —por eso el banner puede mostrar su
  // nombre—, así que se activa el modo "ruta" (el único que puede generar
  // asistencia confirmada) y se une directo, sin repetir la detección ni
  // pedir una segunda confirmación.
  function unirseARodadaActiva() {
    if (!rodadaActiva) return;
    activarModo("ruta");
    necesitaRevisarRodadaRef.current = false;
    rodadaUnidaIdRef.current = rodadaActiva.id;
  }

  function descartarCandidatasRodada() {
    setCandidatasRodada([]);
  }

  // El mapeo de ruta ahora es independiente del modo elegido: se pregunta
  // apenas se activa cualquiera de los dos, en vez de asumirlo solo con "en ruta".
  function confirmarMapeoSi() {
    setPuntosGrabados([]);
    puntosGrabadosRef.current = [];
    inicioGrabacionRef.current = Date.now();
    grabandoRef.current = true;
    setGrabando(true);
    setMostrarPreguntaMapeo(false);
    inicioTramoRapidoRef.current = null;
    setAvisoVelocidad(false);
    avisoVelocidadRef.current = false;
  }

  function confirmarMapeoNo() {
    setMostrarPreguntaMapeo(false);
  }

  function continuarPatinando() {
    ultimoMovimientoEnRef.current = Date.now();
    if (cierreAutomaticoTimeoutRef.current) {
      clearTimeout(cierreAutomaticoTimeoutRef.current);
      cierreAutomaticoTimeoutRef.current = null;
    }
    setAvisoInactividad(false);
    avisoInactividadRef.current = false;
  }

  async function finalizarModo() {
    if (cierreAutomaticoTimeoutRef.current) {
      clearTimeout(cierreAutomaticoTimeoutRef.current);
      cierreAutomaticoTimeoutRef.current = null;
    }
    setAvisoInactividad(false);
    avisoInactividadRef.current = false;
    inicioTramoRapidoRef.current = null;
    setAvisoVelocidad(false);
    avisoVelocidadRef.current = false;

    const estabaGrabando = grabandoRef.current;
    const tokenActual = tokenRef.current;
    const modoActual = modo;
    setModo(null);
    setMostrarPreguntaMapeo(false);

    if (tokenActual) {
      try {
        await apiDelete("/mapa/patinando", tokenActual);
      } catch {
        // ya se limpia igual del lado del cliente
      }
    }

    if (estabaGrabando) {
      grabandoRef.current = false;
      setGrabando(false);

      const puntos = puntosGrabadosRef.current;
      const duracionSeg = Math.round((Date.now() - inicioGrabacionRef.current) / 1000);
      const distanciaKm = distanciaTotalKm(puntos);
      setResumen({ distanciaKm, duracionSeg });

      if (tokenActual && puntos.length >= 2) {
        try {
          await apiPost(
            "/mapa/recorridos",
            {
              tipo: modoActual === "ruta" ? "ruta" : "libre",
              distanciaKm,
              duracionSeg,
              puntos,
              publicacionId: rodadaUnidaIdRef.current ?? undefined,
            },
            tokenActual,
          );
        } catch (err) {
          setMensaje(err instanceof ApiError ? err.message : "No se pudo guardar el recorrido.");
          setLimiteRutasAlcanzado(err instanceof ApiError && err.status === 409);
        }
      }
    }

    rodadaUnidaIdRef.current = null;
    setCandidatasRodada([]);
  }

  // Detecta si tienes una rodada confirmada (RSVP "Voy") dentro de la ventana
  // de 30 min antes hasta 3h después (sección 5 y 11 del PDF), para ofrecer compartir
  // tu ubicación específicamente para esa rodada. Solo "rodada": "Estoy en Ruta" es
  // exclusivamente para registrar kilómetros oficiales por GPS, no para confirmar
  // asistencia a eventos/actividades (eso usa su propio flujo, ver comunidad/page.tsx).
  useEffect(() => {
    if (!token) return;

    async function revisarRodadaActiva() {
      try {
        const [publicaciones, misRsvps] = await Promise.all([
          apiGet<Publicacion[]>("/publicaciones", token),
          apiGet<Record<number, string>>("/publicaciones/mis-rsvps", token),
        ]);

        const encontrada = publicaciones.find((p) => {
          if (p.tipo !== "rodada") return false;
          if (!p.activaEnMapa || misRsvps[p.id] !== "yes") return false;
          const fechaHora = combinarFechaHora(p.fecha, p.hora);
          return fechaHora ? rodadaEnVentana(fechaHora) : false;
        });

        setRodadaActiva(encontrada ?? null);

        // Punto de partida en el mapa (rodada o evento): visible para quien
        // respondió "Voy"/"Tal vez", desde 30 min antes (sincronizado con el
        // recordatorio push) hasta la hora exacta de inicio puesta por el Admin.
        const puntos = publicaciones
          .filter((p) => {
            if (p.tipo !== "rodada" && p.tipo !== "evento") return false;
            if (!p.activaEnMapa) return false;
            if (p.puntoLat === null || p.puntoLon === null) return false;
            const estado = misRsvps[p.id];
            if (estado !== "yes" && estado !== "maybe") return false;
            const fechaHora = combinarFechaHora(p.fecha, p.hora);
            return fechaHora ? puntoPartidaVisible(fechaHora) : false;
          })
          .map((p) => ({
            id: p.id,
            tipo: p.tipo,
            titulo: p.titulo,
            lat: p.puntoLat as number,
            lon: p.puntoLon as number,
          }));
        setPuntosPartida(puntos);
      } catch {
        // silencioso
      }
    }

    revisarRodadaActiva();
    const intervalo = setInterval(revisarRodadaActiva, 60000);
    return () => clearInterval(intervalo);
  }, [token]);

  const centro: [number, number] = posicion ? [posicion.lat, posicion.lon] : CENTRO_DEFECTO;

  // "Estoy en Ruta" solo se ofrece cuando hay una rodada confirmada ("Voy") y
  // en su ventana horaria — es el único caso donde ese modo tiene sentido
  // (genera asistencia confirmada), así que ya no existe como opción genérica
  // aparte. "Patinando" sigue siempre disponible para salidas casuales.
  const rodadaFechaHora = rodadaActiva
    ? combinarFechaHora(rodadaActiva.fecha, rodadaActiva.hora)
    : null;
  const rodadaActivableAhora = rodadaFechaHora ? rodadaActivable(rodadaFechaHora) : false;
  const rodadaFaltanMin = rodadaFechaHora ? minutosHasta(rodadaFechaHora) : 0;

  function centrarEnMiUbicacion() {
    if (!posicion || !mapRef.current) return;
    mapRef.current.flyTo([posicion.lat, posicion.lon], mapRef.current.getZoom());
    siguiendoRef.current = true;
  }

  // Modo "Exploración": apenas el usuario arrastra el mapa a mano (ej. para
  // ver a otros patinadores cerca), se apaga el modo seguimiento (Leaflet
  // solo dispara "dragstart" ante un gesto real, nunca ante un
  // panTo/flyTo/setView programático). La cámara queda fija ahí — aunque el
  // GPS siga actualizando mi posición en segundo plano — hasta que el
  // usuario toque "Centrar en mi ubicación" o se detecte que empezó a
  // desplazarse de verdad (ver registrarMovimiento).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    function detenerSeguimiento() {
      siguiendoRef.current = false;
    }
    map.on("dragstart", detenerSeguimiento);
    return () => {
      map.off("dragstart", detenerSeguimiento);
    };
  }, []);

  // Mismo patrón tap-vs-hold que el botón central del bottom-nav: toque simple
  // centra el mapa, mantener presionado 1.5s abre el panel de "Mis rutas".
  function iniciarHoldCentrar() {
    holdCentrarActivadoRef.current = false;
    holdCentrarTimeoutRef.current = setTimeout(() => {
      holdCentrarActivadoRef.current = true;
      limpiarHoldCentrar();
      setMostrarMisRutas(true);
    }, HOLD_MS_CENTRAR);
  }

  function limpiarHoldCentrar() {
    if (holdCentrarTimeoutRef.current) clearTimeout(holdCentrarTimeoutRef.current);
    holdCentrarTimeoutRef.current = null;
  }

  function onPointerUpCentrar() {
    const seActivoElHold = holdCentrarActivadoRef.current;
    limpiarHoldCentrar();
    if (!seActivoElHold) {
      centrarEnMiUbicacion();
    }
  }

  // El contenedor del mapa cambia de tamaño al entrar/salir de pantalla completa;
  // Leaflet necesita que se le avise para no quedar con los tiles mal recortados.
  useEffect(() => {
    const id = setTimeout(() => mapRef.current?.invalidateSize(), 80);
    return () => clearTimeout(id);
  }, [pantallaCompleta]);

  function abrirEditorEstado() {
    setTextoEstadoForm(miEstadoTexto ?? "");
    setMostrarEditorEstado(true);
  }

  // Compartidas entre el Popup individual y la lista del cluster (mismas
  // acciones, dos puntos de entrada distintos).
  function abrirChatCon(m: OtroMiembro) {
    if (sesion?.id == null) return;
    setChatFlotante({
      sala: salaIndividual(sesion.id, m.miembroId),
      nombre: m.nombre,
      fotoUrl: m.fotoUrl,
    });
  }

  function abrirReconocimientoPara(m: OtroMiembro) {
    setTextoReconocimiento("");
    setReconocimientoEnviado(false);
    setReconocerA(m);
  }

  async function guardarEstadoMapa() {
    if (!token || !textoEstadoForm.trim()) return;
    setGuardandoEstado(true);
    try {
      await apiPut("/perfil/estado", { texto: textoEstadoForm.trim() }, token);
      setMiEstadoTexto(textoEstadoForm.trim());
      setMostrarEditorEstado(false);
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : "No se pudo publicar el estado.");
    } finally {
      setGuardandoEstado(false);
    }
  }

  async function quitarEstadoMapa() {
    if (!token) return;
    setGuardandoEstado(true);
    try {
      await apiDelete("/perfil/estado", token);
      setMiEstadoTexto(null);
      setMostrarEditorEstado(false);
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : "No se pudo quitar el estado.");
    } finally {
      setGuardandoEstado(false);
    }
  }

  async function enviarReconocimiento() {
    if (!token || !reconocerA || !textoReconocimiento.trim()) return;
    setEnviandoReconocimiento(true);
    try {
      await apiPost(
        `/perfil/${reconocerA.miembroId}/reconocimientos`,
        { texto: textoReconocimiento.trim() },
        token,
      );
      setReconocimientoEnviado(true);
      setTextoReconocimiento("");
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : "No se pudo enviar el reconocimiento.");
    } finally {
      setEnviandoReconocimiento(false);
    }
  }

  // Sobre el mapa estándar (calles claras) el negro se distingue mejor;
  // sobre la vista satelital (imágenes más oscuras/saturadas), el dorado
  // característico de la app es el que más resalta — se adapta solo.
  // Color vía estilo inline (no clase de Tailwind) para que gane sin
  // ambigüedad frente a cualquier otra regla de color en cascada.
  const estiloControlesMapa =
    capaMapa === "satelite"
      ? { color: "#e7c168", filter: "drop-shadow(0 1px 4px rgba(0,0,0,0.8))" }
      : { color: "#000000", filter: "drop-shadow(0 0 3px rgba(255,255,255,0.9))" };

  return (
    <div className={pantallaCompleta ? "fixed inset-0 z-50 bg-page-bg" : "flex flex-col gap-3"}>
      <div
        className={
          pantallaCompleta
            ? "relative isolate h-dvh w-full"
            : "card relative isolate overflow-hidden"
        }
        style={pantallaCompleta ? undefined : { height: 320 }}
      >
        <MapContainer
          ref={mapRef}
          center={centro}
          zoom={13}
          zoomControl={false}
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            key={capaMapa}
            attribution={CAPAS_MAPA[capaMapa].attribution}
            url={CAPAS_MAPA[capaMapa].url}
          />
          {capaMapa === "satelite" && (
            // Capa transparente con calles/nombres/límites, para no perder la
            // orientación sobre la imagen satelital (pedido del usuario).
            <TileLayer key="etiquetas-satelite" url={CAPA_ETIQUETAS_SATELITE_URL} />
          )}
          {posicion && (
            <Marker
              position={[posicion.lat, posicion.lon]}
              icon={crearIconoAvatar({
                fotoUrl: miFotoUrl,
                nombre: sesion?.nombre ?? "Yo",
                estado: miEstadoTexto,
                modo: modo ?? "patinando",
              })}
              eventHandlers={{ click: abrirEditorEstado }}
            />
          )}
          {gruposOtros.map((grupo) => {
            const representante = grupo[0];
            const extra = grupo.length - 1;
            return (
              <Marker
                key={representante.miembroId}
                position={[representante.lat, representante.lon]}
                icon={crearIconoAvatar({
                  fotoUrl: representante.fotoUrl,
                  nombre: representante.nombre,
                  estado: representante.estado,
                  modo: representante.modo,
                  masPersonas: extra > 0 ? extra : undefined,
                })}
                eventHandlers={extra > 0 ? { click: () => setClusterAbierto(grupo) } : undefined}
              >
                {extra === 0 && (
                  <Popup className="popup-patinador" closeButton={false}>
                    <PopupOtroMiembro
                      miembro={representante}
                      onAbrirChat={abrirChatCon}
                      onAbrirReconocimiento={abrirReconocimientoPara}
                    />
                  </Popup>
                )}
              </Marker>
            );
          })}
          {puntosPartida.map((p) => (
            <Marker key={`punto-${p.id}`} position={[p.lat, p.lon]} icon={iconoPuntoPartida}>
              <Popup closeButton={false}>
                <p className="text-xs font-semibold text-text-primary">
                  {p.tipo === "rodada" ? "Punto de partida de ruta" : "Punto del evento"}
                </p>
                <p className="text-xs text-text-secondary">{p.titulo}</p>
              </Popup>
            </Marker>
          ))}
          {puntosGrabados.length > 1 && (
            <Polyline
              positions={puntosGrabados.map((p) => [p.lat, p.lon])}
              pathOptions={{ color: "#C99A3D", weight: 4 }}
            />
          )}
          {emergenciasActivas
            .filter((e) => e.lat !== null && e.lon !== null)
            .map((e) => (
              <Marker key={e.id} position={[e.lat!, e.lon!]} icon={iconoEmergencia}>
                <Popup>
                  <div className="flex flex-col gap-1">
                    <p className="font-semibold text-red-700">
                      🚨 {e.nombre === sesion?.nombre ? "Tú" : e.nombre}
                    </p>
                    <p className="text-xs">
                      {ETIQUETA_MOTIVO[e.motivo as keyof typeof ETIQUETA_MOTIVO] ?? e.motivo}
                    </p>
                    <a href="tel:131" className="text-xs font-semibold text-red-700 underline">
                      Llamar 131
                    </a>
                  </div>
                </Popup>
              </Marker>
            ))}
        </MapContainer>

        {/* Controles del mapa: sin caja/fondo — íconos dorados flotando
            directo sobre el mapa, con solo una sombra suave para que se
            distingan del terreno de abajo (patrón tipo Google/Apple Maps),
            en vez de un bloque sólido compitiendo visualmente con el mapa. */}
        <div className="absolute bottom-2 right-2 z-[1000] flex flex-col items-center gap-2.5">
          {/* Zoom +/- ocultos en la vista normal (menos ruido visual, más
              espacio útil); solo aparecen en pantalla completa, donde hay
              espacio de sobra y tiene más sentido controlar el zoom a mano. */}
          {pantallaCompleta && (
            <>
              <button
                type="button"
                aria-label="Acercar"
                onClick={() => mapRef.current?.zoomIn()}
                className="flex h-9 w-9 items-center justify-center transition active:scale-90 hover:scale-110"
                style={estiloControlesMapa}
              >
                <IconPlus size={20} />
              </button>
              <button
                type="button"
                aria-label="Alejar"
                onClick={() => mapRef.current?.zoomOut()}
                className="flex h-9 w-9 items-center justify-center transition active:scale-90 hover:scale-110"
                style={estiloControlesMapa}
              >
                <IconMinus size={20} />
              </button>
            </>
          )}

          <button
            type="button"
            aria-label={
              capaMapa === "estandar" ? "Ver mapa en modo satélite" : "Ver mapa estándar"
            }
            onClick={() => setCapaMapa((c) => (c === "estandar" ? "satelite" : "estandar"))}
            className="flex h-9 w-9 items-center justify-center transition active:scale-90 hover:scale-110"
            style={estiloControlesMapa}
          >
            {capaMapa === "estandar" ? <IconSatellite size={20} /> : <IconMap2 size={20} />}
          </button>
          <button
            type="button"
            aria-label={pantallaCompleta ? "Salir de pantalla completa" : "Ver mapa en pantalla completa"}
            onClick={() => setPantallaCompleta((v) => !v)}
            className="flex h-9 w-9 items-center justify-center transition active:scale-90 hover:scale-110"
            style={estiloControlesMapa}
          >
            {pantallaCompleta ? <IconX size={20} /> : <IconMaximize size={20} />}
          </button>
          <button
            type="button"
            aria-label="Centrar en mi ubicación: mantén presionado para ver tus rutas"
            disabled={!posicion}
            onPointerDown={iniciarHoldCentrar}
            onPointerUp={onPointerUpCentrar}
            onPointerLeave={limpiarHoldCentrar}
            onPointerCancel={limpiarHoldCentrar}
            className="flex h-9 w-9 items-center justify-center transition active:scale-90 hover:scale-110 disabled:opacity-30"
            style={estiloControlesMapa}
          >
            <IconCurrentLocation size={20} />
          </button>
        </div>
      </div>

      {!pantallaCompleta && emergenciasActivas.length > 0 && (
        <div className="card border-fill-warning bg-red-700/10 p-3 text-xs text-fill-warning">
          🚨 {emergenciasActivas.length === 1 ? "Hay una emergencia activa" : `Hay ${emergenciasActivas.length} emergencias activas`} en el mapa.
        </div>
      )}

      {!pantallaCompleta && (
        <>
          {errorGeo && <p className="text-xs text-fill-warning">{errorGeo}</p>}
          {mensaje && (
            <p className="text-xs text-fill-warning">
              {mensaje}
              {limiteRutasAlcanzado && (
                <>
                  {" "}
                  <button
                    type="button"
                    onClick={() => setMostrarMisRutas(true)}
                    className="underline"
                  >
                    Ir a Mis rutas
                  </button>
                </>
              )}
            </p>
          )}

          {rodadaActiva && modo && (
            <p className="text-xs text-fill-success">
              Estás compartiendo tu ubicación para &quot;{rodadaActiva.titulo}&quot;.
            </p>
          )}

          <div className="card flex flex-col gap-2 p-4">
            <h2 className="text-sm font-semibold text-text-accent">Compartir mi ubicación</h2>
            {!modo ? (
              <>
                <p className="text-xs text-text-secondary">
                  Tu ubicación solo se usa mientras uno de estos modos está activo. Al finalizar,
                  desapareces del mapa y el GPS deja de usarse para esto.
                </p>
                {rodadaActiva && !rodadaActivableAhora && (
                  <p className="text-xs text-amber-text">
                    Confirmaste &quot;Voy&quot; a <strong>{rodadaActiva.titulo}</strong>. Podrás
                    compartir tu ubicación a partir de las {rodadaActiva.hora} (en{" "}
                    {rodadaFaltanMin} min).
                  </p>
                )}
                <div className="flex justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => activarModo("patinando")}
                    className="w-[45%] transition-transform active:scale-95"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/boton-patinando.png"
                      alt="Estoy patinando ahora"
                      className="h-auto w-full object-contain drop-shadow-[0_3px_6px_rgba(0,0,0,0.5)]"
                    />
                  </button>
                  {rodadaActiva && rodadaActivableAhora && (
                    <button
                      type="button"
                      onClick={unirseARodadaActiva}
                      className="w-[45%] transition-transform active:scale-95"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src="/boton-estoy-en-ruta.png"
                        alt="Estoy en ruta"
                        className="h-auto w-full object-contain drop-shadow-[0_3px_6px_rgba(0,0,0,0.5)]"
                      />
                    </button>
                  )}
                </div>
              </>
            ) : (
              <>
                <p className="text-xs text-fill-success">
                  {grabando
                    ? `Grabando tu ruta... ${puntosGrabados.length} puntos registrados.`
                    : "Estás compartiendo tu ubicación con la comunidad."}
                </p>
                {!posicion && (
                  <p className="text-xs text-text-secondary">Obteniendo tu ubicación por GPS...</p>
                )}
                <button
                  type="button"
                  onClick={finalizarModo}
                  className="card rounded-app px-4 py-2 text-sm text-fill-warning"
                >
                  {grabando ? "Finalizar recorrido" : "Terminar de patinar"}
                </button>
              </>
            )}

            {resumen && (
              <p className="text-xs text-fill-success">
                Recorrido guardado: {resumen.distanciaKm.toFixed(2)} km en{" "}
                {Math.round(resumen.duracionSeg / 60)} min.
              </p>
            )}
          </div>

          <PatinadoresActivosPanel
            patinadores={otros.filter((o) => o.modo === "patinando")}
          />
        </>
      )}

      {mostrarEditorEstado && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6"
          onClick={() => setMostrarEditorEstado(false)}
        >
          <div
            className="card flex w-full max-w-xs flex-col gap-3 p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-sm font-semibold text-text-accent">Tu estado en el mapa</h2>
            <textarea
              value={textoEstadoForm}
              onChange={(e) => setTextoEstadoForm(e.target.value.slice(0, 50))}
              maxLength={50}
              rows={2}
              placeholder="Ej: Descansando 5 min ☕"
              className="rounded-app border border-border bg-surface-2 px-3 py-2 text-sm text-text-primary outline-none"
            />
            <p className="text-right text-[10px] text-text-muted">{textoEstadoForm.length}/50</p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={guardandoEstado || !textoEstadoForm.trim()}
                onClick={guardarEstadoMapa}
                className="btn-hero flex-1 rounded-app px-4 py-2 text-sm disabled:opacity-50"
              >
                Guardar
              </button>
              {miEstadoTexto && (
                <button
                  type="button"
                  disabled={guardandoEstado}
                  onClick={quitarEstadoMapa}
                  className="rounded-app border border-border px-4 py-2 text-sm text-fill-warning"
                >
                  Quitar
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => setMostrarEditorEstado(false)}
              className="text-xs text-text-secondary underline"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {reconocerA && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6"
          onClick={() => setReconocerA(null)}
        >
          <div
            className="card flex w-full max-w-xs flex-col gap-3 p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-sm font-semibold text-text-accent">
              Reconocimiento para {reconocerA.nombre}
            </h2>
            {reconocimientoEnviado ? (
              <p className="text-sm text-green-500">¡Reconocimiento enviado!</p>
            ) : (
              <>
                <input
                  type="text"
                  autoFocus
                  placeholder="Ej: Tremendo avance 💪"
                  value={textoReconocimiento}
                  maxLength={MAX_CARACTERES_RECONOCIMIENTO}
                  onChange={(e) => setTextoReconocimiento(e.target.value)}
                  className="rounded-app border border-border bg-surface-2 px-3 py-2 text-sm text-text-primary outline-none"
                />
                <p className="text-right text-[10px] text-text-muted">
                  {textoReconocimiento.length}/{MAX_CARACTERES_RECONOCIMIENTO}
                </p>
                <button
                  type="button"
                  disabled={enviandoReconocimiento || !textoReconocimiento.trim()}
                  onClick={enviarReconocimiento}
                  className="btn-hero rounded-app px-4 py-2 text-sm disabled:opacity-50"
                >
                  {enviandoReconocimiento ? "Enviando..." : "Reconocer"}
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => setReconocerA(null)}
              className="text-xs text-text-secondary underline"
            >
              {reconocimientoEnviado ? "Cerrar" : "Cancelar"}
            </button>
          </div>
        </div>
      )}

      {clusterAbierto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6"
          onClick={() => setClusterAbierto(null)}
        >
          <div
            className="card flex w-full max-w-xs flex-col gap-2 p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-sm font-semibold text-text-accent">
              {clusterAbierto.length} patinadores en este punto
            </h2>
            <div className="flex flex-col gap-2">
              {clusterAbierto.map((m) => (
                <FilaMiembroCluster
                  key={m.miembroId}
                  miembro={m}
                  onAbrirChat={(miembro) => {
                    setClusterAbierto(null);
                    abrirChatCon(miembro);
                  }}
                  onAbrirReconocimiento={(miembro) => {
                    setClusterAbierto(null);
                    abrirReconocimientoPara(miembro);
                  }}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => setClusterAbierto(null)}
              className="text-xs text-text-secondary underline"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      {avisoInactividad && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6">
          <div className="card flex w-full max-w-xs flex-col gap-3 p-5">
            <h2 className="text-sm font-semibold text-text-accent">¿Has terminado tu patinada?</h2>
            <p className="text-xs text-text-secondary">
              No detectamos movimiento en los últimos {MIN_AVISO_INACTIVIDAD} minutos. Si no
              respondes, finalizaremos automáticamente en {MIN_CIERRE_AUTOMATICO} minutos.
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={finalizarModo}
                className="btn-hero rounded-app px-4 py-2 text-sm"
              >
                Finalizar recorrido
              </button>
              <button
                type="button"
                onClick={continuarPatinando}
                className="rounded-app border border-border px-4 py-2 text-sm text-text-primary"
              >
                Continuar patinando
              </button>
            </div>
          </div>
        </div>
      )}

      {avisoVelocidad && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6">
          <div className="card flex w-full max-w-xs flex-col gap-3 p-5">
            <h2 className="text-sm font-semibold text-text-accent">Velocidad no consistente con patinaje</h2>
            <p className="text-xs text-text-secondary">
              Detectamos una velocidad de más de {KMH_VELOCIDAD_SOSPECHOSA} km/h sostenida por varios
              minutos — no se está registrando como distancia patinada. Si fue un error, puedes reanudar.
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={continuarTrasVelocidad}
                className="btn-hero rounded-app px-4 py-2 text-sm"
              >
                Reanudar
              </button>
              <button
                type="button"
                onClick={finalizarModo}
                className="rounded-app border border-border px-4 py-2 text-sm text-text-primary"
              >
                Finalizar recorrido
              </button>
            </div>
          </div>
        </div>
      )}

      {mostrarPreguntaMapeo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6">
          <div className="card flex w-full max-w-xs flex-col gap-3 p-5">
            <h2 className="text-sm font-semibold text-text-accent">¿Quieres mapear tu ruta?</h2>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={confirmarMapeoSi}
                className="btn-hero rounded-app px-4 py-2 text-sm"
              >
                Sí, mapear ruta
              </button>
              <button
                type="button"
                onClick={confirmarMapeoNo}
                className="rounded-app border border-border px-4 py-2 text-sm text-text-primary"
              >
                No, gracias
              </button>
            </div>
          </div>
        </div>
      )}

      {candidatasRodada.length === 1 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6">
          <div className="card flex w-full max-w-xs flex-col gap-3 p-5">
            <h2 className="text-sm font-semibold text-text-accent">
              Se detectó la rodada &quot;{candidatasRodada[0].titulo}&quot;. ¿Deseas unirte?
            </h2>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => unirseARodada(candidatasRodada[0].id)}
                className="btn-hero rounded-app px-4 py-2 text-sm"
              >
                Unirse
              </button>
              <button
                type="button"
                onClick={descartarCandidatasRodada}
                className="rounded-app border border-border px-4 py-2 text-sm text-text-primary"
              >
                Ahora no
              </button>
            </div>
          </div>
        </div>
      )}

      {candidatasRodada.length > 1 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6">
          <div className="card flex w-full max-w-xs flex-col gap-3 p-5">
            <h2 className="text-sm font-semibold text-text-accent">
              Hay varias rodadas cerca. ¿A cuál te uniste?
            </h2>
            <div className="flex flex-col gap-2">
              {candidatasRodada.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => unirseARodada(r.id)}
                  className="flex flex-col rounded-app border border-border px-3 py-2 text-left text-sm text-text-primary"
                >
                  <span>{r.titulo}</span>
                  <span className="text-xs text-text-secondary">
                    {r.hora ? `${r.hora} · ` : ""}
                    {r.distanciaKm} km
                  </span>
                </button>
              ))}
              <button
                type="button"
                onClick={descartarCandidatasRodada}
                className="rounded-app border border-border px-4 py-2 text-sm text-text-secondary"
              >
                Ninguna es la mía
              </button>
            </div>
          </div>
        </div>
      )}

      {mostrarMisRutas && (
        <MisRutasPanel token={token} onClose={() => setMostrarMisRutas(false)} />
      )}

      {chatFlotante && (
        <ChatFlotante
          sala={chatFlotante.sala}
          nombreOtro={chatFlotante.nombre}
          fotoOtro={chatFlotante.fotoUrl}
          token={token}
          onClose={() => setChatFlotante(null)}
        />
      )}
    </div>
  );
}
