"use client";

import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useSession } from "@/context/SessionContext";
import { apiPost, apiGet, apiDelete, ApiError } from "@/lib/api";
import { distanciaTotalKm, type PuntoGps } from "@/lib/geo";
import type { Publicacion } from "@/lib/publicaciones";
import { combinarFechaHora, rodadaEnVentana, rodadaActivable, minutosHasta } from "@/lib/rodadas";

// Centro por defecto: entre Puerto Montt y Puerto Varas (sección 1 del PDF).
const CENTRO_DEFECTO: [number, number] = [-41.4, -72.96];

function crearIcono(color: string) {
  return L.divIcon({
    className: "",
    html: `<div style="width:16px;height:16px;border-radius:9999px;background:${color};border:2px solid #171008;box-shadow:0 0 0 2px rgba(201,154,61,0.55);"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

const iconoYo = crearIcono("#C99A3D");
const iconoOtro = crearIcono("#7EB3EE");

interface OtroMiembro {
  miembroId: number;
  nombre: string;
  lat: number;
  lon: number;
}

interface RecorridoResumen {
  id: number;
  tipo: string;
  distanciaKm: number;
  duracionSeg: number;
  createdAt: string;
}

export function MapaView() {
  const { sesion } = useSession();
  const token = sesion?.token ?? null;

  const [posicion, setPosicion] = useState<{ lat: number; lon: number } | null>(null);
  const [errorGeo, setErrorGeo] = useState("");
  const [otros, setOtros] = useState<OtroMiembro[]>([]);
  const [patinando, setPatinando] = useState(false);
  const [grabando, setGrabando] = useState(false);
  const [puntosGrabados, setPuntosGrabados] = useState<PuntoGps[]>([]);
  const [resumen, setResumen] = useState<{ distanciaKm: number; duracionSeg: number } | null>(null);
  const [misRecorridos, setMisRecorridos] = useState<RecorridoResumen[]>([]);
  const [mensaje, setMensaje] = useState("");
  const [rodadaActiva, setRodadaActiva] = useState<Publicacion | null>(null);

  const posicionRef = useRef<{ lat: number; lon: number } | null>(null);
  const grabandoRef = useRef(false);
  const inicioGrabacionRef = useRef<number>(0);

  // Ubicación del navegador: se sigue en todo momento mientras la pantalla está abierta.
  useEffect(() => {
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

        if (grabandoRef.current) {
          setPuntosGrabados((prev) => [
            ...prev,
            { ...punto, timestamp: Date.now() },
          ]);
        }
      },
      () => setErrorGeo("No se pudo obtener tu ubicación (revisa los permisos)."),
      { enableHighAccuracy: true, maximumAge: 5000 },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

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

  // Mientras "patinando" está activo, reenvía la ubicación cada 20s para no expirar (HORAS_VIGENCIA_PATINANDO).
  useEffect(() => {
    if (!patinando || !token) return;

    const intervalo = setInterval(() => {
      if (posicionRef.current) {
        apiPost("/mapa/patinando", posicionRef.current, token).catch(() => {});
      }
    }, 20000);

    return () => clearInterval(intervalo);
  }, [patinando, token]);

  async function activarPatinando() {
    if (!token || !posicion) return;
    try {
      await apiPost("/mapa/patinando", posicion, token);
      setPatinando(true);
      setMensaje("");
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : "No se pudo activar.");
    }
  }

  async function terminarPatinando() {
    if (!token) return;
    try {
      await apiDelete("/mapa/patinando", token);
    } finally {
      setPatinando(false);
    }
  }

  function iniciarGrabacion() {
    setPuntosGrabados(posicion ? [{ ...posicion, timestamp: Date.now() }] : []);
    inicioGrabacionRef.current = Date.now();
    grabandoRef.current = true;
    setGrabando(true);
    setResumen(null);
  }

  async function detenerGrabacion() {
    grabandoRef.current = false;
    setGrabando(false);

    const duracionSeg = Math.round((Date.now() - inicioGrabacionRef.current) / 1000);
    const distanciaKm = distanciaTotalKm(puntosGrabados);
    setResumen({ distanciaKm, duracionSeg });

    if (!token || puntosGrabados.length < 2) return;
    try {
      await apiPost(
        "/mapa/recorridos",
        { tipo: "libre", distanciaKm, duracionSeg, puntos: puntosGrabados },
        token,
      );
      cargarMisRecorridos();
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : "No se pudo guardar el recorrido.");
    }
  }

  async function cargarMisRecorridos() {
    if (!token) return;
    try {
      const lista = await apiGet<RecorridoResumen[]>("/mapa/recorridos", token);
      setMisRecorridos(lista);
    } catch {
      // ignorar
    }
  }

  useEffect(() => {
    cargarMisRecorridos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

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

  return (
    <div className="flex flex-col gap-3">
      <div className="card overflow-hidden" style={{ height: 320 }}>
        <MapContainer center={centro} zoom={13} style={{ height: "100%", width: "100%" }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {posicion && (
            <Marker position={[posicion.lat, posicion.lon]} icon={iconoYo}>
              <Popup>Tú</Popup>
            </Marker>
          )}
          {otros.map((o) => (
            <Marker key={o.miembroId} position={[o.lat, o.lon]} icon={iconoOtro}>
              <Popup>{o.nombre}</Popup>
            </Marker>
          ))}
          {puntosGrabados.length > 1 && (
            <Polyline
              positions={puntosGrabados.map((p) => [p.lat, p.lon])}
              pathOptions={{ color: "#C99A3D", weight: 4 }}
            />
          )}
        </MapContainer>
      </div>

      {errorGeo && <p className="text-xs text-fill-warning">{errorGeo}</p>}
      {mensaje && <p className="text-xs text-fill-warning">{mensaje}</p>}

      {rodadaActiva && !patinando && (() => {
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
              disabled={!posicion || !activable}
              onClick={activarPatinando}
              className="btn-hero rounded-app px-4 py-2 text-sm disabled:opacity-50"
            >
              Compartir ubicación de esta rodada
            </button>
          </div>
        );
      })()}

      {rodadaActiva && patinando && (
        <p className="text-xs text-fill-success">
          Estás compartiendo tu ubicación para &quot;{rodadaActiva.titulo}&quot;.
        </p>
      )}

      <div className="card flex flex-col gap-2 p-4">
        <h2 className="text-sm font-semibold text-text-accent">Rodando — Activo</h2>
        <p className="text-xs text-text-secondary">
          {patinando
            ? "Estás compartiendo tu ubicación con la comunidad."
            : "Activa esto para que otros te vean patinando ahora."}
        </p>
        <button
          type="button"
          disabled={!posicion}
          onClick={patinando ? terminarPatinando : activarPatinando}
          className={`rounded-app px-4 py-2 text-sm disabled:opacity-50 ${
            patinando ? "card text-fill-warning" : "btn-hero"
          }`}
        >
          {patinando ? "Terminar de patinar" : "Estoy patinando ahora"}
        </button>
      </div>

      <div className="card flex flex-col gap-2 p-4">
        <h2 className="text-sm font-semibold text-text-accent">Grabar recorrido</h2>
        {grabando ? (
          <>
            <p className="text-xs text-text-secondary">
              Grabando... {puntosGrabados.length} puntos registrados.
            </p>
            <button
              type="button"
              onClick={detenerGrabacion}
              className="card rounded-app px-4 py-2 text-sm text-fill-warning"
            >
              Detener grabación
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={!posicion}
            onClick={iniciarGrabacion}
            className="btn-hero rounded-app px-4 py-2 text-sm disabled:opacity-50"
          >
            Iniciar grabación
          </button>
        )}

        {resumen && (
          <p className="text-xs text-fill-success">
            Recorrido guardado: {resumen.distanciaKm.toFixed(2)} km en{" "}
            {Math.round(resumen.duracionSeg / 60)} min.
          </p>
        )}
      </div>

      {misRecorridos.length > 0 && (
        <div className="card flex flex-col gap-2 p-4">
          <h2 className="text-sm font-semibold text-text-accent">Historial de recorridos</h2>
          <ul className="flex flex-col gap-1">
            {misRecorridos.map((r) => (
              <li key={r.id} className="text-xs text-text-secondary">
                {new Date(r.createdAt).toLocaleDateString("es-CL")} — {r.distanciaKm.toFixed(2)} km —{" "}
                {Math.round(r.duracionSeg / 60)} min
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
