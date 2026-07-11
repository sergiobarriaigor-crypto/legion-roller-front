// "Hace X min" / "Hace X h Y min" / "Ayer" / "Hace N días", usado en el panel
// de Patinadores Activos y en las reacciones/comentarios de Historias.
export function tiempoTranscurrido(desde: string | Date): string {
  const inicioMs = new Date(desde).getTime();
  const minutos = Math.max(0, Math.round((Date.now() - inicioMs) / 60000));

  if (minutos < 1) return "Recién";
  if (minutos < 60) return `Hace ${minutos} min`;

  const horas = Math.floor(minutos / 60);
  if (horas < 24) {
    const resto = minutos % 60;
    return resto > 0 ? `Hace ${horas} h ${resto} min` : `Hace ${horas} h`;
  }

  const dias = Math.floor(horas / 24);
  return dias === 1 ? "Ayer" : `Hace ${dias} días`;
}
