// Constantes de negocio de la sección 11 del PDF.
export const MINUTOS_VENTANA_ANTES = 30; // desde cuándo se muestra el aviso, antes de la rodada
export const HORAS_CIERRE_AUTOMATICO_RODADA = 3;

export function combinarFechaHora(fecha: string | null, hora: string | null): Date | null {
  if (!fecha) return null;
  const iso = `${fecha}T${hora ?? "00:00"}:00`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

// true si "ahora" cae dentro de la ventana de aviso: [30 min antes, 3h después] de la rodada.
// Solo controla cuándo se MUESTRA el aviso, no cuándo se puede activar el botón.
export function rodadaEnVentana(fechaHora: Date): boolean {
  const inicio = fechaHora.getTime() - MINUTOS_VENTANA_ANTES * 60 * 1000;
  const fin = fechaHora.getTime() + HORAS_CIERRE_AUTOMATICO_RODADA * 60 * 60 * 1000;
  const ahora = Date.now();
  return ahora >= inicio && ahora <= fin;
}

// true solo desde la hora exacta puesta por el admin hasta el cierre automático (3h después).
// Antes de esa hora el botón queda visible pero deshabilitado (solo para avisar).
export function rodadaActivable(fechaHora: Date): boolean {
  const fin = fechaHora.getTime() + HORAS_CIERRE_AUTOMATICO_RODADA * 60 * 60 * 1000;
  const ahora = Date.now();
  return ahora >= fechaHora.getTime() && ahora <= fin;
}

export function minutosHasta(fechaHora: Date): number {
  return Math.max(0, Math.round((fechaHora.getTime() - Date.now()) / 60000));
}

// true solo entre 30 min antes y la hora exacta de inicio — usado para mostrar
// el punto de partida en el Mapa (sincronizado con el recordatorio push),
// a diferencia de rodadaEnVentana que sigue vigente 3h después de iniciada.
export function puntoPartidaVisible(fechaHora: Date): boolean {
  const inicio = fechaHora.getTime() - MINUTOS_VENTANA_ANTES * 60 * 1000;
  const ahora = Date.now();
  return ahora >= inicio && ahora < fechaHora.getTime();
}
