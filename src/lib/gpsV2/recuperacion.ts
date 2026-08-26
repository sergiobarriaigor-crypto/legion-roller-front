// GPS V2 -- FASE 1. Lógica de convergencia compartida por dos casos: la
// recuperación tras un hueco real (estado RECUPERANDO) y la confirmación de
// un candidato-pendiente dentro de GRABANDO (protección tipo ruta 86) -- es
// la MISMA pregunta en ambos casos ("¿estos puntos son coherentes entre
// sí?"), así que vive en un solo lugar en vez de duplicarse.
import { distanciaHaversineKm } from "../geo";
import type { PuntoConfiableV2 } from "./tipos";
import { CONVERGENCIA_RADIO_KM } from "./constantes";

// true si `b` cae lo bastante cerca de `a` como para considerarlos "la misma
// posición real" -- ver CONVERGENCIA_RADIO_KM (mismo orden de magnitud que
// el margen de accuracy que V1 ya usaba para filtrar ruido).
export function convergen(a: PuntoConfiableV2, b: PuntoConfiableV2, radioKm = CONVERGENCIA_RADIO_KM): boolean {
  return distanciaHaversineKm(a, b) <= radioKm;
}
