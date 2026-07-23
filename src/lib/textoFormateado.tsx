import type { ReactNode } from "react";

// Marcadores propios (no es Markdown completo): negrita **x**, subrayado
// __x__, cursiva *x* — sin anidamiento, pensado para lo que produce
// BarraFormatoTexto.tsx. El orden de la alternancia importa: ** y __ se
// intentan antes que * para no partir un tramo en negrita/subrayado a la mitad.
const PATRON_FORMATO = /\*\*(.+?)\*\*|__(.+?)__|\*(.+?)\*/g;

export function renderizarTextoFormateado(texto: string): ReactNode[] {
  const nodos: ReactNode[] = [];
  let ultimoIndice = 0;
  let contador = 0;
  let match: RegExpExecArray | null;
  PATRON_FORMATO.lastIndex = 0;
  while ((match = PATRON_FORMATO.exec(texto)) !== null) {
    if (match.index > ultimoIndice) {
      nodos.push(texto.slice(ultimoIndice, match.index));
    }
    const [, negrita, subrayado, cursiva] = match;
    if (negrita !== undefined) {
      nodos.push(<strong key={contador++}>{negrita}</strong>);
    } else if (subrayado !== undefined) {
      nodos.push(<u key={contador++}>{subrayado}</u>);
    } else if (cursiva !== undefined) {
      nodos.push(<em key={contador++}>{cursiva}</em>);
    }
    ultimoIndice = match.index + match[0].length;
  }
  if (ultimoIndice < texto.length) {
    nodos.push(texto.slice(ultimoIndice));
  }
  return nodos;
}
