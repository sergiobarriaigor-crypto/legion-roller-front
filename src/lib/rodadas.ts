// Constantes de negocio de la sección 11 del PDF.
export const MINUTOS_VENTANA_ANTES = 30; // ventana para activar "compartir ubicación" antes de una rodada
export const HORAS_CIERRE_AUTOMATICO_RODADA = 3;

export function combinarFechaHora(fecha: string | null, hora: string | null): Date | null {
  if (!fecha) return null;
  const iso = `${fecha}T${hora ?? "00:00"}:00`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

// true si "ahora" cae dentro de la ventana [30 min antes, 3h después] de la rodada.
export function rodadaEnVentana(fechaHora: Date): boolean {
  const inicio = fechaHora.getTime() - MINUTOS_VENTANA_ANTES * 60 * 1000;
  const fin = fechaHora.getTime() + HORAS_CIERRE_AUTOMATICO_RODADA * 60 * 60 * 1000;
  const ahora = Date.now();
  return ahora >= inicio && ahora <= fin;
}
