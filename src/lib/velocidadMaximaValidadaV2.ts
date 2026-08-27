// V2 -- velocidad máxima CREÍBLE de un recorrido, sin pasar por
// clasificarTramos() (geo.ts, sin tocar) ni por sus capas dt<2s / mediana
// de racha, ya demostradas incompatibles con movimiento vehicular real
// (ver diagnóstico ruta 99: velocidadMaximaConPunto() reportaba 84 km/h
// -- calculado sobre los 50 puntos decimados de misRecorridos(), y aun
// sobre los 762 puntos completos quedaba en 88.1 -- cuando la velocidad
// implícita real llegaba a ~143 km/h).
//
// Objetivo distinto al de clasificacionTrazadoV2.ts (ese decide qué
// dibuja el trazado del Video 2D; este solo busca UN número: la mayor
// velocidad implícita que se pueda dar por real). Por eso el criterio acá
// es más conservador: un tramo solo cuenta para la máxima si se puede
// CONFIRMAR positivamente con el punto siguiente -- ni "ambiguo" ni "sin
// vecino para confirmar" alcanzan (a diferencia del trazado, donde lo
// ambiguo se deja sin cortar).
//
// Mismo patrón A->B->C ya validado en gpsV2/pipeline.ts
// (procesarCandidatoPendiente) y en clasificacionTrazadoV2.ts: sin techo
// fijo de velocidad que rechace por sí solo -- se evalúa cada candidato,
// de mayor a menor velocidad implícita, hasta encontrar uno confirmado:
//   - Si C converge cerca de A, B fue un rebote -- se descarta, se prueba
//     el siguiente candidato (evidencia fuerte, prioridad sobre lo
//     siguiente).
//   - Si B->C mantiene un ritmo del mismo orden que A->B, es aceleración
//     real sostenida -- ese candidato es la máxima creíble.
//   - Si no se cumple ninguna de las dos (ambiguo) o no hay punto C para
//     confirmar (candidato pegado al final del recorrido), se descarta
//     igual -- se prueba el siguiente.
import { distanciaHaversineKm, type PuntoGps } from "@/lib/geo";

const RADIO_CONVERGENCIA_KM = 0.05; // mismo valor que CONVERGENCIA_RADIO_KM en gpsV2/constantes.ts
const FACTOR_MANTIENE_RITMO = 0.5; // mismo factor que gpsV2/pipeline.ts (ritmoSiguiente >= ritmoSalto * 0.5)

export interface VelocidadMaximaValidadaV2 {
  kmh: number;
  indice: number; // indice en `puntos` del extremo B del tramo A->B ganador, -1 si no hay ninguno confirmable
  punto: PuntoGps | null;
}

function kmh(a: PuntoGps, b: PuntoGps): number {
  const dtSeg = (b.timestamp - a.timestamp) / 1000;
  if (dtSeg <= 0) return Infinity;
  return (distanciaHaversineKm(a, b) / dtSeg) * 3600;
}

function convergen(a: PuntoGps, b: PuntoGps): boolean {
  return distanciaHaversineKm(a, b) <= RADIO_CONVERGENCIA_KM;
}

// ¿El tramo A->B (A=puntos[i-1], B=puntos[i]) es un movimiento real
// confirmado por el punto siguiente? Requiere que exista puntos[i+1].
function esTramoCreible(puntos: PuntoGps[], i: number): boolean {
  if (i + 1 >= puntos.length) return false; // sin C, no hay como confirmar -- no cuenta
  const A = puntos[i - 1];
  const B = puntos[i];
  const C = puntos[i + 1];

  // Prioridad: volvioAlOrigen se evalúa primero (mismo motivo que en
  // clasificacionTrazadoV2.ts -- evaluar "mantieneRitmo" antes daría falso
  // positivo en un rebote real, porque volver de B a C también implica
  // velocidad alta).
  if (convergen(A, C)) return false; // rebote confirmado

  const kmhAB = kmh(A, B);
  const kmhBC = kmh(B, C);
  return kmhBC >= kmhAB * FACTOR_MANTIENE_RITMO; // sostenido -- creible
}

// Recorre TODOS los tramos con dt>0, de mayor a menor velocidad implícita,
// y devuelve el primero que se pueda confirmar como movimiento real. Sin
// techo de velocidad que rechace nada por sí solo -- cualquier velocidad,
// por alta que sea, puede ganar si el contexto la confirma.
export function velocidadMaximaValidadaV2(puntos: PuntoGps[]): VelocidadMaximaValidadaV2 {
  const candidatos: { i: number; kmh: number }[] = [];
  for (let i = 1; i < puntos.length; i++) {
    const dtSeg = (puntos[i].timestamp - puntos[i - 1].timestamp) / 1000;
    if (dtSeg <= 0) continue; // sin "por segundo" real, no es un dato de velocidad valido
    candidatos.push({ i, kmh: kmh(puntos[i - 1], puntos[i]) });
  }
  candidatos.sort((a, b) => b.kmh - a.kmh);

  for (const candidato of candidatos) {
    if (esTramoCreible(puntos, candidato.i)) {
      return { kmh: candidato.kmh, indice: candidato.i, punto: puntos[candidato.i] };
    }
  }
  return { kmh: 0, indice: -1, punto: null };
}
