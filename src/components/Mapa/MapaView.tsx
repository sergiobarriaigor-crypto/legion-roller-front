"use client";

import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { IconMaximize, IconX, IconCurrentLocation, IconMap2, IconSatellite, IconMessage2, IconHeartHandshake, IconPlus, IconMinus } from "@tabler/icons-react";
import { useSession } from "@/context/SessionContext";
import { apiPost, apiPut, apiGet, apiDelete, ApiError } from "@/lib/api";
import { distanciaTotalKm, distanciaHaversineKm, type PuntoGps } from "@/lib/geo";
import type { Publicacion } from "@/lib/publicaciones";
import { combinarFechaHora, rodadaEnVentana, rodadaActivable, minutosHasta } from "@/lib/rodadas";
import { ETIQUETA_MOTIVO, type EmergenciaActiva } from "@/lib/emergencias";
import { salaIndividual } from "@/lib/chat";
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

// Colores neón por modo (ajuste de este pedido): verde = en ruta, rojo = solo
// patinando ahora, para identificar el estado de cada patinador de un vistazo.
const GLOW_POR_MODO: Record<string, { anillo: string; sombra: string }> = {
  ruta: { anillo: "#39FF14", sombra: "rgba(57, 255, 20, 0.85)" },
  patinando: { anillo: "#FF3131", sombra: "rgba(255, 49, 49, 0.85)" },
};

// Avatar circular (foto o inicial) con burbuja de estado opcional y un borde con
// brillo (glow) según el modo del miembro, para verse en el mapa mientras
// comparte su ubicación.
function crearIconoAvatar({
  fotoUrl,
  nombre,
  estado,
  modo,
}: {
  fotoUrl: string | null;
  nombre: string;
  estado?: string | null;
  modo: string;
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

  return L.divIcon({
    className: "",
    html: `
      <div style="position:relative;width:${TAM}px;height:${TAM}px;">
        ${burbuja}
        <div style="width:${TAM}px;height:${TAM}px;border-radius:9999px;background:#e7c168;border:2px solid ${anillo};box-shadow:0 0 8px 2px ${sombra},0 0 3px 1px ${sombra};overflow:hidden;">
          ${contenido}
        </div>
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
    <div className="flex flex-col gap-2" style={{ minWidth: 180 }}>
      <p className="font-semibold">{miembro.nombre}</p>

      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          onClick={manejarAbrirChat}
          className="flex items-center justify-center gap-1.5 rounded bg-amber-600 px-2 py-1.5 text-xs text-white"
        >
          <IconMessage2 size={14} />
          Enviar mensaje
        </button>
        <button
          type="button"
          onClick={manejarAbrirReconocimiento}
          className="flex items-center justify-center gap-1.5 rounded border border-amber-600 px-2 py-1.5 text-xs text-amber-700"
        >
          <IconHeartHandshake size={14} />
          Enviar reconocimiento
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

  const [pantallaCompleta, setPantallaCompleta] = useState(false);
  const [capaMapa, setCapaMapa] = useState<CapaMapa>("estandar");

  const [miFotoUrl, setMiFotoUrl] = useState<string | null>(null);
  const [miEstadoTexto, setMiEstadoTexto] = useState<string | null>(null);
  const [mostrarEditorEstado, setMostrarEditorEstado] = useState(false);
  const [textoEstadoForm, setTextoEstadoForm] = useState("");
  const [guardandoEstado, setGuardandoEstado] = useState(false);

  const [avisoInactividad, setAvisoInactividad] = useState(false);
  const [mostrarPreguntaMapeo, setMostrarPreguntaMapeo] = useState(false);
  const [mostrarMisRutas, setMostrarMisRutas] = useState(false);
  const [chatFlotante, setChatFlotante] = useState<{
    sala: string;
    nombre: string;
    fotoUrl: string | null;
  } | null>(null);
  const [reconocerA, setReconocerA] = useState<OtroMiembro | null>(null);
  const [textoReconocimiento, setTextoReconocimiento] = useState("");
  const [enviandoReconocimiento, setEnviandoReconocimiento] = useState(false);
  const [reconocimientoEnviado, setReconocimientoEnviado] = useState(false);

  const posicionRef = useRef<{ lat: number; lon: number } | null>(null);
  const grabandoRef = useRef(false);
  const inicioGrabacionRef = useRef<number>(0);
  const mapRef = useRef<L.Map | null>(null);

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
  const necesitaCentrarInicialRef = useRef(false);
  const holdCentrarTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdCentrarActivadoRef = useRef(false);

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
    }
  }

  // GPS: solo se activa mientras haya un modo seleccionado (privacidad primero).
  // Al desactivar un modo, la posición se borra de inmediato y el navegador deja
  // de usar el GPS para esta función.
  useEffect(() => {
    if (!modo) {
      setPosicion(null);
      posicionRef.current = null;
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

        if (grabandoRef.current) {
          setPuntosGrabados((prev) => [...prev, { ...punto, timestamp: Date.now() }]);
        }

        if (necesitaEnvioInicialRef.current && tokenRef.current) {
          necesitaEnvioInicialRef.current = false;
          apiPost("/mapa/patinando", { ...punto, modo: modoRef.current }, tokenRef.current).catch(() => {});
        }

        if (necesitaCentrarInicialRef.current && mapRef.current) {
          necesitaCentrarInicialRef.current = false;
          mapRef.current.flyTo([punto.lat, punto.lon], ZOOM_CENTRADO_AUTOMATICO);
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

    const estabaGrabando = grabandoRef.current;
    const tokenActual = tokenRef.current;
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
            { tipo: "libre", distanciaKm, duracionSeg, puntos },
            tokenActual,
          );
        } catch (err) {
          setMensaje(err instanceof ApiError ? err.message : "No se pudo guardar el recorrido.");
          setLimiteRutasAlcanzado(err instanceof ApiError && err.status === 409);
        }
      }
    }
  }

  // Detecta si tienes una rodada/evento confirmada (RSVP "Voy") dentro de la ventana
  // de 30 min antes hasta 3h después (sección 5 y 11 del PDF), para ofrecer compartir
  // tu ubicación específicamente para esa rodada.
  useEffect(() => {
    if (!token) return;

    async function revisarRodadaActiva() {
      try {
        const [publicaciones, misRsvps] = await Promise.all([
          apiGet<Publicacion[]>("/publicaciones", token),
          apiGet<Record<number, string>>("/publicaciones/mis-rsvps", token),
        ]);

        const encontrada = publicaciones.find((p) => {
          if (p.tipo !== "rodada" && p.tipo !== "evento") return false;
          if (!p.activaEnMapa || misRsvps[p.id] !== "yes") return false;
          const fechaHora = combinarFechaHora(p.fecha, p.hora);
          return fechaHora ? rodadaEnVentana(fechaHora) : false;
        });

        setRodadaActiva(encontrada ?? null);
      } catch {
        // silencioso
      }
    }

    revisarRodadaActiva();
    const intervalo = setInterval(revisarRodadaActiva, 60000);
    return () => clearInterval(intervalo);
  }, [token]);

  const centro: [number, number] = posicion ? [posicion.lat, posicion.lon] : CENTRO_DEFECTO;

  function centrarEnMiUbicacion() {
    if (!posicion || !mapRef.current) return;
    mapRef.current.flyTo([posicion.lat, posicion.lon], mapRef.current.getZoom());
  }

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
          {otros.map((o) => (
            <Marker
              key={o.miembroId}
              position={[o.lat, o.lon]}
              icon={crearIconoAvatar({
                fotoUrl: o.fotoUrl,
                nombre: o.nombre,
                estado: o.estado,
                modo: o.modo,
              })}
            >
              <Popup>
                <PopupOtroMiembro
                  miembro={o}
                  onAbrirChat={(m) => {
                    if (sesion?.id == null) return;
                    setChatFlotante({
                      sala: salaIndividual(sesion.id, m.miembroId),
                      nombre: m.nombre,
                      fotoUrl: m.fotoUrl,
                    });
                  }}
                  onAbrirReconocimiento={(m) => {
                    setTextoReconocimiento("");
                    setReconocimientoEnviado(false);
                    setReconocerA(m);
                  }}
                />
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

        {/* Clúster único de controles del mapa: mismo estilo (dorado, brillo
            sutil, bordes suaves) para todos. En la esquina inferior derecha
            (alcance natural del pulgar sosteniendo el teléfono con una mano)
            en vez de centrado en el borde, y con fondo más transparente para
            no tapar el mapa/recorrido detrás de los botones. */}
        <div className="absolute bottom-2 right-2 z-[1000] flex flex-col items-center gap-0.5 rounded-2xl border border-border-accent/30 bg-surface-1/45 p-1.5 shadow-[0_0_14px_rgba(201,154,61,0.18)] backdrop-blur-sm">
          {/* Zoom +/- ocultos en la vista normal (menos ruido visual, más
              espacio útil); solo aparecen en pantalla completa, donde hay
              espacio de sobra y tiene más sentido controlar el zoom a mano. */}
          {pantallaCompleta && (
            <>
              <button
                type="button"
                aria-label="Acercar"
                onClick={() => mapRef.current?.zoomIn()}
                className="flex h-9 w-9 items-center justify-center rounded-xl text-text-accent transition active:scale-90 hover:bg-bg-accent"
              >
                <IconPlus size={18} />
              </button>
              <button
                type="button"
                aria-label="Alejar"
                onClick={() => mapRef.current?.zoomOut()}
                className="flex h-9 w-9 items-center justify-center rounded-xl text-text-accent transition active:scale-90 hover:bg-bg-accent"
              >
                <IconMinus size={18} />
              </button>

              <div className="my-0.5 h-px w-6 bg-border-accent/30" />
            </>
          )}

          <button
            type="button"
            aria-label={
              capaMapa === "estandar" ? "Ver mapa en modo satélite" : "Ver mapa estándar"
            }
            onClick={() => setCapaMapa((c) => (c === "estandar" ? "satelite" : "estandar"))}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-text-accent transition active:scale-90 hover:bg-bg-accent"
          >
            {capaMapa === "estandar" ? <IconSatellite size={18} /> : <IconMap2 size={18} />}
          </button>
          <button
            type="button"
            aria-label={pantallaCompleta ? "Salir de pantalla completa" : "Ver mapa en pantalla completa"}
            onClick={() => setPantallaCompleta((v) => !v)}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-text-accent transition active:scale-90 hover:bg-bg-accent"
          >
            {pantallaCompleta ? <IconX size={18} /> : <IconMaximize size={18} />}
          </button>

          <div className="my-0.5 h-px w-6 bg-border-accent/30" />

          <button
            type="button"
            aria-label="Centrar en mi ubicación: mantén presionado para ver tus rutas"
            disabled={!posicion}
            onPointerDown={iniciarHoldCentrar}
            onPointerUp={onPointerUpCentrar}
            onPointerLeave={limpiarHoldCentrar}
            onPointerCancel={limpiarHoldCentrar}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-text-accent transition active:scale-90 hover:bg-bg-accent disabled:opacity-30"
          >
            <IconCurrentLocation size={18} />
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

          {rodadaActiva &&
            !modo &&
            (() => {
              const fechaHora = combinarFechaHora(rodadaActiva.fecha, rodadaActiva.hora);
              const activable = fechaHora ? rodadaActivable(fechaHora) : false;
              const faltan = fechaHora ? minutosHasta(fechaHora) : 0;

              return (
                <div className="card border-fill-warning bg-bg-accent flex flex-col gap-2 p-4">
                  <h2 className="text-sm font-semibold text-amber-text">
                    Tu rodada está por comenzar
                  </h2>
                  <p className="text-xs text-text-primary">
                    Confirmaste &quot;Voy&quot; a <strong>{rodadaActiva.titulo}</strong>
                    {rodadaActiva.hora ? ` a las ${rodadaActiva.hora}` : ""}.
                  </p>
                  <p className="text-xs text-text-secondary">
                    {activable
                      ? "Ya puedes compartir tu ubicación con la comunidad."
                      : `Podrás activarlo a partir de las ${rodadaActiva.hora} (en ${faltan} min).`}
                  </p>
                  <button
                    type="button"
                    disabled={!activable}
                    onClick={() => activarModo("patinando")}
                    className="btn-hero rounded-app px-4 py-2 text-sm disabled:opacity-50"
                  >
                    Compartir ubicación de esta rodada
                  </button>
                </div>
              );
            })()}

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
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => activarModo("patinando")}
                    className="flex-1 transition-transform active:scale-95"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/boton-patinando.png"
                      alt="Estoy patinando ahora"
                      className="h-auto w-full object-contain drop-shadow-[0_3px_6px_rgba(0,0,0,0.5)]"
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => activarModo("ruta")}
                    className="flex-1 transition-transform active:scale-95"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/boton-estoy-en-ruta.png"
                      alt="Estoy en ruta"
                      className="h-auto w-full object-contain drop-shadow-[0_3px_6px_rgba(0,0,0,0.5)]"
                    />
                  </button>
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
                ✅ Finalizar recorrido
              </button>
              <button
                type="button"
                onClick={continuarPatinando}
                className="rounded-app border border-border px-4 py-2 text-sm text-text-primary"
              >
                ▶️ Continuar patinando
              </button>
            </div>
          </div>
        </div>
      )}

      {mostrarPreguntaMapeo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6">
          <div className="card flex w-full max-w-xs flex-col gap-3 p-5">
            <h2 className="text-sm font-semibold text-text-accent">¿Quieres mapear tu ruta?</h2>
            <p className="text-xs text-text-secondary">
              Además de compartir tu ubicación, podemos dibujar tu recorrido en el mapa y
              guardarlo con distancia, tiempo y velocidad al terminar.
            </p>
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
