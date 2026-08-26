// GPS V2 -- FASE 1. Corazón del módulo: decide qué hace cada fix crudo.
// Expuesto como fábrica (crearPipelineV2) en vez de estado de módulo directo
// -- así una prueba puede crear tantas instancias limpias como necesite, y
// watcher.ts/index.ts arman UNA sola instancia real para producción, igual
// de simple.
import { distanciaHaversineKm } from "../geo";
import { convergen } from "./recuperacion";
import { validarFixCrudo } from "./validacion";
import type {
  DiscontinuidadV2,
  EstadoGpsV2,
  FixCrudoV2,
  PuntoConfiableV2,
  ResultadoProcesarFix,
} from "./tipos";
import {
  FACTOR_ACCURACY_RUIDO,
  FACTOR_SALTO_SOSPECHOSO,
  KM_MOVIMIENTO_SIGNIFICATIVO,
  PRECISION_INICIAL_MAXIMA_M,
  PRECISION_MAXIMA_PUNTO_GRABADO_M,
  TOLERANCIA_CONTRADICCION_SPEED,
  UMBRAL_HUECO_SEG,
  VENTANA_ESTABILIZACION_SEG,
  VENTANA_PASO_TIPICO_FIXES,
} from "./constantes";

export interface PipelineV2 {
  procesarFix(fix: FixCrudoV2): ResultadoProcesarFix;
  iniciar(): void; // arranca GRABANDO, limpia todo estado de una grabación anterior
  finalizar(): PuntoConfiableV2[]; // pasa por FINALIZANDO, devuelve los puntos confiables acumulados
  obtenerEstado(): EstadoGpsV2;
  obtenerPuntosConfiables(): PuntoConfiableV2[];
  obtenerDiscontinuidades(): DiscontinuidadV2[];
}

function mediana(valores: number[]): number {
  if (valores.length === 0) return 0;
  const ordenados = [...valores].sort((a, b) => a - b);
  const mitad = Math.floor(ordenados.length / 2);
  return ordenados.length % 2 === 0 ? (ordenados[mitad - 1] + ordenados[mitad]) / 2 : ordenados[mitad];
}

function dtSegundos(a: PuntoConfiableV2, b: { time: number | null }): number | null {
  if (b.time === null) return null;
  return (b.time - a.timestamp) / 1000;
}

export function crearPipelineV2(): PipelineV2 {
  let estado: EstadoGpsV2 = "SIN_GRABACION";
  let puntosConfiables: PuntoConfiableV2[] = [];
  const discontinuidades: DiscontinuidadV2[] = [];
  // Ventana adaptativa del "paso típico" reciente -- nunca un techo de
  // velocidad fijo, se recalcula sola con el ritmo real de esta grabación.
  let pasosRecientesKm: number[] = [];

  // Candidato-pendiente dentro de GRABANDO (protección tipo ruta 86, sin
  // hueco evidente) -- separado del candidato de RECUPERANDO a propósito:
  // son conceptos distintos aunque compartan la función `convergen`.
  let candidatoPendiente: PuntoConfiableV2 | null = null;

  // Candidatos acumulados mientras estado === RECUPERANDO.
  let candidatosRecuperacion: PuntoConfiableV2[] = [];
  let inicioRecuperacionTime: number | null = null;

  // Hora del ÚLTIMO FIX RECIBIDO (llegue a confiable, candidato o ruido) --
  // el hueco se mide contra esto, NUNCA contra el último punto confiable.
  // Sin esta distinción, una racha de fixes clasificados como "ruido"
  // (persona quieta, sin ningún hueco real del watcher) terminaba pareciendo
  // un hueco falso apenas se acumulaban 30s desde el último punto que sí se
  // aceptó, aunque el GPS nunca hubiera dejado de responder.
  let ultimoFixRecibidoTime: number | null = null;

  function ultimoConfiable(): PuntoConfiableV2 | null {
    return puntosConfiables.length > 0 ? puntosConfiables[puntosConfiables.length - 1] : null;
  }

  function registrarPaso(distKm: number): void {
    pasosRecientesKm.push(distKm);
    if (pasosRecientesKm.length > VENTANA_PASO_TIPICO_FIXES) pasosRecientesKm.shift();
  }

  function aceptarConfiable(punto: PuntoConfiableV2, discontinuidad: DiscontinuidadV2["motivo"] | null): ResultadoProcesarFix {
    const previo = ultimoConfiable();
    puntosConfiables.push(punto);
    let discReg: DiscontinuidadV2 | null = null;
    if (discontinuidad && previo) {
      discReg = {
        antesIndice: puntosConfiables.length - 2,
        despuesIndice: puntosConfiables.length - 1,
        motivo: discontinuidad,
      };
      discontinuidades.push(discReg);
    } else if (previo) {
      registrarPaso(distanciaHaversineKm(previo, punto));
    }
    return { tipo: "confiable", punto, discontinuidad: discReg };
  }

  function entrarEnRecuperacion(fix: FixCrudoV2): ResultadoProcesarFix {
    estado = "RECUPERANDO";
    candidatoPendiente = null;
    candidatosRecuperacion = [{ lat: fix.lat, lon: fix.lon, timestamp: fix.time as number }];
    inicioRecuperacionTime = fix.time;
    return { tipo: "candidato-recuperacion" };
  }

  function procesarEnRecuperacion(fix: FixCrudoV2): ResultadoProcesarFix {
    if (fix.time === null) return { tipo: "rechazado", motivo: "sin-fix-time-en-recuperacion" };
    if (fix.accuracy > PRECISION_MAXIMA_PUNTO_GRABADO_M) {
      return { tipo: "candidato-recuperacion" }; // se ignora como candidato, pero no rompe la ventana
    }
    const nuevo: PuntoConfiableV2 = { lat: fix.lat, lon: fix.lon, timestamp: fix.time };
    const ultimo = candidatosRecuperacion[candidatosRecuperacion.length - 1];
    if (convergen(ultimo, nuevo)) {
      candidatosRecuperacion.push(nuevo);
      if (candidatosRecuperacion.length >= 2) {
        estado = "GRABANDO";
        pasosRecientesKm = []; // el ritmo previo al hueco no dice nada del nuevo tramo
        ultimoFixRecibidoTime = nuevo.timestamp;
        const resultado = aceptarConfiable(nuevo, "hueco");
        candidatosRecuperacion = [];
        inicioRecuperacionTime = null;
        return resultado;
      }
      return { tipo: "candidato-recuperacion" };
    }
    // No convergió con el candidato anterior: ese anterior era ruido/rebote,
    // este fix pasa a ser el nuevo candidato de referencia. La ventana de
    // tiempo sigue contando desde el inicio real del hueco (inicioRecuperacionTime),
    // no se reinicia -- si nunca converge, igual se resuelve al vencer la ventana.
    candidatosRecuperacion = [nuevo];
    return { tipo: "candidato-recuperacion" };
  }

  function resolverVentanaVencidaSiCorresponde(fix: FixCrudoV2): ResultadoProcesarFix | null {
    if (inicioRecuperacionTime === null || fix.time === null) return null;
    const transcurridoSeg = (fix.time - inicioRecuperacionTime) / 1000;
    if (transcurridoSeg < VENTANA_ESTABILIZACION_SEG) return null;
    const ultimo = candidatosRecuperacion[candidatosRecuperacion.length - 1];
    estado = "GRABANDO";
    pasosRecientesKm = [];
    ultimoFixRecibidoTime = ultimo.timestamp;
    const resultado = aceptarConfiable(ultimo, "hueco");
    candidatosRecuperacion = [];
    inicioRecuperacionTime = null;
    return resultado;
  }

  // Candidato-pendiente dentro de GRABANDO -- ver constantes.ts
  // (FACTOR_SALTO_SOSPECHOSO) para la justificación de por qué esto NO es un
  // techo de velocidad fijo.
  //
  // La confirmación NO puede depender solo de "el fix siguiente cae cerca
  // del candidato" (convergencia por proximidad): eso funciona para una
  // pausa/recuperación (el patinador sigue ~en el mismo lugar), pero NO para
  // una aceleración real y sostenida (ej. una bajada), donde el fix
  // siguiente sigue alejándose del candidato a un ritmo similar, nunca
  // "converge" espacialmente con él. Por eso se combinan dos chequeos
  // independientes -- si CUALQUIERA de los dos confirma, se acepta:
  //   (a) proximidad: el fix siguiente cae cerca del candidato (pausa/recuperación)
  //   (b) continuidad de ritmo: el tramo candidato→fix mantiene un ritmo del
  //       mismo orden que el tramo confiable→candidato que generó la duda
  //       (aceleración sostenida real, aunque la distancia siga creciendo)
  function procesarCandidatoPendiente(fix: FixCrudoV2, fixPunto: PuntoConfiableV2): ResultadoProcesarFix {
    const pendiente = candidatoPendiente as PuntoConfiableV2;
    const ultimoReal = ultimoConfiable() as PuntoConfiableV2;
    const dtPendienteAFix = dtSegundos(pendiente, fix);

    if (dtPendienteAFix !== null && dtPendienteAFix >= UMBRAL_HUECO_SEG) {
      // Silencio real entre el candidato y este fix: no fue un rebote
      // aislado, perdimos señal de verdad. El candidato pendiente se
      // descarta (nunca se dibujó ni movió el marcador) y arrancamos
      // RECUPERANDO con este fix.
      return entrarEnRecuperacion(fix);
    }

    const volvioAlOrigen = convergen(ultimoReal, fixPunto);
    if (volvioAlOrigen) {
      // Volvió cerca de donde ya estaba antes del salto: el candidato
      // pendiente fue un rebote/deriva aislada -- se descarta sin más y
      // este fix se evalúa como un fix normal contra el confiable de siempre.
      candidatoPendiente = null;
      return procesarEnGrabandoNormal(fix, fixPunto, ultimoReal);
    }

    const convergeConCandidato = convergen(pendiente, fixPunto);
    const dtUltimoCandidato = dtSegundos(ultimoReal, { time: pendiente.timestamp });
    const ritmoSalto =
      dtUltimoCandidato && dtUltimoCandidato > 0
        ? distanciaHaversineKm(ultimoReal, pendiente) / dtUltimoCandidato
        : null;
    const ritmoSiguiente = dtPendienteAFix && dtPendienteAFix > 0 ? distanciaHaversineKm(pendiente, fixPunto) / dtPendienteAFix : null;
    // No se derrumbó de vuelta a un ritmo mucho más lento -- sigue siendo del
    // mismo orden que lo que generó la sospecha (aceleración sostenida real).
    const mantieneRitmo = ritmoSalto !== null && ritmoSiguiente !== null && ritmoSiguiente >= ritmoSalto * 0.5;

    if (convergeConCandidato || mantieneRitmo) {
      // El desplazamiento continúa de forma coherente (cerca del candidato,
      // o siguiendo a un ritmo similar): la trayectoria realmente cambió.
      // Se aceptan AMBOS, marcando el quiebre respecto del confiable
      // anterior a la duda.
      candidatoPendiente = null;
      puntosConfiables.push(pendiente);
      discontinuidades.push({
        antesIndice: puntosConfiables.length - 2,
        despuesIndice: puntosConfiables.length - 1,
        motivo: "cambio-trayectoria",
      });
      return aceptarConfiable(fixPunto, null);
    }

    // Ni converge/mantiene ritmo con el candidato ni volvió al confiable
    // anterior: ambos puntos son ambiguos entre sí. Se descarta el candidato
    // viejo y este fix pasa a ser el nuevo candidato -- evita acumular
    // indefinidamente sin nunca decidir.
    candidatoPendiente = fixPunto;
    return { tipo: "candidato-pendiente" };
  }

  function procesarEnGrabandoNormal(
    fix: FixCrudoV2,
    fixPunto: PuntoConfiableV2,
    ultimo: PuntoConfiableV2,
  ): ResultadoProcesarFix {
    const distKm = distanciaHaversineKm(ultimo, fixPunto);
    const umbralRuido = Math.max(KM_MOVIMIENTO_SIGNIFICATIVO, (fix.accuracy * FACTOR_ACCURACY_RUIDO) / 1000);
    if (distKm < umbralRuido) {
      return { tipo: "ruido" };
    }

    const dtSeg = dtSegundos(ultimo, fix);
    const pasoTipico = mediana(pasosRecientesKm) || umbralRuido;
    const factorSalto = distKm / Math.max(pasoTipico, umbralRuido);

    let contradiceSpeed = false;
    if (fix.speed !== null && dtSeg !== null && dtSeg > 0) {
      const kmhImplicito = (distKm / dtSeg) * 3600;
      const kmhChip = fix.speed * 3.6;
      const base = Math.max(kmhChip, 1);
      contradiceSpeed = Math.abs(kmhImplicito - kmhChip) / base > TOLERANCIA_CONTRADICCION_SPEED;
    }

    const sospechoso = factorSalto > FACTOR_SALTO_SOSPECHOSO || contradiceSpeed;

    if (!sospechoso) {
      return aceptarConfiable(fixPunto, null);
    }

    candidatoPendiente = fixPunto;
    return { tipo: "candidato-pendiente" };
  }

  function procesarFix(fix: FixCrudoV2): ResultadoProcesarFix {
    if (estado === "SIN_GRABACION" || estado === "FINALIZANDO") {
      return { tipo: "rechazado", motivo: "sin-grabacion-activa" };
    }

    const validacion = validarFixCrudo(fix, ultimoConfiable()?.timestamp ?? null);
    if (!validacion.aceptado) {
      return { tipo: "rechazado", motivo: validacion.motivo as string };
    }

    if (estado === "RECUPERANDO") {
      const porVentana = resolverVentanaVencidaSiCorresponde(fix);
      if (porVentana) return porVentana;
      return procesarEnRecuperacion(fix);
    }

    // estado === "GRABANDO"
    const ultimo = ultimoConfiable();
    if (fix.time === null) {
      // Sin timestamp real no se puede confiar en orden/hueco -- nunca entra
      // directo en GRABANDO (regla 1). Podría eventualmente convertirse en
      // candidato de RECUPERANDO si ya estamos ahí, pero no arranca uno.
      return { tipo: "rechazado", motivo: "sin-fix-time" };
    }

    if (!ultimo) {
      // Primer fix de la grabación: mismo gate inicial más estricto que V1.
      if (fix.accuracy > PRECISION_INICIAL_MAXIMA_M) {
        return { tipo: "rechazado", motivo: "primer-punto-precision-insuficiente" };
      }
      ultimoFixRecibidoTime = fix.time;
      return aceptarConfiable({ lat: fix.lat, lon: fix.lon, timestamp: fix.time }, null);
    }

    // Hueco: medido contra el último FIX RECIBIDO (cualquiera haya sido su
    // resultado), no contra el último punto confiable -- ver comentario en
    // la declaración de ultimoFixRecibidoTime más arriba.
    const dtDesdeUltimoFix = (fix.time - (ultimoFixRecibidoTime ?? ultimo.timestamp)) / 1000;
    if (dtDesdeUltimoFix >= UMBRAL_HUECO_SEG) {
      return entrarEnRecuperacion(fix);
    }
    ultimoFixRecibidoTime = fix.time;

    if (fix.accuracy > PRECISION_MAXIMA_PUNTO_GRABADO_M) {
      return { tipo: "rechazado", motivo: "accuracy-insuficiente" };
    }

    const fixPunto: PuntoConfiableV2 = { lat: fix.lat, lon: fix.lon, timestamp: fix.time };

    if (candidatoPendiente) {
      return procesarCandidatoPendiente(fix, fixPunto);
    }

    return procesarEnGrabandoNormal(fix, fixPunto, ultimo);
  }

  return {
    procesarFix,
    iniciar() {
      estado = "GRABANDO";
      puntosConfiables = [];
      discontinuidades.length = 0;
      pasosRecientesKm = [];
      candidatoPendiente = null;
      candidatosRecuperacion = [];
      inicioRecuperacionTime = null;
      ultimoFixRecibidoTime = null;
    },
    finalizar() {
      estado = "FINALIZANDO";
      const puntos = puntosConfiables;
      estado = "SIN_GRABACION";
      return puntos;
    },
    obtenerEstado: () => estado,
    obtenerPuntosConfiables: () => puntosConfiables,
    obtenerDiscontinuidades: () => discontinuidades,
  };
}
