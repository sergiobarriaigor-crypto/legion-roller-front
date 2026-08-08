"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { IconMaximize, IconX, IconCurrentLocation, IconMap2, IconSatellite, IconCube3dSphere, IconPlus, IconMinus } from "@tabler/icons-react";
import type { Mapa3DHandle } from "@/components/Mapa/Mapa3D";
import { type OtroMiembro, ContenidoPopupMiembro } from "@/components/Mapa/TarjetaMiembroMapa";
import { htmlPuntoSimple, HTML_PUNTO_PARTIDA, htmlIconoAvatar, TAM_AVATAR } from "@/lib/iconosMapa";
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
import { obtenerSocket } from "@/lib/socket";
import { notificarme } from "@/lib/push";
import { iniciarSeguimientoUbicacion, obtenerPosicionActual } from "@/lib/geolocacionNativa";
import { PatinadoresActivosPanel } from "@/components/Mapa/PatinadoresActivosPanel";
import { MisRutasPanel } from "@/components/Mapa/MisRutasPanel";
import { ChatFlotante } from "@/components/Mapa/ChatFlotante";
import { MarcadorAnimado } from "@/components/Mapa/MarcadorAnimado";
import { useNoAutofill } from "@/lib/useNoAutofill";

const MAX_CARACTERES_RECONOCIMIENTO = 100;

// Centro por defecto: entre Puerto Montt y Puerto Varas (sección 1 del PDF).
const CENTRO_DEFECTO: [number, number] = [-41.4, -72.96];

// A nivel de módulo (no de estado de React) a propósito: SwipeNavigator
// desmonta y vuelve a montar esta pantalla al cambiar de pestaña, y con eso
// se perdía por completo hacia dónde el usuario había arrastrado el mapa a
// mano (ej. mirando patinadores en otra ciudad) — al volver al Mapa, la
// pantalla se recreaba desde cero y saltaba de nuevo a su propia ubicación,
// ignorando la exploración. Una variable de módulo sobrevive a ese
// desmontaje/remontaje (se reinicia solo con una recarga real de página).
let ultimaVistaMapa: { lat: number; lon: number; zoom: number } | null = null;
let siguiendoAlRemontar = true;

// También a nivel de módulo, y por el mismo motivo: la última posición GPS
// real conocida del usuario (no la cámara — su ubicación de verdad), para
// mostrarla de inmediato al reingresar a Mapa en vez de arrancar siempre del
// centro por defecto mientras se espera una nueva respuesta del GPS.
// `exploracionManualActiva` marca que el usuario arrastró el mapa a mano
// (independiente de si hay un modo activo); mientras esté en `true`, ni el
// centrado inicial ni la actualización silenciosa en segundo plano deben
// moverle la cámara — solo "Centrar en mi ubicación" la apaga.
let ultimaPosicionConocida: { lat: number; lon: number } | null = null;
let exploracionManualActiva = false;

// También a nivel de módulo, y por el mismo motivo (SwipeNavigator
// desmonta/remonta esta pantalla al cambiar de pestaña): la grabación GPS de
// "Patinando"/"Estoy en Ruta" en curso. Antes vivía solo en refs de React
// (grabandoRef, puntosGrabadosRef, inicioGrabacionRef), así que cada remontaje
// la reiniciaba a cero — el usuario seguía viendo "patinando" activo (eso sí
// se restauraba desde el backend), pero la grabación real había arrancado de
// nuevo, perdiendo los km/tiempo ya acumulados. Se limpia en activarModo (al
// empezar una grabación nueva) y en finalizarModo (al terminar); si no hay
// ninguna coincidente al restaurar `modo`, se asume que no hay nada que
// recuperar (ej. recarga real de página, no solo cambio de pestaña).
let grabacionActivaModulo: {
  modo: "patinando" | "ruta";
  puntos: PuntoGps[];
  inicioGrabacion: number;
  mapeado: boolean;
  rodadaUnidaId: number | null;
  // Mismo problema que con la grabación de puntos, pero para el aviso de
  // inactividad (ver más abajo): ultimoMovimientoEnRef es un ref de React
  // normal, así que cada remontaje lo reiniciaba a "ahora mismo" — el conteo
  // de MIN_AVISO_INACTIVIDAD nunca llegaba a acumularse de corrido si el
  // usuario cambiaba de pestaña aunque fuera una vez en medio, dejando
  // sesiones "activas" indefinidamente sin que saltara el aviso ni el cierre
  // automático. avisoInactividadDesde (no solo un booleano) permite recalcular
  // cuánto falta del cierre automático de MIN_CIERRE_AUTOMATICO si el
  // remontaje ocurre justo con el aviso ya mostrado.
  ultimoMovimientoEn: number;
  avisoInactividadDesde: number | null;
} | null = null;

// Si la nueva posición del GPS difiere de la que ya se muestra en menos de
// esto, no vale la pena animar la cámara — sería ruido de precisión del GPS,
// no un movimiento real.
const UMBRAL_ACTUALIZACION_KM = 0.03;

// Ajuste post-Fase 11: detección de inactividad para cerrar solo el recorrido.
const KM_MOVIMIENTO_SIGNIFICATIVO = 0.03; // ~30 metros
const MIN_AVISO_INACTIVIDAD = 25; // dentro del rango pedido (20 a 30 min)
const MIN_CIERRE_AUTOMATICO = 10;

// Retomar el modo Exploración: un solo salto de GPS que supere el umbral no
// alcanza para asumir que el usuario "empezó a patinar" — en interiores, o con
// GPS aproximado (Wi-Fi/IP, como en un navegador de escritorio sin chip GPS),
// una lectura puntual puede superarlo estando completamente quieto. Se exige
// que el desplazamiento se sostenga por unos segundos (mismo criterio que
// revisarVelocidadSospechosa con la velocidad sostenida) antes de mover la
// cámara y sacar al usuario del modo Exploración.
const MS_MOVIMIENTO_SOSTENIDO_EXPLORACION = 6000;

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

// Mismo radio que RADIO_ASISTENCIA_KM en mapa.service.ts (backend) — ahí se usa
// para detectar rodadas cercanas y validar asistencia después de terminar; acá
// se usa para exigir estar cerca del punto ANTES de dejar activar "Estoy en
// Ruta" (no hay forma de compartir la constante entre front/back en este
// proyecto, ver criterio ya usado con HORAS_VIGENCIA_PATINANDO).
const RADIO_ASISTENCIA_KM = 2;

// Mismo patrón de tap-vs-hold que el botón central del bottom-nav.
const HOLD_MS_CENTRAR = 1500;

// Envío de la posición propia mientras hay movimiento real: antes de esto
// solo existía el heartbeat de 20s (más abajo), así que quien te veía en el
// mapa notaba tu posición con hasta 20s de retraso sin importar qué tan
// rápido te movieras. Con este umbral, mientras patinás de verdad, tu
// posición llega a los demás casi en el momento -- el heartbeat de 20s sigue
// existiendo tal cual, para el caso de quedarse quieto (acá nunca se
// dispara porque la distancia no cambia).
const INTERVALO_MIN_ENVIO_MS = 3000;
const DISTANCIA_MIN_ENVIO_KM = 0.01; // ~10m

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

// "3d" no tiene url/attribution de tile raster (usa un estilo vectorial de
// MapLibre, ver Mapa3D.tsx) — solo "estandar"/"satelite" indexan CAPAS_MAPA.
type CapaMapa = keyof typeof CAPAS_MAPA | "3d";

// Capa de referencia (transparente, solo calles/nombres/límites) que se superpone
// a la vista satélite para no perder la orientación — mismo servicio gratuito de
// Esri, sin API key, pensado justo para combinarse con World_Imagery.
const CAPA_ETIQUETAS_SATELITE_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}";

// Cargado solo al tocar "3D" por primera vez (no en cada apertura del Mapa):
// maplibre-gl pesa varios cientos de KB y no tiene sentido bajarlo si nadie
// usa ese modo. Mismo patrón de dynamic(ssr:false) que ya usa
// app/(app)/mapa/page.tsx para este propio MapaView.
const Mapa3D = dynamic(() => import("@/components/Mapa/Mapa3D").then((m) => m.Mapa3D), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 z-[900] flex items-center justify-center bg-page-bg">
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-border border-t-fill-primary" />
    </div>
  ),
});

// Chequeo liviano (sin importar maplibre-gl) para decidir si se ofrece la
// opción "3D" en el selector de capas.
function soportaWebGL(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

type Modo = "patinando" | "ruta" | null;

interface RodadaCercana {
  id: number;
  titulo: string;
  hora: string | null;
  distanciaKm: number;
}

function crearIcono(color: string) {
  return L.divIcon({
    className: "",
    html: htmlPuntoSimple(color),
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
  html: HTML_PUNTO_PARTIDA,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

// Bajo este umbral, dos patinadores se consideran "el mismo punto" del mapa
// (~15 metros — el ancho de una plaza chica) y se agrupan en un solo marcador
// con insignia "+N" en vez de quedar superpuestos e inidentificables.
const UMBRAL_CLUSTER_KM = 0.015;

// Avatar circular (foto o inicial) con burbuja de estado opcional y un borde con
// brillo (glow) según el modo del miembro, para verse en el mapa mientras
// comparte su ubicación. El HTML en sí (compartido con el modo 3D) vive en
// @/lib/iconosMapa -- acá solo se envuelve en un L.divIcon.
function crearIconoAvatar(args: {
  fotoUrl: string | null;
  nombre: string;
  estado?: string | null;
  modo: string;
  masPersonas?: number;
}) {
  return L.divIcon({
    className: "",
    html: htmlIconoAvatar(args),
    iconSize: [TAM_AVATAR, TAM_AVATAR],
    iconAnchor: [TAM_AVATAR / 2, TAM_AVATAR / 2],
  });
}

// Tarjeta emergente al tocar la foto de otro patinador en el mapa: el
// formulario de reconocimiento se abre en un modal aparte (no dentro de este
// Popup de Leaflet) — un Popup se puede cerrar solo por gestos del mapa (clic
// fuera, reposicionamiento al abrirse el teclado en el celular, etc.), lo que
// hacía que el formulario desapareciera a mitad de escribir/enviar.
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

  function manejarAbrirChat(m: OtroMiembro) {
    map.closePopup();
    onAbrirChat(m);
  }

  function manejarAbrirReconocimiento(m: OtroMiembro) {
    map.closePopup();
    onAbrirReconocimiento(m);
  }

  return (
    <ContenidoPopupMiembro
      miembro={miembro}
      onAbrirChat={manejarAbrirChat}
      onAbrirReconocimiento={manejarAbrirReconocimiento}
    />
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
    <ContenidoPopupMiembro
      miembro={miembro}
      onAbrirChat={onAbrirChat}
      onAbrirReconocimiento={onAbrirReconocimiento}
      fondo="bg-surface-2"
    />
  );
}

export function MapaView() {
  const { sesion } = useSession();
  const token = sesion?.token ?? null;

  // Deep-link desde la campana ("tu rodada empieza pronto"): /mapa?lat=..&lon=..
  // centra la cámara ahí (ver `centro`/`zoomInicial` más abajo para el primer
  // ingreso, y el efecto de flyTo más abajo para cuando ya se estaba en el
  // mapa y se vuelve a tocar el aviso). `t` es un valor que cambia en cada
  // toque de la campana (ver AppHeader.tsx) — sin él, tocar el mismo aviso
  // dos veces seguidas no volvía a centrar la cámara, porque la URL quedaba
  // exactamente igual a la anterior (mismo lat/lon) y no había nada que
  // detectar como "cambio".
  const searchParams = useSearchParams();
  const latQueryRaw = searchParams.get("lat");
  const lonQueryRaw = searchParams.get("lon");
  const tQuery = searchParams.get("t");
  const latQuery = latQueryRaw !== null ? Number(latQueryRaw) : null;
  const lonQuery = lonQueryRaw !== null ? Number(lonQueryRaw) : null;
  const puntoQueryValido =
    latQuery !== null && lonQuery !== null && !Number.isNaN(latQuery) && !Number.isNaN(lonQuery);
  const puntoQueryCentradoRef = useRef<string | null>(null);

  const [posicion, setPosicion] = useState<{ lat: number; lon: number } | null>(null);
  // Solo true en el montaje realmente inicial de toda la sesión (sin vista de
  // cámara ni posición conocida todavía) — cubre el mapa hasta tener la
  // primera respuesta real del GPS, para no mostrar nunca el centro por
  // defecto (ver el efecto de centrado inicial más abajo).
  const [buscandoUbicacionInicial, setBuscandoUbicacionInicial] = useState(
    () => !ultimaVistaMapa && !ultimaPosicionConocida,
  );
  const [errorGeo, setErrorGeo] = useState("");
  // Mientras se pide el GPS para validar cercanía al punto de la rodada
  // antes de activar "Estoy en Ruta" (ver unirseARodadaActiva).
  const [verificandoCercaniaRodada, setVerificandoCercaniaRodada] = useState(false);
  const [otros, setOtros] = useState<OtroMiembro[]>([]);
  const [modo, setModo] = useState<Modo>(null);
  // "Patinar sin mapear": la grabación (grabandoRef) queda en true para
  // cualquier modo activo, mapeado o no (ver activarModo) — `mapeado` es lo
  // único que decide si el trazado se dibuja en vivo y si el detalle se
  // muestra después en Mis Rutas/Perfil.
  const [mapeado, setMapeado] = useState(false);
  const mapeadoRef = useRef(false);
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
  const [mostrarSelectorCapa, setMostrarSelectorCapa] = useState(false);
  const [centroPara3D, setCentroPara3D] = useState<{ lat: number; lon: number; zoom: number } | null>(
    null,
  );
  const [soportaWebGL3D] = useState(soportaWebGL);
  const mapa3DRef = useRef<Mapa3DHandle | null>(null);

  const [miFotoUrl, setMiFotoUrl] = useState<string | null>(null);
  const [miEstadoTexto, setMiEstadoTexto] = useState<string | null>(null);
  const [mostrarEditorEstado, setMostrarEditorEstado] = useState(false);
  const [textoEstadoForm, setTextoEstadoForm] = useState("");
  const noAutofillEstado = useNoAutofill();
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
  const noAutofillReconocimiento = useNoAutofill();
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
  // Envío de la posición propia mientras hay movimiento real (ver comentario
  // junto a INTERVALO_MIN_ENVIO_MS más abajo) -- independiente del heartbeat
  // de 20s que ya existe (ese solo evita que expire UbicacionActiva).
  const ultimoEnvioEnRef = useRef(0);
  const ultimaPosEnviadaRef = useRef<{ lat: number; lon: number } | null>(null);
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
  // Igual que inicioTramoRapidoRef, pero para el desplazamiento que retoma el
  // seguimiento del mapa tras el modo Exploración (ver registrarMovimiento).
  const inicioDesplazamientoExploracionRef = useRef<number | null>(null);
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

  // Mantiene en sincronía el ref local (para leer dentro de callbacks de
  // este montaje) y la variable de módulo (para que el próximo montaje, tras
  // un cambio de pestaña, sepa si debe volver a seguirte o respetar que
  // estabas explorando el mapa a mano).
  function marcarSiguiendo(valor: boolean) {
    siguiendoRef.current = valor;
    siguiendoAlRemontar = valor;
  }

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

  function registrarMovimiento(punto: { lat: number; lon: number }, precisionM: number) {
    const anterior = ultimaPosSignificativaRef.current;
    const ahora: PuntoGps = { ...punto, timestamp: Date.now() };
    if (!anterior) {
      ultimaPosSignificativaRef.current = ahora;
      ultimoMovimientoEnRef.current = Date.now();
      if (grabacionActivaModulo) grabacionActivaModulo.ultimoMovimientoEn = ultimoMovimientoEnRef.current;
      return;
    }
    const distanciaKm = distanciaHaversineKm(anterior, ahora);
    // El GPS de un teléfono puede "saltar" varias decenas de metros entre dos
    // lecturas aunque la persona esté completamente quieta (ubicación por
    // red/Wi-Fi, rebotes entre edificios, primeros fixes al activar el modo).
    // Sin este piso dinámico, ese ruido se confundía con "empezó a moverse de
    // verdad" y sacaba al usuario del modo Exploración apenas soltaba el dedo
    // del mapa — exactamente el reporte de que el mapa "siempre" se recentraba.
    // Se exige superar no solo KM_MOVIMIENTO_SIGNIFICATIVO sino también un
    // múltiplo de la precisión que el propio GPS reportó en esa lectura.
    const umbralKm = Math.max(KM_MOVIMIENTO_SIGNIFICATIVO, (precisionM * 1.5) / 1000);
    if (distanciaKm >= umbralKm) {
      ultimaPosSignificativaRef.current = ahora;
      ultimoMovimientoEnRef.current = Date.now();
      if (grabacionActivaModulo) grabacionActivaModulo.ultimoMovimientoEn = ultimoMovimientoEnRef.current;
      if (avisoInactividadRef.current) {
        continuarPatinando();
      }
      // Modo "Exploración": si el usuario arrastró el mapa a mano (seguimiento
      // apagado) y recién ahora se detecta que empezó a desplazarse de verdad
      // (no solo el ruido normal del GPS), se retoma el seguimiento solo — pero
      // recién cuando ese desplazamiento se sostiene por
      // MS_MOVIMIENTO_SOSTENIDO_EXPLORACION, no ante la primera lectura que
      // supera el umbral (ver constante arriba).
      if (!siguiendoRef.current && mapRef.current) {
        if (inicioDesplazamientoExploracionRef.current === null) {
          inicioDesplazamientoExploracionRef.current = Date.now();
        } else if (
          Date.now() - inicioDesplazamientoExploracionRef.current >=
          MS_MOVIMIENTO_SOSTENIDO_EXPLORACION
        ) {
          mapRef.current.flyTo([punto.lat, punto.lon], mapRef.current.getZoom());
          marcarSiguiendo(true);
          inicioDesplazamientoExploracionRef.current = null;
        }
      }
    } else {
      // La lectura no superó el umbral: si venía acumulando tiempo sostenido,
      // era ruido puntual del GPS, no un desplazamiento real. Se reinicia.
      inicioDesplazamientoExploracionRef.current = null;
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
    if (grabacionActivaModulo) grabacionActivaModulo.puntos = puntosLimpios;
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

  // Centrado por GPS (sin modo activo): cada vez que se monta esta pantalla
  // (primer ingreso, o al volver tras cambiar de pestaña) se pide la
  // posición real en segundo plano (getCurrentPosition, no watchPosition) y,
  // si difiere de lo que ya se ve, la cámara se desliza suavemente hasta
  // ahí — nunca hay un salto al centro por defecto ni una foto vieja
  // congelada: `centro`/`zoomInicial` (más abajo) ya arrancan mostrando
  // `ultimaVistaMapa` o `ultimaPosicionConocida` si existen, así que esta
  // consulta solo confirma/corrige, no es la única fuente de la vista
  // inicial. Nunca llama a /mapa/patinando ni guarda nada en el backend:
  // solo mueve la cámara local, así que no hace visible al usuario para
  // nadie más (eso solo pasa al activar un modo). Se aborta si hay un modo
  // activo o si el usuario está explorando el mapa a mano
  // (`exploracionManualActiva`), para no pelearle la cámara.
  useEffect(() => {
    if (modoRef.current || exploracionManualActiva) {
      setBuscandoUbicacionInicial(false);
      return;
    }
    let cancelado = false;
    obtenerPosicionActual({ timeout: 8000 })
      .then((pos) => {
        if (cancelado) return;
        const nueva = { lat: pos.lat, lon: pos.lon };
        const esPrimeraDeEstaSesion = !ultimaPosicionConocida;
        ultimaPosicionConocida = nueva;
        setBuscandoUbicacionInicial(false);
        if (modoRef.current || exploracionManualActiva || !mapRef.current) return;

        if (esPrimeraDeEstaSesion) {
          // Todavía no había nada visible (mapa cubierto por el indicador de
          // carga) — se ubica directo, sin animación, no hay nada de qué
          // "deslizarse" y ya se está ocultando el indicador en este mismo
          // instante.
          mapRef.current.setView([nueva.lat, nueva.lon], ZOOM_CENTRADO_AUTOMATICO);
          return;
        }

        const actual = mapRef.current.getCenter();
        const distanciaKm = distanciaHaversineKm(
          { lat: actual.lat, lon: actual.lng, timestamp: 0 },
          { lat: nueva.lat, lon: nueva.lon, timestamp: 0 },
        );
        if (distanciaKm > UMBRAL_ACTUALIZACION_KM) {
          mapRef.current.flyTo([nueva.lat, nueva.lon], mapRef.current.getZoom());
        }
      })
      .catch(() => {
        // sin permiso o sin señal: se deja de mostrar el indicador de carga
        // (si estaba) y el mapa se queda donde ya estaba (última vista
        // conocida o, si es la sesión recién empezando, el centro por defecto).
        if (!cancelado) setBuscandoUbicacionInicial(false);
      });
    return () => {
      cancelado = true;
    };
  }, []);

  // GPS: solo se activa mientras haya un modo seleccionado (privacidad primero).
  // Al desactivar un modo, la posición se borra de inmediato y el navegador deja
  // de usar el GPS para esta función.
  useEffect(() => {
    if (!modo) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPosicion(null);
      posicionRef.current = null;
      ultimoEnvioEnRef.current = 0;
      ultimaPosEnviadaRef.current = null;
      marcarSiguiendo(false);
      return;
    }
    const detener = iniciarSeguimientoUbicacion(
      (pos) => {
        const punto = { lat: pos.lat, lon: pos.lon };
        posicionRef.current = punto;
        setPosicion(punto);
        ultimaPosicionConocida = punto;
        setErrorGeo("");
        registrarMovimiento(punto, pos.accuracy);

        if (grabandoRef.current && !avisoVelocidadRef.current) {
          const puntoGrabado = { ...punto, timestamp: Date.now() };
          const acabaDePausar = revisarVelocidadSospechosa(puntoGrabado);
          if (!acabaDePausar) {
            setPuntosGrabados((prev) => [...prev, puntoGrabado]);
            if (grabacionActivaModulo) grabacionActivaModulo.puntos.push(puntoGrabado);
          }
        }

        if (necesitaEnvioInicialRef.current && tokenRef.current) {
          necesitaEnvioInicialRef.current = false;
          apiPost("/mapa/patinando", { ...punto, modo: modoRef.current }, tokenRef.current).catch(() => {});
          ultimoEnvioEnRef.current = Date.now();
          ultimaPosEnviadaRef.current = punto;
        } else if (tokenRef.current) {
          // Ver INTERVALO_MIN_ENVIO_MS/DISTANCIA_MIN_ENVIO_KM más arriba: esto
          // es lo que baja la latencia real de "los demás me ven moverme" --
          // el heartbeat de 20s de abajo sigue existiendo aparte, sin tocar.
          const ahora = Date.now();
          const pasoTiempoMinimo = ahora - ultimoEnvioEnRef.current >= INTERVALO_MIN_ENVIO_MS;
          const distanciaKm = ultimaPosEnviadaRef.current
            ? distanciaHaversineKm(
                { ...ultimaPosEnviadaRef.current, timestamp: 0 },
                { ...punto, timestamp: 0 },
              )
            : Infinity;
          if (pasoTiempoMinimo && distanciaKm >= DISTANCIA_MIN_ENVIO_KM) {
            ultimoEnvioEnRef.current = ahora;
            ultimaPosEnviadaRef.current = punto;
            apiPost("/mapa/patinando", { ...punto, modo: modoRef.current }, tokenRef.current).catch(() => {});
          }
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
          marcarSiguiendo(true);
        } else if (siguiendoRef.current && mapRef.current) {
          // Modo seguimiento: recentra el mapa en cada posición nueva, como en
          // la navegación de Google Maps, mientras el usuario no lo haya
          // desactivado arrastrando el mapa a mano.
          mapRef.current.panTo([punto.lat, punto.lon]);
        }
      },
      () => setErrorGeo("No se pudo obtener tu ubicación (revisa los permisos)."),
    );

    return () => detener();
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
            ultimaPosicionConocida = { lat: mia.lat, lon: mia.lon };
            siguiendoRef.current = siguiendoAlRemontar;
            // Solo recentra si el usuario estaba en modo seguimiento antes de
            // cambiar de pestaña. Si estaba explorando el mapa a mano (ej.
            // mirando patinadores en otra ciudad), `ultimaVistaMapa` ya deja el
            // mapa recién creado justo donde lo había dejado (ver `centro` más
            // abajo) — forzar el centrado acá lo habría ignorado por completo.
            if (siguiendoAlRemontar) {
              mapRef.current?.setView([mia.lat, mia.lon], ZOOM_CENTRADO_AUTOMATICO);
            }

            // Además de restaurar lo visual, retoma la grabación real de km/
            // tiempo si venía en curso desde antes del remontaje (ver
            // grabacionActivaModulo). Sin esto, grabandoRef quedaba en false
            // y toda la sesión perdía su distancia/duración apenas el
            // usuario cambiaba de pestaña y volvía. Si no hay nada
            // coincidente guardado (ej. recarga real de página), no hay
            // nada que recuperar — se queda como antes.
            if (grabacionActivaModulo && grabacionActivaModulo.modo === mia.modo) {
              setPuntosGrabados(grabacionActivaModulo.puntos);
              puntosGrabadosRef.current = grabacionActivaModulo.puntos;
              inicioGrabacionRef.current = grabacionActivaModulo.inicioGrabacion;
              grabandoRef.current = true;
              mapeadoRef.current = grabacionActivaModulo.mapeado;
              setMapeado(grabacionActivaModulo.mapeado);
              rodadaUnidaIdRef.current = grabacionActivaModulo.rodadaUnidaId;

              // Mismo motivo que arriba, pero para el aviso de inactividad:
              // ultimoMovimientoEnRef es un ref normal, así que sin esto
              // volvía a "ahora mismo" en cada remontaje y los 25 minutos de
              // MIN_AVISO_INACTIVIDAD nunca llegaban a acumularse de corrido
              // si el usuario cambiaba de pestaña — dejando sesiones activas
              // indefinidamente sin que saltara el aviso ni el cierre
              // automático. Si el remontaje ocurre justo con el aviso ya
              // mostrado, se recalcula cuánto queda del cierre automático (o
              // se cierra ya mismo si ese plazo ya se cumplió).
              ultimoMovimientoEnRef.current = grabacionActivaModulo.ultimoMovimientoEn;
              if (grabacionActivaModulo.avisoInactividadDesde !== null) {
                const avisoDesde = grabacionActivaModulo.avisoInactividadDesde;
                avisoInactividadRef.current = true;
                setAvisoInactividad(true);
                const restanteMs = MIN_CIERRE_AUTOMATICO * 60000 - (Date.now() - avisoDesde);
                if (restanteMs <= 0) {
                  finalizarModo();
                } else {
                  cierreAutomaticoTimeoutRef.current = setTimeout(() => {
                    finalizarModo();
                  }, restanteMs);
                }
              }
            }
          }
        }
      } catch {
        // silencioso: no interrumpir la vista del mapa por un fallo de polling
      }
    }

    cargarOtros();
    // La sincronización en vivo ahora la hace el socket (ver el próximo
    // useEffect, evento "mapa:ubicacion"/"mapa:detener") -- este polling
    // queda solo como respaldo de reconciliación (una desconexión breve del
    // socket, o alguien que expiró en el backend sin avisar), por eso el
    // intervalo se alargó bastante respecto al valor original (15s).
    const intervalo = setInterval(cargarOtros, 45000);
    return () => clearInterval(intervalo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, sesion?.id]);

  // Sincronización en vivo de "otros" por WebSocket -- baja la latencia de
  // ~15s (polling) a casi inmediata. cargarOtros (arriba) sigue haciendo la
  // carga inicial al montar y la restauración de "mi modo" tras remontar.
  useEffect(() => {
    if (!token) return;
    const socket = obtenerSocket(token);

    function alRecibirUbicacion(actualizado: OtroMiembro) {
      if (actualizado.miembroId === sesion?.id) return;
      setOtros((prev) => {
        const index = prev.findIndex((m) => m.miembroId === actualizado.miembroId);
        if (index === -1) return [...prev, actualizado];
        const copia = [...prev];
        copia[index] = actualizado;
        return copia;
      });
    }

    function alRecibirDetencion({ miembroId }: { miembroId: number }) {
      setOtros((prev) => prev.filter((m) => m.miembroId !== miembroId));
    }

    socket.on("mapa:ubicacion", alRecibirUbicacion);
    socket.on("mapa:detener", alRecibirDetencion);
    return () => {
      socket.off("mapa:ubicacion", alRecibirUbicacion);
      socket.off("mapa:detener", alRecibirDetencion);
    };
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
        if (grabacionActivaModulo) grabacionActivaModulo.avisoInactividadDesde = Date.now();
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

    // El GPS se graba desde el instante en que se activa el modo, sin
    // esperar a que el usuario conteste "¿mapear?" — si no, se perderían los
    // puntos de ese lapso. "Patinar sin mapear" también necesita esta
    // grabación (para estadísticas y, si corresponde, validar asistencia a
    // una rodada); lo único que decide `mapeado` es si el trazado se dibuja
    // y se muestra después (ver confirmarMapeoSi/No).
    setPuntosGrabados([]);
    puntosGrabadosRef.current = [];
    inicioGrabacionRef.current = Date.now();
    grabandoRef.current = true;
    mapeadoRef.current = false;
    setMapeado(false);
    inicioTramoRapidoRef.current = null;
    setAvisoVelocidad(false);
    avisoVelocidadRef.current = false;
    grabacionActivaModulo = {
      modo: nuevoModo,
      puntos: [],
      inicioGrabacion: inicioGrabacionRef.current,
      mapeado: false,
      rodadaUnidaId: null,
      ultimoMovimientoEn: ultimoMovimientoEnRef.current,
      avisoInactividadDesde: null,
    };
  }

  function unirseARodada(id: number) {
    rodadaUnidaIdRef.current = id;
    setCandidatasRodada([]);
    if (grabacionActivaModulo) grabacionActivaModulo.rodadaUnidaId = id;
  }

  // Atajo del banner "Tu rodada está por comenzar": a diferencia del botón
  // genérico "Estoy en Ruta" (que recién sabe a qué rodada unirse después de
  // detectarla por GPS y que el usuario confirme en un modal), acá ya
  // sabemos exactamente cuál es —por eso el banner puede mostrar su
  // nombre—, así que se activa el modo "ruta" (el único que puede generar
  // asistencia confirmada) y se une directo, sin repetir la detección ni
  // pedir una segunda confirmación.
  function unirseYActivarRuta(rodada: Publicacion) {
    activarModo("ruta");
    necesitaRevisarRodadaRef.current = false;
    rodadaUnidaIdRef.current = rodada.id;
    if (grabacionActivaModulo) grabacionActivaModulo.rodadaUnidaId = rodada.id;
  }

  // Exige estar cerca del punto de encuentro real (marcado por el Admin con
  // GPS) para poder activar "Estoy en Ruta" — antes esa cercanía solo se
  // detectaba/validaba después de terminar el recorrido, nunca bloqueaba el
  // botón. Si la rodada no tiene un punto GPS cargado (quedó solo el texto
  // libre "puntoEncuentro"), no hay contra qué validar y se activa directo,
  // como siempre.
  async function unirseARodadaActiva() {
    if (!rodadaActiva) return;
    const rodada = rodadaActiva;
    if (rodada.puntoLat === null || rodada.puntoLon === null) {
      unirseYActivarRuta(rodada);
      return;
    }
    setErrorGeo("");
    setVerificandoCercaniaRodada(true);
    try {
      const pos = await obtenerPosicionActual({ enableHighAccuracy: true, timeout: 10000 });
      setVerificandoCercaniaRodada(false);
      const distanciaKm = distanciaHaversineKm(
        { lat: pos.lat, lon: pos.lon, timestamp: 0 },
        { lat: rodada.puntoLat as number, lon: rodada.puntoLon as number, timestamp: 0 },
      );
      if (distanciaKm > RADIO_ASISTENCIA_KM) {
        setErrorGeo(
          `Estás a ${distanciaKm.toFixed(1)} km del punto de encuentro. Acércate (menos de ${RADIO_ASISTENCIA_KM} km) para activar "Estoy en Ruta".`,
        );
        return;
      }
      unirseYActivarRuta(rodada);
    } catch {
      setVerificandoCercaniaRodada(false);
      setErrorGeo("No pudimos confirmar tu ubicación (revisa los permisos) para validar la cercanía. Inténtalo de nuevo.");
    }
  }

  function descartarCandidatasRodada() {
    setCandidatasRodada([]);
  }

  // El mapeo de ruta ahora es independiente del modo elegido: se pregunta
  // apenas se activa cualquiera de los dos, en vez de asumirlo solo con "en
  // ruta". La grabación en sí ya está en curso desde activarModo — acá solo
  // se decide si el trazado se dibuja/muestra.
  function confirmarMapeoSi() {
    mapeadoRef.current = true;
    setMapeado(true);
    setMostrarPreguntaMapeo(false);
    if (grabacionActivaModulo) grabacionActivaModulo.mapeado = true;
  }

  function confirmarMapeoNo() {
    mapeadoRef.current = false;
    setMapeado(false);
    setMostrarPreguntaMapeo(false);
    if (grabacionActivaModulo) grabacionActivaModulo.mapeado = false;
  }

  function continuarPatinando() {
    ultimoMovimientoEnRef.current = Date.now();
    if (grabacionActivaModulo) {
      grabacionActivaModulo.ultimoMovimientoEn = ultimoMovimientoEnRef.current;
      grabacionActivaModulo.avisoInactividadDesde = null;
    }
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

    const tokenActual = tokenRef.current;
    const modoActual = modo;
    const eraMapeado = mapeadoRef.current;
    setModo(null);
    setMostrarPreguntaMapeo(false);
    grabandoRef.current = false;
    grabacionActivaModulo = null;

    if (tokenActual) {
      try {
        await apiDelete("/mapa/patinando", tokenActual);
      } catch {
        // ya se limpia igual del lado del cliente
      }
    }

    // Ya no depende de si se eligió mapear: toda actividad "Patinando"/"Estoy
    // en Ruta" registra km/tiempo, se haya mostrado el trazado o no (ver
    // activarModo, que graba desde el inicio del modo en ambos casos).
    const puntos = puntosGrabadosRef.current;
    const duracionSeg = Math.round((Date.now() - inicioGrabacionRef.current) / 1000);
    const distanciaKm = distanciaTotalKm(puntos);

    if (tokenActual && puntos.length >= 2) {
      try {
        const resultado = await apiPost<{ guardado?: boolean; guardadoDetalle?: boolean }>(
          "/mapa/recorridos",
          {
            tipo: modoActual === "ruta" ? "ruta" : "libre",
            distanciaKm,
            duracionSeg,
            puntos,
            mapeado: eraMapeado,
            publicacionId: rodadaUnidaIdRef.current ?? undefined,
          },
          tokenActual,
        );
        // guardado === false: sesión demasiado corta (toque accidental), el
        // backend no guardó nada — no hay resumen que mostrar.
        if (resultado?.guardado !== false) {
          setResumen({ distanciaKm, duracionSeg });
          if (resultado?.guardadoDetalle === false) {
            setMensaje(
              "Tus estadísticas se guardaron, pero no el detalle de esta ruta: alcanzaste el máximo de 10 rutas mapeadas en Mis Rutas.",
            );
            setLimiteRutasAlcanzado(true);
          }
        }
      } catch (err) {
        setMensaje(err instanceof ApiError ? err.message : "No se pudo guardar el recorrido.");
        setLimiteRutasAlcanzado(err instanceof ApiError && err.status === 409);
      }
    }

    mapeadoRef.current = false;
    setMapeado(false);
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

  // `ultimaVistaMapa` (si existe) manda: es la vista real que el usuario
  // dejó antes de que SwipeNavigator desmontara esta pantalla (incluye tanto
  // exploración manual como un centrado automático anterior), y tiene
  // prioridad para no secuestrar una exploración en curso. Si no hay vista
  // guardada pero sí una posición GPS conocida de esta sesión, se muestra de
  // inmediato — así nunca se vuelve a ver el centro por defecto al
  // reingresar, mientras el efecto de arriba confirma/actualiza en segundo
  // plano. Solo se cae a `CENTRO_DEFECTO` en el montaje realmente inicial de
  // toda la sesión, y ese caso queda cubierto por el indicador de carga
  // (`buscandoUbicacionInicial`) mientras se espera la primera respuesta.
  const centro: [number, number] = puntoQueryValido
    ? [latQuery as number, lonQuery as number]
    : ultimaVistaMapa
      ? [ultimaVistaMapa.lat, ultimaVistaMapa.lon]
      : ultimaPosicionConocida
        ? [ultimaPosicionConocida.lat, ultimaPosicionConocida.lon]
        : posicion
          ? [posicion.lat, posicion.lon]
          : CENTRO_DEFECTO;
  const zoomInicial = puntoQueryValido
    ? ZOOM_CENTRADO_AUTOMATICO
    : (ultimaVistaMapa?.zoom ?? (ultimaPosicionConocida ? ZOOM_CENTRADO_AUTOMATICO : 13));

  // Si ya se estaba en /mapa y se vuelve a tocar el aviso de la campana
  // (mismos route, nuevos query params — Next no remonta el componente), el
  // `centro` de arriba (solo usado al crear el <MapContainer>) no alcanza;
  // hay que mover la cámara a mano. El ref evita repetir el flyTo en cada
  // render mientras el valor de la URL no cambie. Se trata como una
  // exploración manual (mismo criterio que arrastrar el mapa) para que no la
  // pise el seguimiento automático si hay un modo activo en otra pestaña.
  useEffect(() => {
    if (!puntoQueryValido || !mapRef.current) return;
    const clave = `${latQuery},${lonQuery},${tQuery ?? ""}`;
    if (puntoQueryCentradoRef.current === clave) return;
    puntoQueryCentradoRef.current = clave;
    mapRef.current.flyTo([latQuery as number, lonQuery as number], ZOOM_CENTRADO_AUTOMATICO);
    marcarSiguiendo(false);
    exploracionManualActiva = true;
  }, [latQuery, lonQuery, puntoQueryValido, tQuery]);

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
    exploracionManualActiva = false;
    inicioDesplazamientoExploracionRef.current = null;
    // Sin un modo activo, `posicion` está vacío (privacidad primero); en ese
    // caso se usa la última posición GPS real que sí se conoce igual (ver
    // efecto de centrado por GPS más arriba), para que el botón funcione
    // también cuando el usuario solo está mirando el mapa sin "Patinando".
    const punto = posicion ?? ultimaPosicionConocida;
    if (!punto) return;
    if (capaMapa === "3d") {
      mapa3DRef.current?.centrarEn(punto.lat, punto.lon);
      return;
    }
    if (!mapRef.current) return;
    mapRef.current.flyTo([punto.lat, punto.lon], mapRef.current.getZoom());
    marcarSiguiendo(true);
  }

  // Traspaso de cámara entre Leaflet y MapLibre para que cambiar de capa no
  // salte de posición: al entrar a "3d" se lee dónde estaba mirando Leaflet
  // para arrancar el mapa 3D ahí mismo; al salir, se escribe la cámara de
  // MapLibre en `ultimaVistaMapa` (la misma variable de módulo que ya usa
  // este archivo para sobrevivir los remontajes de SwipeNavigator), así el
  // cálculo de `centro`/`zoomInicial` de más abajo la recoge solo al volver
  // a montar <MapContainer>.
  function seleccionarCapa(nueva: CapaMapa) {
    setMostrarSelectorCapa(false);
    if (nueva === capaMapa) return;
    if (capaMapa === "3d") {
      const camara = mapa3DRef.current?.getCamara();
      if (camara) ultimaVistaMapa = camara;
    } else if (nueva === "3d" && mapRef.current) {
      const c = mapRef.current.getCenter();
      setCentroPara3D({ lat: c.lat, lon: c.lng, zoom: mapRef.current.getZoom() });
    }
    setCapaMapa(nueva);
  }

  function alFallarMapa3D() {
    setCapaMapa("estandar");
    setMensaje("No se pudo cargar el mapa 3D en este dispositivo.");
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
      marcarSiguiendo(false);
      exploracionManualActiva = true;
      inicioDesplazamientoExploracionRef.current = null;
    }
    // Guarda continuamente dónde quedó la cámara (propia o de exploración) en
    // `ultimaVistaMapa`, para que si SwipeNavigator desmonta esta pantalla al
    // cambiar de pestaña, el próximo montaje recree el mapa exactamente ahí
    // en vez de saltar al centro por defecto o a mi propia ubicación.
    function guardarVista() {
      if (!map) return;
      const c = map.getCenter();
      ultimaVistaMapa = { lat: c.lat, lon: c.lng, zoom: map.getZoom() };
    }
    map.on("dragstart", detenerSeguimiento);
    map.on("moveend", guardarVista);
    return () => {
      map.off("dragstart", detenerSeguimiento);
      map.off("moveend", guardarVista);
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
    capaMapa === "satelite" || capaMapa === "3d"
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
        {capaMapa === "3d" && (
          <Mapa3D
            ref={mapa3DRef}
            centroInicial={
              centroPara3D ?? { lat: centro[0], lon: centro[1], zoom: zoomInicial }
            }
            posicion={posicion}
            miFotoUrl={miFotoUrl}
            miNombre={sesion?.nombre ?? "Yo"}
            miEstadoTexto={miEstadoTexto}
            miModo={modo}
            onClickMiMarcador={abrirEditorEstado}
            gruposOtros={gruposOtros}
            onAbrirChat={abrirChatCon}
            onAbrirReconocimiento={abrirReconocimientoPara}
            onAbrirCluster={(grupo) => setClusterAbierto(grupo)}
            puntosPartida={puntosPartida}
            puntosGrabados={puntosGrabados}
            mapeado={mapeado}
            emergenciasActivas={emergenciasActivas}
            pantallaCompleta={pantallaCompleta}
            onError={alFallarMapa3D}
          />
        )}
        {capaMapa !== "3d" && (
        <MapContainer
          ref={mapRef}
          center={centro}
          zoom={zoomInicial}
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
              <MarcadorAnimado
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
              </MarcadorAnimado>
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
          {mapeado && puntosGrabados.length > 1 && (
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
        )}

        {/* Cubre el mapa (que por debajo ya está en CENTRO_DEFECTO) mientras se
            espera la primera respuesta real del GPS de toda la sesión, para
            que el usuario nunca llegue a ver ese centro por defecto. */}
        {buscandoUbicacionInicial && (
          <div className="absolute inset-0 z-[1000] flex flex-col items-center justify-center gap-2 bg-page-bg">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-border border-t-fill-primary" />
            <p className="text-sm text-text-secondary">Buscando tu ubicación...</p>
          </div>
        )}

        {mostrarSelectorCapa && (
          <div
            className="absolute inset-0 z-[999]"
            onClick={() => setMostrarSelectorCapa(false)}
          />
        )}

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

          <div className="relative">
            <button
              type="button"
              aria-label="Elegir capa del mapa"
              onClick={() => setMostrarSelectorCapa((v) => !v)}
              className="flex h-9 w-9 items-center justify-center transition active:scale-90 hover:scale-110"
              style={estiloControlesMapa}
            >
              {capaMapa === "estandar" && <IconMap2 size={20} />}
              {capaMapa === "satelite" && <IconSatellite size={20} />}
              {capaMapa === "3d" && <IconCube3dSphere size={20} />}
            </button>
            {mostrarSelectorCapa && (
              <div className="card absolute bottom-11 right-0 z-10 flex w-36 flex-col gap-0.5 p-1.5">
                <button
                  type="button"
                  onClick={() => seleccionarCapa("estandar")}
                  className={`flex items-center gap-2 rounded-[var(--radius)] px-2.5 py-1.5 text-left text-xs ${capaMapa === "estandar" ? "bg-amber-bg text-amber-text" : "text-text-secondary"}`}
                >
                  <IconMap2 size={16} /> Estándar
                </button>
                <button
                  type="button"
                  onClick={() => seleccionarCapa("satelite")}
                  className={`flex items-center gap-2 rounded-[var(--radius)] px-2.5 py-1.5 text-left text-xs ${capaMapa === "satelite" ? "bg-amber-bg text-amber-text" : "text-text-secondary"}`}
                >
                  <IconSatellite size={16} /> Satélite
                </button>
                {soportaWebGL3D && (
                  <button
                    type="button"
                    onClick={() => seleccionarCapa("3d")}
                    className={`flex items-center gap-2 rounded-[var(--radius)] px-2.5 py-1.5 text-left text-xs ${capaMapa === "3d" ? "bg-amber-bg text-amber-text" : "text-text-secondary"}`}
                  >
                    <IconCube3dSphere size={16} /> 3D
                  </button>
                )}
              </div>
            )}
          </div>
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
        <div className="card -mx-4 border-fill-warning bg-red-700/10 px-3 py-3 text-xs text-fill-warning">
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

          <div className="card -mx-4 flex flex-col gap-2 px-3 py-4">
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
                      disabled={verificandoCercaniaRodada}
                      className="w-[45%] transition-transform active:scale-95 disabled:opacity-60"
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
                {verificandoCercaniaRodada && (
                  <p className="text-center text-xs text-text-secondary">
                    Verificando tu cercanía al punto de encuentro...
                  </p>
                )}
              </>
            ) : (
              <>
                <p className="text-xs text-fill-success">
                  {mapeado
                    ? `Grabando tu ruta... ${puntosGrabados.length} puntos registrados.`
                    : "Patinando sin mapear el trazado. Tu distancia y tiempo se están registrando igual."}
                </p>
                {!posicion && (
                  <p className="text-xs text-text-secondary">Obteniendo tu ubicación por GPS...</p>
                )}
                <button
                  type="button"
                  onClick={finalizarModo}
                  className="card rounded-app px-4 py-2 text-sm text-fill-warning"
                >
                  {mapeado ? "Finalizar recorrido" : "Terminar de patinar"}
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
              autoComplete="off"
              {...noAutofillEstado}
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
                  autoComplete="off"
                  {...noAutofillReconocimiento}
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
