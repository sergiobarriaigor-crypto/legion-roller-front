// V2 -- clasificación LOCAL del trazado del Video 2D, separada por completo
// de clasificarTramos() (geo.ts, sin tocar). Diagnóstico ruta 99: con datos
// de vehículo, clasificarTramos() marcaba 562/761 segmentos "saltoGps"
// (73.9%) -- 481 solo por dt<2s (cadencia de muestreo, no una anomalía) y
// 81 por mediana de racha >90km/h (perfil de velocidad de patinaje, no
// aplicable a vehículo). Quitar esas dos capas y dejar solo pico individual
// (>130km/h) + neto reducía a 6 falsos positivos residuales -- reales,
// parte de una racha de autopista continua, que un techo de velocidad
// absoluto seguiría cortando de todos modos.
//
// En vez de eso: la velocidad alta es solo la señal que abre la duda sobre
// un punto -- la decisión de cortar o no viene de mirar el punto SIGUIENTE
// (patrón A -> B -> C), exactamente la misma idea ya validada en
// gpsV2/pipeline.ts (procesarCandidatoPendiente):
//   - Si C converge cerca de A, B fue un rebote real -- se cortan los dos
//     segmentos que tocan B (evidencia fuerte, prioridad sobre lo
//     siguiente).
//   - Si no volvió al origen pero B->C mantiene un ritmo del mismo orden
//     que A->B, es aceleración real sostenida -- no se corta nada.
//   - Si ninguna de las dos se cumple, el caso es ambiguo -- no se corta
//     (esta clasificación solo corta ante evidencia fuerte).
//
// Todas las constantes reutilizadas son las que YA existen y ya están
// validadas en otro lado -- ninguna es nueva, y ninguna es "de vehículo":
// el umbral que abre sospecha es el mismo PERFIL_PATINAJE.techoPicoIndividualKmh
// que ya usa clasificarTramos(), y el radio de convergencia y el factor de
// "mantiene ritmo" son los mismos que ya usa GPS V2 para exactamente el
// mismo problema (ver gpsV2/constantes.ts y gpsV2/pipeline.ts).
import { distanciaHaversineKm, PERFIL_PATINAJE, type PuntoGps, type ClasificacionTramo } from "@/lib/geo";

const UMBRAL_SOSPECHA_KMH = PERFIL_PATINAJE.techoPicoIndividualKmh;
const RADIO_CONVERGENCIA_KM = 0.05; // mismo valor que CONVERGENCIA_RADIO_KM en gpsV2/constantes.ts
const FACTOR_MANTIENE_RITMO = 0.5; // mismo factor que gpsV2/pipeline.ts (ritmoSiguiente >= ritmoSalto * 0.5)

function kmh(a: PuntoGps, b: PuntoGps): number {
  const dtSeg = (b.timestamp - a.timestamp) / 1000;
  if (dtSeg <= 0) return Infinity;
  return (distanciaHaversineKm(a, b) / dtSeg) * 3600;
}

function convergen(a: PuntoGps, b: PuntoGps): boolean {
  return distanciaHaversineKm(a, b) <= RADIO_CONVERGENCIA_KM;
}

// Clasificación usada EXCLUSIVAMENTE para decidir qué segmentos dibuja el
// trazado del Video 2D (ver overlayFase5.ts) -- no reemplaza ni modifica
// clasificarTramos(), no se usa para velocidadMaximaConPunto ni para
// ninguna otra estadística.
export function clasificarTrazadoV2(puntos: PuntoGps[]): ClasificacionTramo[] {
  const clasificacion: ClasificacionTramo[] = puntos.map(() => "normal");
  for (let i = 1; i < puntos.length - 1; i++) {
    const A = puntos[i - 1];
    const B = puntos[i];
    const C = puntos[i + 1];
    const kmhAB = kmh(A, B);
    if (kmhAB <= UMBRAL_SOSPECHA_KMH) continue; // sin sospecha, no hay nada que confirmar

    // Prioridad: volvioAlOrigen se evalúa PRIMERO. Si se evaluara
    // "mantiene ritmo" antes, un rebote real (B lejos de A y de C) puede
    // parecer que "mantiene ritmo", porque volver de B a C también implica
    // una velocidad grande, del mismo orden que A->B -- eso daría un falso
    // "no cortar" sobre un rebote real.
    if (convergen(A, C)) {
      clasificacion[i] = "saltoGps"; // corta A->B
      clasificacion[i + 1] = "saltoGps"; // corta B->C
      continue;
    }

    const kmhBC = kmh(B, C);
    if (kmhBC >= kmhAB * FACTOR_MANTIENE_RITMO) continue; // aceleración real sostenida -- no cortar

    // Ni volvió al origen ni mantiene ritmo: ambiguo -- no se corta.
  }
  return clasificacion;
}
