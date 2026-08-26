// GPS V2 -- conversión de PosicionSimple (geolocacionNativa.ts) a FixCrudoV2,
// sin ninguna lógica propia. `iniciarWatcherV2` queda reservada para la Fase
// 3 (cuando V2 pase a ser dueño único del watcher real) -- en Fase 1 y 2 el
// único watcher real sigue siendo el de grabacionGps.ts (V1), que reparte
// cada fix hacia acá vía alimentarFixCrudoV2 (ver index.ts). No se llama
// desde ningún lado todavía a propósito.
import { iniciarSeguimientoUbicacion, type DetenerSeguimiento, type PosicionSimple } from "../geolocacionNativa";
import type { FixCrudoV2 } from "./tipos";

export function aFixCrudoV2(pos: PosicionSimple): FixCrudoV2 {
  return {
    lat: pos.lat,
    lon: pos.lon,
    accuracy: pos.accuracy,
    time: pos.time,
    speed: pos.speed,
    simulated: pos.simulated,
    horaRecepcion: Date.now(),
  };
}

// Reservado para Fase 3 -- ver comentario de arriba.
export function iniciarWatcherV2(onFix: (fix: FixCrudoV2) => void, onError: () => void): DetenerSeguimiento {
  return iniciarSeguimientoUbicacion((pos) => onFix(aFixCrudoV2(pos)), onError);
}
