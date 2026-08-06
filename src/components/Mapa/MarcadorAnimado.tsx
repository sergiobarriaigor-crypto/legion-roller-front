"use client";

import { useEffect, useRef } from "react";
import { Marker } from "react-leaflet";
import type L from "leaflet";

const DURACION_ANIMACION_MS = 1200;

// Envoltorio de <Marker> que, en vez de dejar que el prop `position` salte
// directo a la nueva coordenada (lo que provocaba el "teletransporte" del
// avatar reportado por los usuarios), desliza el ícono desde donde está
// mostrado ahora mismo hasta la nueva posición con requestAnimationFrame.
// Se anima el marcador de Leaflet subyacente de forma imperativa (vía ref +
// setLatLng), no el prop de React -- así no hace falta re-renderizar en cada
// cuadro de la animación, solo cuando cambia la posición "real" recibida.
export function MarcadorAnimado({
  position,
  icon,
  eventHandlers,
  children,
}: {
  position: [number, number];
  icon: L.Icon | L.DivIcon;
  eventHandlers?: L.LeafletEventHandlerFnMap;
  children?: React.ReactNode;
}) {
  const markerRef = useRef<L.Marker>(null);
  const cuadroRef = useRef<number | null>(null);
  // No se puede usar marcador.getLatLng() como "punto de partida" de la
  // animación: react-leaflet ya movió el marcador a la posición nueva en su
  // propio efecto interno (Marker.js -> setLatLng), que corre ANTES que este
  // (los efectos de un hijo se ejecutan antes que los del padre) -- para
  // cuando este efecto se dispara, el marcador ya está en el destino. Por
  // eso se guarda la posición anterior a mano, en vez de leerla del DOM.
  const posAnteriorRef = useRef<[number, number] | null>(null);

  useEffect(() => {
    const marcador = markerRef.current;
    const desde = posAnteriorRef.current;
    posAnteriorRef.current = position;
    if (!marcador || !desde) return; // primera vez: ya queda bien puesto solo

    if (cuadroRef.current !== null) cancelAnimationFrame(cuadroRef.current);

    const [desdeLat, desdeLon] = desde;
    const [hastaLat, hastaLon] = position;
    if (desdeLat === hastaLat && desdeLon === hastaLon) return;

    const inicio = performance.now();
    function paso(ahora: number) {
      const t = Math.min(1, (ahora - inicio) / DURACION_ANIMACION_MS);
      marcador?.setLatLng({
        lat: desdeLat + (hastaLat - desdeLat) * t,
        lng: desdeLon + (hastaLon - desdeLon) * t,
      });
      if (t < 1) {
        cuadroRef.current = requestAnimationFrame(paso);
      } else {
        cuadroRef.current = null;
      }
    }
    cuadroRef.current = requestAnimationFrame(paso);

    return () => {
      if (cuadroRef.current !== null) cancelAnimationFrame(cuadroRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position[0], position[1]]);

  return (
    <Marker ref={markerRef} position={position} icon={icon} eventHandlers={eventHandlers}>
      {children}
    </Marker>
  );
}
