// "Hace X min" / "Hace X h Y min", usado en el panel de Patinadores Activos.
export function tiempoTranscurrido(desde: string | Date): string {
  const inicioMs = new Date(desde).getTime();
  const minutos = Math.max(0, Math.round((Date.now() - inicioMs) / 60000));

  if (minutos < 1) return "Recién";
  if (minutos < 60) return `Hace ${minutos} min`;

  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return resto > 0 ? `Hace ${horas} h ${resto} min` : `Hace ${horas} h`;
}
