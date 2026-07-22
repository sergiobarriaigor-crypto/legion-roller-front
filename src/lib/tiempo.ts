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

// Filtros rápidos por fecha para el historial de recorridos del perfil.
export type FiltroFecha =
  | "todos"
  | "hoy"
  | "ayer"
  | "7dias"
  | "30dias"
  | "este_mes"
  | "mes_anterior"
  | "personalizado";

export const OPCIONES_FILTRO_FECHA: { valor: FiltroFecha; etiqueta: string }[] = [
  { valor: "todos", etiqueta: "Todos" },
  { valor: "hoy", etiqueta: "Hoy" },
  { valor: "ayer", etiqueta: "Ayer" },
  { valor: "7dias", etiqueta: "Últimos 7 días" },
  { valor: "30dias", etiqueta: "Últimos 30 días" },
  { valor: "este_mes", etiqueta: "Este mes" },
  { valor: "mes_anterior", etiqueta: "Mes anterior" },
  { valor: "personalizado", etiqueta: "Personalizado" },
];

function inicioDia(fecha: Date): Date {
  const d = new Date(fecha);
  d.setHours(0, 0, 0, 0);
  return d;
}

function finDia(fecha: Date): Date {
  const d = new Date(fecha);
  d.setHours(23, 59, 59, 999);
  return d;
}

// "personalizado" recibe fechaDesde/fechaHasta como strings yyyy-mm-dd (el
// formato nativo de <input type="date">). Si solo se define una de las dos,
// se interpreta como filtro de un único día (sección "Filtro por fecha
// específica" del pedido) en vez de un rango abierto.
export function dentroDeFiltroFecha(
  fechaISO: string,
  filtro: FiltroFecha,
  fechaDesde?: string,
  fechaHasta?: string,
): boolean {
  if (filtro === "todos") return true;
  const fecha = new Date(fechaISO);
  const ahora = new Date();

  switch (filtro) {
    case "hoy":
      return fecha >= inicioDia(ahora) && fecha <= finDia(ahora);
    case "ayer": {
      const ayer = new Date(ahora);
      ayer.setDate(ayer.getDate() - 1);
      return fecha >= inicioDia(ayer) && fecha <= finDia(ayer);
    }
    case "7dias": {
      const desde = new Date(ahora);
      desde.setDate(desde.getDate() - 6);
      return fecha >= inicioDia(desde) && fecha <= finDia(ahora);
    }
    case "30dias": {
      const desde = new Date(ahora);
      desde.setDate(desde.getDate() - 29);
      return fecha >= inicioDia(desde) && fecha <= finDia(ahora);
    }
    case "este_mes":
      return (
        fecha.getFullYear() === ahora.getFullYear() && fecha.getMonth() === ahora.getMonth()
      );
    case "mes_anterior": {
      const mesAnterior = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1);
      return (
        fecha.getFullYear() === mesAnterior.getFullYear() &&
        fecha.getMonth() === mesAnterior.getMonth()
      );
    }
    case "personalizado": {
      if (!fechaDesde && !fechaHasta) return true;
      const desde = fechaDesde ? inicioDia(new Date(`${fechaDesde}T00:00:00`)) : null;
      const hasta = fechaHasta
        ? finDia(new Date(`${fechaHasta}T00:00:00`))
        : desde
          ? finDia(new Date(`${fechaDesde}T00:00:00`))
          : null;
      if (desde && fecha < desde) return false;
      if (hasta && fecha > hasta) return false;
      return true;
    }
    default:
      return true;
  }
}
