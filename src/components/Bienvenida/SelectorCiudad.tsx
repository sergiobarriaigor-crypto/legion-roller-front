"use client";

import { useEffect, useRef, useState } from "react";
import { buscarCiudades } from "@/lib/geocodificacion";

interface Props {
  value: string;
  onChange: (v: string) => void;
  onBlurCampo?: () => void;
}

// Buscador de ciudad estilo autocompletar (no texto libre): evita que cada
// integrante escriba su ciudad de forma distinta ("Pto Montt", "puerto
// montt", "P. Montt", etc.). Las opciones salen de una búsqueda real en
// Nominatim/OpenStreetMap (ver buscarCiudades) y el valor guardado es
// siempre el nombre elegido de la lista, nunca lo que quedó tipeado sin
// confirmar -- si el usuario escribe y se va sin tocar una sugerencia, el
// campo se limpia (ver alPerderFoco).
export function SelectorCiudad({ value, onChange, onBlurCampo }: Props) {
  const [texto, setTexto] = useState(value);
  const [sugerencias, setSugerencias] = useState<string[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const eligiendoRef = useRef(false);

  useEffect(() => {
    const q = texto.trim();
    if (!q || q === value) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSugerencias([]);
      setBuscando(false);
      return;
    }
    setBuscando(true);
    const timeout = setTimeout(() => {
      buscarCiudades(q).then((resultados) => {
        setSugerencias(resultados);
        setBuscando(false);
      });
    }, 400);
    return () => clearTimeout(timeout);
  }, [texto, value]);

  function elegir(nombre: string) {
    eligiendoRef.current = true;
    setTexto(nombre);
    onChange(nombre);
    setSugerencias([]);
    setAbierto(false);
  }

  function alPerderFoco() {
    // Pequeño margen para que el onMouseDown de una sugerencia se procese
    // antes de que este blur decida si limpiar el campo.
    setTimeout(() => {
      if (!eligiendoRef.current && texto.trim() !== value) {
        setTexto(value);
      }
      eligiendoRef.current = false;
      setAbierto(false);
      onBlurCampo?.();
    }, 150);
  }

  return (
    <div className="relative flex flex-col gap-1">
      <input
        type="text"
        autoComplete="off"
        placeholder="Ciudad donde vives"
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
          setAbierto(true);
        }}
        onFocus={() => setAbierto(true)}
        onBlur={alPerderFoco}
        className="rounded-app border border-border bg-surface-2 px-3 py-2 text-text-primary outline-none"
      />
      {abierto && texto.trim() && (
        <div className="absolute top-full z-10 mt-1 max-h-52 w-full overflow-y-auto rounded-app border border-border bg-surface-1 shadow-lg">
          {buscando && <p className="px-3 py-2 text-xs text-text-secondary">Buscando...</p>}
          {!buscando && sugerencias.length === 0 && (
            <p className="px-3 py-2 text-xs text-text-secondary">Sin resultados.</p>
          )}
          {!buscando &&
            sugerencias.map((nombre) => (
              <button
                key={nombre}
                type="button"
                onMouseDown={() => elegir(nombre)}
                className="block w-full px-3 py-2 text-left text-sm text-text-primary hover:bg-bg-accent"
              >
                {nombre}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
