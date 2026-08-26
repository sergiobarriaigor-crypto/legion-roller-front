// GPS V2 -- FASE 1. Chequeos universales que corren ANTES de cualquier otra
// cosa, sin importar el estado (GRABANDO/RECUPERANDO) -- si un fix no pasa
// esto, ni siquiera compite por ser confiable o candidato.
import type { FixCrudoV2 } from "./tipos";

export interface ResultadoValidacion {
  aceptado: boolean;
  motivo: string | null;
}

// Regla 1 (timestamp real) y regla 2 (fixes simulados) del diseño acordado:
// - simulated === true nunca entra al recorrido.
// - un fix con time anterior al último punto confiable se descarta (el
//   reloj GPS de la ruta nunca retrocede) -- protege contra fixes
//   desordenados/duplicados que a veces entrega el plugin nativo.
export function validarFixCrudo(
  fix: FixCrudoV2,
  ultimoConfiableTimestamp: number | null,
): ResultadoValidacion {
  if (fix.simulated === true) {
    return { aceptado: false, motivo: "simulado" };
  }
  if (fix.time !== null && ultimoConfiableTimestamp !== null && fix.time < ultimoConfiableTimestamp) {
    return { aceptado: false, motivo: "fuera-de-orden-temporal" };
  }
  return { aceptado: true, motivo: null };
}
