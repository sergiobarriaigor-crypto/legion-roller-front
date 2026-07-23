"use client";

import type { RefObject } from "react";
import { IconBold, IconItalic, IconUnderline } from "@tabler/icons-react";

// Barrita de formato para cuadros de texto simples (Admin/Impulsa): envuelve
// la selección actual con marcadores propios (negrita **x**, subrayado
// __x__, cursiva *x*) que después interpreta textoFormateado.tsx al mostrar
// el texto. Sin editor de texto enriquecido: no guarda HTML, solo texto
// plano con marcadores, más simple y sin riesgo de XSS.
export function BarraFormatoTexto({
  textareaRef,
  valor,
  onCambiar,
}: {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  valor: string;
  onCambiar: (nuevo: string) => void;
}) {
  function envolverSeleccion(marcador: string) {
    const el = textareaRef.current;
    if (!el) return;
    const inicio = el.selectionStart;
    const fin = el.selectionEnd;
    if (inicio === fin) return;
    const seleccionado = valor.slice(inicio, fin);
    const nuevo = valor.slice(0, inicio) + marcador + seleccionado + marcador + valor.slice(fin);
    onCambiar(nuevo);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(inicio + marcador.length, fin + marcador.length);
    });
  }

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => envolverSeleccion("**")}
        title="Negrita"
        className="flex h-7 w-7 items-center justify-center rounded-app border border-border text-text-secondary hover:text-text-primary"
      >
        <IconBold size={15} />
      </button>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => envolverSeleccion("*")}
        title="Cursiva"
        className="flex h-7 w-7 items-center justify-center rounded-app border border-border text-text-secondary hover:text-text-primary"
      >
        <IconItalic size={15} />
      </button>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => envolverSeleccion("__")}
        title="Subrayado"
        className="flex h-7 w-7 items-center justify-center rounded-app border border-border text-text-secondary hover:text-text-primary"
      >
        <IconUnderline size={15} />
      </button>
      <p className="text-[11px] text-text-muted">Selecciona texto y elige un estilo</p>
    </div>
  );
}
