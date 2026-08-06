"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
// Import estático como el resto del proyecto hace con leaflet en
// MapaView.tsx: seguro porque este archivo entero solo se carga en el
// navegador -- MapaView.tsx lo importa vía next/dynamic con ssr:false, así
// que maplibre-gl nunca se evalúa en el servidor ni se descarga hasta que
// alguien elige "3D" en el selector de capas. maplibre-gl no tiene export
// default (solo nombrados), a diferencia de leaflet.
import { Map as MaplibreMap, Marker as MaplibreMarker, Popup as MaplibrePopup, type GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { PuntoGps } from "@/lib/geo";
import type { EmergenciaActiva } from "@/lib/emergencias";
import { ETIQUETA_MOTIVO } from "@/lib/emergencias";
import { htmlPuntoSimple, HTML_PUNTO_PARTIDA, htmlIconoAvatar } from "@/lib/iconosMapa";
import { ContenidoPopupMiembro, type OtroMiembro } from "@/components/Mapa/TarjetaMiembroMapa";

const ESTILO_3D = "https://tiles.openfreemap.org/styles/liberty";
const DURACION_ANIMACION_MS = 1200;
const FUENTE_RUTA = "ruta-grabada";

export interface Mapa3DHandle {
  centrarEn(lat: number, lon: number, zoom?: number): void;
  getCamara(): { lat: number; lon: number; zoom: number } | null;
}

interface Mapa3DProps {
  centroInicial: { lat: number; lon: number; zoom: number };
  posicion: { lat: number; lon: number } | null;
  miFotoUrl: string | null;
  miNombre: string;
  miEstadoTexto: string | null;
  miModo: "patinando" | "ruta" | null;
  onClickMiMarcador: () => void;
  gruposOtros: OtroMiembro[][];
  onAbrirChat: (m: OtroMiembro) => void;
  onAbrirReconocimiento: (m: OtroMiembro) => void;
  onAbrirCluster: (grupo: OtroMiembro[]) => void;
  puntosPartida: { id: number; tipo: string; titulo: string; lat: number; lon: number }[];
  puntosGrabados: PuntoGps[];
  mapeado: boolean;
  emergenciasActivas: EmergenciaActiva[];
  pantallaCompleta: boolean;
  onError: () => void;
}

interface MarcadorAnimadoInterno {
  marker: MaplibreMarker;
  actual: [number, number];
  raf: number | null;
}

// Mapa en 3D (MapLibre GL JS, edificios extruidos vía el estilo Liberty de
// OpenFreeMap) -- rama de renderizado alternativa a la de Leaflet en
// MapaView.tsx, activada solo cuando se elige "3D" en el selector de capas.
// Dibuja exactamente el mismo estado que ya calcula MapaView (posición
// propia, otros patinadores, ruta grabada, puntos de partida, emergencias);
// no duplica nada de la lógica de GPS/grabación/anti-cheat, solo la pinta.
export const Mapa3D = forwardRef<Mapa3DHandle, Mapa3DProps>(function Mapa3D(
  {
    centroInicial,
    posicion,
    miFotoUrl,
    miNombre,
    miEstadoTexto,
    miModo,
    onClickMiMarcador,
    gruposOtros,
    onAbrirChat,
    onAbrirReconocimiento,
    onAbrirCluster,
    puntosPartida,
    puntosGrabados,
    mapeado,
    emergenciasActivas,
    pantallaCompleta,
    onError,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<MaplibreMap | null>(null);
  // Estado (no solo un ref) a propósito: MapLibre dispara "load" de forma
  // asíncrona después del montaje, y los efectos de marcadores/ruta más abajo
  // necesitan volver a correr en cuanto eso pase -- un ref no dispara ningún
  // efecto al cambiar, así que con solo un ref esos efectos podrían quedar
  // esperando un cambio de props que nunca llega si la posición/otros ya
  // estaban listos antes de que el mapa terminara de cargar el estilo.
  const [cargado, setCargado] = useState(false);
  const marcadorPropioRef = useRef<MaplibreMarker | null>(null);
  const marcadoresOtrosRef = useRef<Map<number, MarcadorAnimadoInterno>>(new Map());
  const marcadoresPartidaRef = useRef<Map<number, MaplibreMarker>>(new Map());
  const marcadoresEmergenciaRef = useRef<Map<number, MaplibreMarker>>(new Map());
  const popupRef = useRef<{ popup: MaplibrePopup; root: Root } | null>(null);

  // Callbacks siempre vigentes dentro de los listeners de MapLibre (creados
  // una sola vez al montar cada marcador), sin tener que recrearlos si
  // cambian entre un render y otro.
  const callbacksRef = useRef({
    onClickMiMarcador,
    onAbrirChat,
    onAbrirReconocimiento,
    onAbrirCluster,
  });
  useEffect(() => {
    callbacksRef.current = { onClickMiMarcador, onAbrirChat, onAbrirReconocimiento, onAbrirCluster };
  });

  useImperativeHandle(ref, () => ({
    centrarEn(lat, lon, zoom) {
      const mapa = mapaRef.current;
      if (!mapa) return;
      mapa.flyTo({ center: [lon, lat], zoom: zoom ?? mapa.getZoom() });
    },
    getCamara() {
      const mapa = mapaRef.current;
      if (!mapa) return null;
      const c = mapa.getCenter();
      return { lat: c.lat, lon: c.lng, zoom: mapa.getZoom() };
    },
  }));

  // Montaje/desmontaje del mapa. Solo una vez -- centroInicial es
  // deliberadamente ignorado como dependencia (es la posición de arranque,
  // no algo que deba re-centrar el mapa en cada render).
  useEffect(() => {
    if (!containerRef.current) return;
    let mapa: MaplibreMap;
    try {
      mapa = new MaplibreMap({
        container: containerRef.current,
        style: ESTILO_3D,
        center: [centroInicial.lon, centroInicial.lat],
        zoom: centroInicial.zoom,
        pitch: 60,
        attributionControl: { compact: true },
      });
    } catch (err) {
      console.error("No se pudo iniciar el mapa 3D:", err);
      onError();
      return;
    }
    mapa.on("load", () => {
      setCargado(true);
      mapa.addSource(FUENTE_RUTA, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      mapa.addLayer({
        id: FUENTE_RUTA,
        type: "line",
        source: FUENTE_RUTA,
        paint: { "line-color": "#C99A3D", "line-width": 4 },
      });
    });
    mapa.on("error", (e) => {
      console.error("Error de MapLibre:", e?.error);
    });
    mapaRef.current = mapa;

    // Capturados acá (no leídos de nuevo dentro del cleanup) porque los
    // objetos Map/marcadores en sí no cambian de identidad entre renders,
    // solo se mutan -- son los mismos contenedores creados una vez en
    // useRef(new Map()).
    const marcadoresOtros = marcadoresOtrosRef.current;
    const marcadoresPartida = marcadoresPartidaRef.current;
    const marcadoresEmergencia = marcadoresEmergenciaRef.current;

    return () => {
      for (const m of marcadoresOtros.values()) {
        if (m.raf !== null) cancelAnimationFrame(m.raf);
        m.marker.remove();
      }
      marcadoresOtros.clear();
      for (const m of marcadoresPartida.values()) m.remove();
      marcadoresPartida.clear();
      for (const m of marcadoresEmergencia.values()) m.remove();
      marcadoresEmergencia.clear();
      marcadorPropioRef.current?.remove();
      marcadorPropioRef.current = null;
      if (popupRef.current) {
        popupRef.current.popup.remove();
        popupRef.current.root.unmount();
        popupRef.current = null;
      }
      // Punto más importante del componente: sin este remove() se filtra un
      // contexto WebGL cada vez que SwipeNavigator desmonta esta pantalla al
      // cambiar de pestaña.
      mapaRef.current?.remove();
      mapaRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Marcador propio.
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !cargado) return;
    if (!posicion) {
      marcadorPropioRef.current?.remove();
      marcadorPropioRef.current = null;
      return;
    }
    const html = htmlIconoAvatar({
      fotoUrl: miFotoUrl,
      nombre: miNombre,
      estado: miEstadoTexto,
      modo: miModo ?? "patinando",
    });
    if (!marcadorPropioRef.current) {
      const el = document.createElement("div");
      el.innerHTML = html;
      el.style.cursor = "pointer";
      el.addEventListener("click", () => callbacksRef.current.onClickMiMarcador());
      marcadorPropioRef.current = new MaplibreMarker({ element: el })
        .setLngLat([posicion.lon, posicion.lat])
        .addTo(mapa);
    } else {
      marcadorPropioRef.current.getElement().innerHTML = html;
      marcadorPropioRef.current.setLngLat([posicion.lon, posicion.lat]);
    }
  }, [posicion, miFotoUrl, miNombre, miEstadoTexto, miModo, cargado]);

  function abrirPopupMiembro(miembro: OtroMiembro, lngLat: [number, number]) {
    const mapa = mapaRef.current;
    if (!mapa) return;
    popupRef.current?.popup.remove();
    popupRef.current?.root.unmount();
    const contenedor = document.createElement("div");
    const root = createRoot(contenedor);
    const popup = new MaplibrePopup({ closeButton: false, offset: 24 })
      .setLngLat(lngLat)
      .setDOMContent(contenedor)
      .addTo(mapa);
    root.render(
      <ContenidoPopupMiembro
        miembro={miembro}
        onAbrirChat={(m) => {
          popup.remove();
          callbacksRef.current.onAbrirChat(m);
        }}
        onAbrirReconocimiento={(m) => {
          popup.remove();
          callbacksRef.current.onAbrirReconocimiento(m);
        }}
      />,
    );
    popup.on("close", () => {
      root.unmount();
      if (popupRef.current?.popup === popup) popupRef.current = null;
    });
    popupRef.current = { popup, root };
  }

  // Otros patinadores: crear/animar/eliminar por miembroId representante --
  // mismo concepto que MarcadorAnimado.tsx (rastrear la posición anterior a
  // mano, no confiar en "la posición actual" al empezar a animar), pero acá
  // manejado 100% imperativo desde este efecto: no hay ningún efecto de
  // react-leaflet peleando por el control de la posición como el que ese
  // otro componente sí tiene que rodear.
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !cargado) return;
    const vigentes = new Set<number>();
    for (const grupo of gruposOtros) {
      const representante = grupo[0];
      const extra = grupo.length - 1;
      vigentes.add(representante.miembroId);
      const destino: [number, number] = [representante.lon, representante.lat];
      const html = htmlIconoAvatar({
        fotoUrl: representante.fotoUrl,
        nombre: representante.nombre,
        estado: representante.estado,
        modo: representante.modo,
        masPersonas: extra > 0 ? extra : undefined,
      });
      const existente = marcadoresOtrosRef.current.get(representante.miembroId);
      if (!existente) {
        const el = document.createElement("div");
        el.innerHTML = html;
        el.style.cursor = "pointer";
        el.addEventListener("click", () => {
          if (extra > 0) {
            callbacksRef.current.onAbrirCluster(grupo);
          } else {
            abrirPopupMiembro(representante, destino);
          }
        });
        const marker = new MaplibreMarker({ element: el }).setLngLat(destino).addTo(mapa);
        marcadoresOtrosRef.current.set(representante.miembroId, {
          marker,
          actual: destino,
          raf: null,
        });
        continue;
      }
      existente.marker.getElement().innerHTML = html;
      const desde = existente.actual;
      if (desde[0] === destino[0] && desde[1] === destino[1]) continue;
      if (existente.raf !== null) cancelAnimationFrame(existente.raf);
      const inicio = performance.now();
      const paso = (ahora: number) => {
        const t = Math.min(1, (ahora - inicio) / DURACION_ANIMACION_MS);
        const lon = desde[0] + (destino[0] - desde[0]) * t;
        const lat = desde[1] + (destino[1] - desde[1]) * t;
        existente.marker.setLngLat([lon, lat]);
        existente.actual = [lon, lat];
        if (t < 1) {
          existente.raf = requestAnimationFrame(paso);
        } else {
          existente.raf = null;
          existente.actual = destino;
        }
      };
      existente.raf = requestAnimationFrame(paso);
    }
    for (const [id, m] of marcadoresOtrosRef.current) {
      if (!vigentes.has(id)) {
        if (m.raf !== null) cancelAnimationFrame(m.raf);
        m.marker.remove();
        marcadoresOtrosRef.current.delete(id);
      }
    }
  }, [gruposOtros, cargado]);

  // Puntos de partida de rodada/evento: sin animación, igual que en Leaflet.
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !cargado) return;
    const vigentes = new Set<number>();
    for (const p of puntosPartida) {
      vigentes.add(p.id);
      if (marcadoresPartidaRef.current.has(p.id)) continue;
      const el = document.createElement("div");
      el.innerHTML = HTML_PUNTO_PARTIDA;
      const marker = new MaplibreMarker({ element: el }).setLngLat([p.lon, p.lat]).addTo(mapa);
      marcadoresPartidaRef.current.set(p.id, marker);
    }
    for (const [id, m] of marcadoresPartidaRef.current) {
      if (!vigentes.has(id)) {
        m.remove();
        marcadoresPartidaRef.current.delete(id);
      }
    }
  }, [puntosPartida, cargado]);

  // Emergencias activas: mismo criterio (sin animación).
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !cargado) return;
    const activas = emergenciasActivas.filter((e) => e.lat !== null && e.lon !== null);
    const vigentes = new Set<number>();
    for (const e of activas) {
      vigentes.add(e.id);
      if (marcadoresEmergenciaRef.current.has(e.id)) continue;
      const el = document.createElement("div");
      el.innerHTML = htmlPuntoSimple("#D8342F");
      el.title = ETIQUETA_MOTIVO[e.motivo as keyof typeof ETIQUETA_MOTIVO] ?? e.motivo;
      const marker = new MaplibreMarker({ element: el })
        .setLngLat([e.lon as number, e.lat as number])
        .addTo(mapa);
      marcadoresEmergenciaRef.current.set(e.id, marker);
    }
    for (const [id, m] of marcadoresEmergenciaRef.current) {
      if (!vigentes.has(id)) {
        m.remove();
        marcadoresEmergenciaRef.current.delete(id);
      }
    }
  }, [emergenciasActivas, cargado]);

  // Ruta grabada: una fuente GeoJSON creada una sola vez al cargar el estilo
  // (ver "load" más arriba), actualizada acá con setData en cada cambio.
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !cargado) return;
    const fuente = mapa.getSource(FUENTE_RUTA) as GeoJSONSource | undefined;
    if (!fuente) return;
    const coords =
      mapeado && puntosGrabados.length > 1 ? puntosGrabados.map((p) => [p.lon, p.lat]) : [];
    fuente.setData({
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: coords },
    });
  }, [puntosGrabados, mapeado, cargado]);

  // El contenedor cambia de tamaño al entrar/salir de pantalla completa.
  useEffect(() => {
    const id = setTimeout(() => mapaRef.current?.resize(), 80);
    return () => clearTimeout(id);
  }, [pantallaCompleta]);

  return <div ref={containerRef} style={{ height: "100%", width: "100%" }} />;
});
