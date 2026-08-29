// GPS V2 -- FASE 1. Verificación manual del pipeline contra los 5 escenarios
// acordados antes de implementar, más algunos chequeos de base. No es un
// test de un framework (el proyecto no tiene ninguno instalado) -- se corre
// a mano con:
//
//   npx tsx src/lib/gpsV2/pruebas.manual.ts
//
// Sirve como documentación viva del comportamiento esperado y como
// regresión rápida durante la Fase 2 (comparación V1 vs V2 con datos
// reales). Se borra junto con V1 al cerrar la migración (Fase 4).
import assert from "node:assert/strict";
import { crearPipelineV2 } from "./pipeline";
import type { FixCrudoV2 } from "./tipos";
import {
  iniciarPipelineV2,
  alimentarFixCrudoV2,
  obtenerResumenGpsV2,
  detenerPipelineV2,
  informarDisponibilidadUbicacionV2,
  obtenerGrabacionActivaV2,
} from "./index";

const LAT0 = -41.4693;
const LON0 = -72.9424;
const T0 = 1_700_000_000_000;
const M_POR_GRADO_LAT = 111_320;
const M_POR_GRADO_LON = 111_320 * Math.cos((LAT0 * Math.PI) / 180);

// Fix sintético a partir de desplazamientos en metros (norte/este) respecto
// de un origen fijo -- así cada escenario se arma con distancias/tiempos
// legibles en vez de coordenadas crípticas.
function fix(
  norteM: number,
  esteM: number,
  tSeg: number,
  opciones: { accuracy?: number; speed?: number | null; simulated?: boolean | null } = {},
): FixCrudoV2 {
  return {
    lat: LAT0 + norteM / M_POR_GRADO_LAT,
    lon: LON0 + esteM / M_POR_GRADO_LON,
    accuracy: opciones.accuracy ?? 8,
    time: T0 + tSeg * 1000,
    speed: opciones.speed ?? null,
    simulated: opciones.simulated ?? false,
    horaRecepcion: T0 + tSeg * 1000,
  };
}

let ok = 0;
function verificar(nombre: string, fn: () => void): void {
  fn();
  ok++;
  console.log(`OK: ${nombre}`);
}

// --- Escenario 5: dos fixes normales consecutivos mientras patina ---------
verificar("escenario 5 -- ritmo normal, ambos entran directo", () => {
  const p = crearPipelineV2();
  p.iniciar();
  const r0 = p.procesarFix(fix(0, 0, 0));
  assert.equal(r0.tipo, "confiable");
  const r1 = p.procesarFix(fix(40, 0, 10)); // 40m en 10s (~14.4 km/h)
  assert.equal(r1.tipo, "confiable");
  const r2 = p.procesarFix(fix(80, 0, 20)); // mismo ritmo
  assert.equal(r2.tipo, "confiable");
  assert.equal(p.obtenerEstado(), "GRABANDO");
  assert.equal(p.obtenerPuntosConfiables().length, 3);
  assert.equal(p.obtenerDiscontinuidades().length, 0);
});

// --- Escenario 3: aceleración real y sostenida (bajada) -------------------
verificar("escenario 3 -- aceleracion sostenida se acepta sin techo de velocidad", () => {
  const p = crearPipelineV2();
  p.iniciar();
  p.procesarFix(fix(0, 0, 0));
  p.procesarFix(fix(40, 0, 10));
  p.procesarFix(fix(80, 0, 20)); // paso típico establecido: ~40m/10s

  // Salto grande respecto del paso típico -- se vuelve candidato, NO se
  // rechaza ni se acepta directo.
  const rCandidato = p.procesarFix(fix(330, 0, 30)); // 250m en 10s (~90 km/h)
  assert.equal(rCandidato.tipo, "candidato-pendiente");
  assert.equal(p.obtenerPuntosConfiables().length, 3, "el candidato todavia no se agrega al recorrido");

  // El siguiente fix SIGUE alejándose del candidato a un ritmo similar (no
  // "converge" espacialmente con él) -- esto es lo que rompía la regla
  // basada solo en proximidad, y lo que arregla el chequeo de continuidad
  // de ritmo.
  const rConfirma = p.procesarFix(fix(570, 0, 40)); // 240m mas en 10s
  assert.equal(rConfirma.tipo, "confiable");
  assert.equal(p.obtenerPuntosConfiables().length, 5, "se aceptan candidato + fix confirmatorio");
  assert.equal(p.obtenerDiscontinuidades().length, 1);
  assert.equal(p.obtenerDiscontinuidades()[0].motivo, "cambio-trayectoria");
});

// --- Escenario 2: desplazamiento lateral SIN hueco (patrón ruta 86) -------
verificar("escenario 2 -- desplazamiento lateral se descarta como rebote", () => {
  const p = crearPipelineV2();
  p.iniciar();
  p.procesarFix(fix(0, 0, 0));
  p.procesarFix(fix(40, 0, 10));
  p.procesarFix(fix(80, 0, 20)); // paso típico ~40m/10s, viniendo derecho hacia el norte

  // Un solo fix se desplaza 250m hacia el este -- nada de hueco (dt normal).
  const rCandidato = p.procesarFix(fix(80, 250, 30));
  assert.equal(rCandidato.tipo, "candidato-pendiente");

  // El fix siguiente retoma la trayectoria real (sigue derecho hacia el
  // norte, cerca de donde ya estábamos antes del salto) -- el candidato
  // lateral se descarta como rebote, nunca llega a dibujarse.
  const rVuelve = p.procesarFix(fix(120, 0, 40));
  assert.equal(rVuelve.tipo, "confiable");
  const puntos = p.obtenerPuntosConfiables();
  assert.equal(puntos.length, 4, "el punto desplazado lateralmente nunca se agrego");
  assert.ok(
    puntos.every((pt) => Math.abs(pt.lon - LON0) < 0.001),
    "ningun punto confiable quedo desplazado hacia el este",
  );
  assert.equal(p.obtenerDiscontinuidades().length, 0, "un rebote descartado no es una discontinuidad real");
});

// --- Escenario 1: hueco + ráfaga al recuperar (patrón ruta 85) ------------
verificar("escenario 1 -- hueco largo entra en RECUPERANDO y la rafaga converge rapido", () => {
  const p = crearPipelineV2();
  p.iniciar();
  p.procesarFix(fix(0, 0, 0));
  assert.equal(p.obtenerEstado(), "GRABANDO");

  // ~300s sin señal, igual que la ruta 85 real.
  const rHueco = p.procesarFix(fix(500, 0, 301));
  assert.equal(rHueco.tipo, "candidato-recuperacion");
  assert.equal(p.obtenerEstado(), "RECUPERANDO");
  assert.equal(p.obtenerPuntosConfiables().length, 1, "el primer fix post-hueco no se agrega solo");

  // Ráfaga real: fixes casi simultáneos, coherentes entre sí.
  const rConverge = p.procesarFix(fix(503, 1, 301.1));
  assert.equal(rConverge.tipo, "confiable");
  assert.equal(p.obtenerEstado(), "GRABANDO");
  assert.equal(p.obtenerDiscontinuidades().length, 1);
  assert.equal(p.obtenerDiscontinuidades()[0].motivo, "hueco");
});

// --- Escenario 4: persona detenida varios minutos -------------------------
verificar("escenario 4a -- quieto con fixes seguidos (sin hueco real) no genera movimiento falso", () => {
  const p = crearPipelineV2();
  p.iniciar();
  p.procesarFix(fix(0, 0, 0));
  // 18 fixes cada 10s (3 minutos) con jitter de GPS bien por debajo del piso
  // de ruido -- nunca hay un hueco real (dt siempre 10s) ni movimiento.
  for (let i = 1; i <= 18; i++) {
    const jitterM = (i % 3) - 1; // -1, 0, 1 metros
    const r = p.procesarFix(fix(jitterM, jitterM, i * 10, { accuracy: 8 }));
    assert.equal(r.tipo, "ruido", `fix ${i} deberia ser ruido, no movimiento`);
  }
  assert.equal(p.obtenerEstado(), "GRABANDO");
  assert.equal(p.obtenerPuntosConfiables().length, 1, "la posicion nunca se movio");
});

verificar("escenario 4b -- pausa larga (hueco real) reanuda en el mismo lugar sin drama", () => {
  const p = crearPipelineV2();
  p.iniciar();
  p.procesarFix(fix(0, 0, 0));
  // El telefono se suspende 40s (hueco) mientras la persona sigue parada.
  const rHueco = p.procesarFix(fix(2, 1, 40));
  assert.equal(rHueco.tipo, "candidato-recuperacion");
  // Reaparece prácticamente en el mismo lugar.
  const rReanuda = p.procesarFix(fix(3, -1, 40.5));
  assert.equal(rReanuda.tipo, "confiable");
  const puntos = p.obtenerPuntosConfiables();
  assert.equal(puntos.length, 2);
  // La ruta "continúa normalmente" -- el nuevo punto confiable queda a
  // metros del original, no genera un salto visible.
  const distM =
    Math.hypot((puntos[1].lat - puntos[0].lat) * M_POR_GRADO_LAT, (puntos[1].lon - puntos[0].lon) * M_POR_GRADO_LON);
  assert.ok(distM < 10, `esperaba <10m de diferencia, hubo ${distM.toFixed(1)}m`);
});

// --- Chequeos de base ------------------------------------------------------
verificar("fix simulado nunca entra", () => {
  const p = crearPipelineV2();
  p.iniciar();
  p.procesarFix(fix(0, 0, 0));
  const r = p.procesarFix(fix(50, 0, 10, { simulated: true }));
  assert.equal(r.tipo, "rechazado");
  assert.equal(p.obtenerPuntosConfiables().length, 1);
});

verificar("fix fuera de orden temporal se rechaza", () => {
  const p = crearPipelineV2();
  p.iniciar();
  p.procesarFix(fix(0, 0, 10));
  const r = p.procesarFix(fix(50, 0, 5)); // time anterior al ultimo confiable
  assert.equal(r.tipo, "rechazado");
});

verificar("primer fix con accuracy pobre se rechaza (gate inicial mas estricto)", () => {
  const p = crearPipelineV2();
  p.iniciar();
  const r = p.procesarFix(fix(0, 0, 0, { accuracy: 25 })); // > 20m inicial
  assert.equal(r.tipo, "rechazado");
  assert.equal(p.obtenerPuntosConfiables().length, 0);
});

// --- Ajuste ruta 95: sospecha por VELOCIDAD implicita, no por distancia ---
// Helper: establece un ritmo tipico normal de patinaje (~14.4 km/h) con 3
// fixes antes de cada caso, igual que hace la ruta real antes de un tramo
// dudoso.
function conRitmoEstablecido(p: ReturnType<typeof crearPipelineV2>): void {
  p.iniciar();
  p.procesarFix(fix(0, 0, 0));
  p.procesarFix(fix(40, 0, 10)); // 40m/10s -- sin ritmo previo, entra directo
  p.procesarFix(fix(80, 0, 20)); // 40m/10s -- ritmo tipico ya queda en ~14.4 km/h
}

verificar("ruta95-1 -- 49m en ~125s (ritmo de caminata) NO es sospechoso", () => {
  const p = crearPipelineV2();
  conRitmoEstablecido(p); // ultimo confiable: (80,0,t=20)
  // Fixes intermedios de jitter (ruido, <30m del ultimo confiable, cada uno
  // a <30s del anterior para no disparar hueco real) -- igual que un GPS
  // real siguiendo emitiendo fixes mientras la persona esta parada/lenta.
  assert.equal(p.procesarFix(fix(82, 1, 45)).tipo, "ruido");
  assert.equal(p.procesarFix(fix(81, -1, 70)).tipo, "ruido");
  assert.equal(p.procesarFix(fix(80, 2, 95)).tipo, "ruido");
  assert.equal(p.procesarFix(fix(82, -1, 120)).tipo, "ruido");
  // Recien acá se acumulan los 49m reales desde el ultimo confiable, a los
  // ~125s de real -- ritmo implicito ~1.4 km/h, nada sospechoso.
  const r = p.procesarFix(fix(129, 0, 145));
  assert.equal(r.tipo, "confiable", "una pausa/frenada real no debe verse como salto");
  assert.equal(p.obtenerPuntosConfiables().length, 4);
  assert.equal(p.obtenerDiscontinuidades().length, 0);
});

verificar("ruta95-2 -- 49m en 1s (mismo ritmo tipico) SI es sospechoso", () => {
  const p = crearPipelineV2();
  conRitmoEstablecido(p);
  const r = p.procesarFix(fix(129, 0, 21)); // 49m desde el ultimo confiable, en 1s (~176 km/h)
  assert.equal(r.tipo, "candidato-pendiente", "un salto real de decenas de metros en 1s debe seguir siendo sospechoso");
});

verificar("ruta95-3 -- arranque desde parado no genera falso cambio-trayectoria", () => {
  const p = crearPipelineV2();
  p.iniciar();
  p.procesarFix(fix(0, 0, 0)); // primer punto de toda la grabacion
  // Primer movimiento real: sin ningun ritmo previo (ventana vacia), aunque
  // sea rapido para ser "el primer paso" no hay referencia contra la cual
  // compararlo -- no debe dispararse sospecha solo por el factor relativo.
  const r = p.procesarFix(fix(45, 0, 3)); // 45m en 3s (~54 km/h)
  assert.equal(r.tipo, "confiable", "el arranque no tiene ritmo previo para comparar, no debe marcarse sospechoso");
  assert.equal(p.obtenerPuntosConfiables().length, 2);
});

verificar("ruta95-4 -- frenado/semaforo y reanudacion al mismo ritmo no genera falso positivo", () => {
  const p = crearPipelineV2();
  conRitmoEstablecido(p); // ritmo tipico ~14.4 km/h, ultimo confiable en (80,0,t=20)
  // Se detiene: fixes casi en el mismo lugar, por debajo del piso de ruido
  // (simula esperar en un semaforo), cada uno a <30s del anterior para no
  // disparar un hueco real -- deben clasificarse "ruido", no tocan el
  // ritmo tipico.
  const rQuieto1 = p.procesarFix(fix(81, 0, 45));
  assert.equal(rQuieto1.tipo, "ruido");
  const rQuieto2 = p.procesarFix(fix(80, 1, 70));
  assert.equal(rQuieto2.tipo, "ruido");
  // Reanuda al mismo ritmo de siempre: 40m en 70s desde el ultimo confiable
  // real (80,0,t=20) -- mucho mas lento que el ritmo tipico porque incluye
  // la espera, pero no es un salto.
  const rReanuda = p.procesarFix(fix(120, 0, 90));
  assert.equal(rReanuda.tipo, "confiable", "reanudar tras una pausa real no debe marcarse como salto");
  assert.equal(p.obtenerDiscontinuidades().length, 0);
});

verificar("ruta95-5 -- bajada con aceleracion sostenida se confirma como trayectoria real", () => {
  const p = crearPipelineV2();
  conRitmoEstablecido(p); // ritmo tipico ~14.4 km/h
  // Acelera fuerte y sostenido: cada paso sigue alejandose a un ritmo
  // similar entre si (~90 km/h), nunca "vuelve" ni converge con el anterior.
  const rCandidato = p.procesarFix(fix(340, 0, 30)); // 260m en 10s (~93 km/h) desde (80,0,20)
  assert.equal(rCandidato.tipo, "candidato-pendiente", "el salto de ritmo debe verse como sospechoso primero");
  const rConfirma = p.procesarFix(fix(590, 0, 40)); // 250m mas en 10s, mismo ritmo alto sostenido
  assert.equal(rConfirma.tipo, "confiable", "la aceleracion sostenida real debe terminar confirmandose");
  assert.equal(p.obtenerDiscontinuidades().length, 1);
  assert.equal(p.obtenerDiscontinuidades()[0].motivo, "cambio-trayectoria");
});

// --- Ajuste ruta 96: piso de referencia cuando ritmoTipico se degrada -----
verificar("ruta96 -- ritmo tipico degradado por pausa/caminata lenta no dispara falso positivo, pero un salto real si", () => {
  const p = crearPipelineV2();
  p.iniciar();
  p.procesarFix(fix(0, 0, 0));
  // Racha de pasos reales pero muy lentos (caminando/frenando): el GPS
  // sigue emitiendo fixes cada <30s (nunca hueco real), pero la posicion
  // casi no cambia hasta el fix final de cada tramo -- degrada ritmoTipico
  // muy por debajo de cualquier velocidad razonable.
  for (let t = 25; t < 300; t += 25) {
    assert.equal(p.procesarFix(fix(1, 0, t)).tipo, "ruido");
  }
  const rLento1 = p.procesarFix(fix(31, 0, 300)); // 31m en 300s (~0.37 km/h) desde el origen
  assert.equal(rLento1.tipo, "confiable");
  for (let t = 325; t < 600; t += 25) {
    assert.equal(p.procesarFix(fix(32, 0, t)).tipo, "ruido");
  }
  // El segundo paso lento ya deberia estar protegido por el piso (si no lo
  // estuviera, un ritmo previo igual de degenerado tambien podria
  // dispararlo como "salto").
  const rLento2 = p.procesarFix(fix(62, 0, 600)); // 31m mas en 300s, mismo ritmo lento
  assert.equal(rLento2.tipo, "confiable", "el piso debe proteger tambien a un paso lento contra un ritmo previo igual de bajo");

  // Fixes intermedios de jitter para no disparar un hueco real mientras la
  // persona sigue caminando lento.
  assert.equal(p.procesarFix(fix(63, 1, 625)).tipo, "ruido");
  assert.equal(p.procesarFix(fix(61, -1, 650)).tipo, "ruido");

  // Reanuda a un ritmo bajo/normal (~2.7 km/h, igual que el 9->10 real de
  // la ruta 96) -- ritmoTipico esta en ~0.37 km/h, muy por debajo del piso
  // (~3.6 km/h con accuracy default). Sin el piso esto se veia como "5x"
  // el ritmo degenerado; con el piso, se compara contra el piso y no
  // resulta sospechoso.
  const rReanuda = p.procesarFix(fix(110.7, 0, 665.9)); // 48.7m en 65.9s (~2.66 km/h)
  assert.equal(rReanuda.tipo, "confiable", "reanudar a ritmo bajo/normal tras una racha lenta no debe verse como salto");

  // Con el ritmo tipico TODAVIA degradado (el piso lo cubre, no lo esconde),
  // un salto real de decenas de metros en 1.5s debe seguir detectandose.
  const rSalto = p.procesarFix(fix(159.7, 0, 667.4)); // 49m en 1.5s (~117.6 km/h)
  assert.equal(rSalto.tipo, "candidato-pendiente", "un salto real debe seguir siendo sospechoso aunque el ritmo tipico este degradado");
});

// --- Ajuste ruta 98: contradiceSpeed deja de ser OR independiente --------
verificar("ruta98-1 -- chip speed≈0 justo al arrancar de una parada NO es sospechoso solo por eso", () => {
  const p = crearPipelineV2();
  conRitmoEstablecido(p); // ritmo tipico ~14.4 km/h, ultimo confiable (80,0,t=20)
  // 35m en 21s (~6 km/h) -- factorSalto queda por debajo del umbral, pero
  // el chip todavia reporta velocidad casi nula (arrancando de una parada,
  // ver ruta 98 real: ~6.4 km/h de posicion contra speed≈0 del chip).
  const r = p.procesarFix(fix(115, 0, 41, { speed: 0 }));
  assert.equal(r.tipo, "confiable", "speed≈0 del chip no debe convertir por si solo un movimiento normal en sospechoso");
});

verificar("ruta98-2 -- speed del chip coherente con la posicion es normal", () => {
  const p = crearPipelineV2();
  conRitmoEstablecido(p);
  // 40m en 10s (~14.4 km/h), speed del chip = 4 m/s = 14.4 km/h: coincide.
  const r = p.procesarFix(fix(120, 0, 30, { speed: 4 }));
  assert.equal(r.tipo, "confiable");
});

verificar("ruta98-3 -- speed contradictorio pero factorSalto normal NO es sospechoso", () => {
  const p = crearPipelineV2();
  conRitmoEstablecido(p);
  // Misma distancia/tiempo que el ritmo tipico (factorSalto ~1), pero el
  // chip reporta 20 m/s (72 km/h) -- contradice fuertemente la posicion.
  // Antes esto bastaba por si solo para marcar candidato-pendiente.
  const r = p.procesarFix(fix(120, 0, 30, { speed: 20 }));
  assert.equal(r.tipo, "confiable", "un speed contradictorio no alcanza si la posicion no muestra ningun salto");
});

verificar("ruta98-4 -- salto real de ~50m en 1-2s sigue sospechoso por factorSalto", () => {
  const p = crearPipelineV2();
  conRitmoEstablecido(p);
  const r = p.procesarFix(fix(129, 0, 21.5)); // 49m en 1.5s (~117.6 km/h), sin speed del chip
  assert.equal(r.tipo, "candidato-pendiente", "factorSalto debe seguir siendo el disparador principal para un salto real");
});

verificar("ruta98-5 -- salto real + speed contradictorio sigue sospechoso", () => {
  const p = crearPipelineV2();
  conRitmoEstablecido(p);
  // Mismo salto real que arriba, y ademas el chip reporta 0 -- contradice
  // la posicion, pero no hace falta: factorSalto ya alcanza por si solo.
  const r = p.procesarFix(fix(129, 0, 21.5, { speed: 0 }));
  assert.equal(r.tipo, "candidato-pendiente", "un salto real sigue detectandose independientemente de si el speed tambien contradice");
});

// --- Instrumentacion adicional (auditoria ruta 100): ruido y
// maxIntervaloEntreFixesCrudosSeg en ResumenGpsV2 -- ver gpsV2/index.ts.
// A diferencia de las pruebas de arriba (crearPipelineV2() aislado), estas
// usan la API publica del modulo (iniciarPipelineV2/alimentarFixCrudoV2/
// obtenerResumenGpsV2/detenerPipelineV2), porque los contadores nuevos
// viven en el estado de index.ts, no en pipeline.ts.

verificar("index-ruido -- el contador ruido se incrementa exactamente con los fixes de movimiento insignificante", () => {
  iniciarPipelineV2("patinando", true);
  alimentarFixCrudoV2(fix(0, 0, 0)); // primer punto, confiable directo
  alimentarFixCrudoV2(fix(1, 0, 5)); // 1m desde el ultimo confiable -- ruido
  alimentarFixCrudoV2(fix(2, 0, 10)); // 2m desde el ultimo confiable -- ruido
  alimentarFixCrudoV2(fix(40, 0, 20)); // 40m reales -- confiable
  const resumen = obtenerResumenGpsV2();
  assert.equal(resumen.ruido, 2, "deberian contarse exactamente los 2 fixes de movimiento insignificante");
  assert.equal(resumen.puntosConfiables.length, 2, "los 2 fixes de ruido no deben haber entrado como confiables");
  detenerPipelineV2();
});

verificar("index-maxIntervalo -- maxIntervaloEntreFixesCrudosSeg refleja el mayor dt real entre fixes crudos", () => {
  iniciarPipelineV2("patinando", true);
  alimentarFixCrudoV2(fix(0, 0, 0));
  alimentarFixCrudoV2(fix(1, 0, 5)); // dt=5s
  alimentarFixCrudoV2(fix(2, 0, 24)); // dt=19s -- el mayor, pero <30s (no dispara RECUPERANDO)
  alimentarFixCrudoV2(fix(40, 0, 30)); // dt=6s
  const resumen = obtenerResumenGpsV2();
  assert.equal(resumen.maxIntervaloEntreFixesCrudosSeg, 19, "el mayor intervalo real fue 19s, entre el 2do y 3er fix crudo");
  assert.deepEqual(resumen.entradasRecuperacion, [], "19s no debe disparar RECUPERANDO -- criterio existente sin cambios");
  detenerPipelineV2();
});

verificar("index-recuperacion -- un intervalo >30s entre fixes crudos sigue activando exactamente la recuperacion existente", () => {
  iniciarPipelineV2("patinando", true);
  alimentarFixCrudoV2(fix(0, 0, 0));
  alimentarFixCrudoV2(fix(500, 0, 301)); // ~301s de hueco real entre fixes crudos
  const resumen = obtenerResumenGpsV2();
  assert.equal(resumen.entradasRecuperacion.length, 1, "debe registrar exactamente 1 entrada a RECUPERANDO, igual que antes de este cambio");
  assert.ok(
    resumen.maxIntervaloEntreFixesCrudosSeg >= 301,
    `el intervalo real (>=301s) debe quedar reflejado en el maximo, no enmascarado por RECUPERANDO -- fue ${resumen.maxIntervaloEntreFixesCrudosSeg}`,
  );
  detenerPipelineV2();
});

// --- Disponibilidad de la fuente de ubicación del sistema (ruta 102) ------
// informarDisponibilidadUbicacionV2 (index.ts) + marcarFuenteNoDisponible
// (pipeline.ts). El objetivo central de este bloque: jamás puede volverse a
// GRABANDO_NORMAL mientras la fuente sigue declarada no disponible, y la
// ventana de estabilización nunca cuenta el tiempo que estuvo apagada.

verificar("disponibilidad-1 -- fixes que convergerian NO pueden confirmar recuperacion mientras la fuente sigue en false", () => {
  iniciarPipelineV2("patinando", true);
  alimentarFixCrudoV2(fix(0, 0, 0));
  informarDisponibilidadUbicacionV2(false);
  assert.equal(obtenerGrabacionActivaV2()?.estado, "RECUPERANDO");
  // El peor caso: exactamente los datos que SI confirmarian la recuperacion
  // si no estuvieran bloqueados (convergen entre si, dentro de 50m).
  alimentarFixCrudoV2(fix(2, 1, 30));
  alimentarFixCrudoV2(fix(2, 1, 31));
  const resumen = obtenerResumenGpsV2();
  assert.equal(obtenerGrabacionActivaV2()?.estado, "RECUPERANDO", "ningun fix bloqueado puede confirmar nada");
  assert.equal(resumen.puntosConfiables.length, 1, "no debe haberse agregado ningun punto nuevo");
  assert.equal(resumen.fixesRecibidosFuenteNoDisponible, 2);
  detenerPipelineV2();
});

verificar("disponibilidad-2 -- true reabre el paso pero no acepta nada automaticamente", () => {
  iniciarPipelineV2("patinando", true);
  alimentarFixCrudoV2(fix(0, 0, 0));
  informarDisponibilidadUbicacionV2(false);
  alimentarFixCrudoV2(fix(2, 1, 10)); // bloqueado
  informarDisponibilidadUbicacionV2(true);
  assert.equal(obtenerGrabacionActivaV2()?.estado, "RECUPERANDO", "true no acepta nada por si solo, sigue esperando confirmacion");
  assert.equal(obtenerResumenGpsV2().puntosConfiables.length, 1);
  detenerPipelineV2();
});

verificar("disponibilidad-3 -- tras true, 2 fixes reales convergentes completan la recuperacion con la logica existente", () => {
  iniciarPipelineV2("patinando", true);
  alimentarFixCrudoV2(fix(0, 0, 0));
  informarDisponibilidadUbicacionV2(false);
  alimentarFixCrudoV2(fix(2, 1, 5)); // bloqueado, no cuenta como candidato
  informarDisponibilidadUbicacionV2(true);
  alimentarFixCrudoV2(fix(500, 0, 10)); // primer fix real permitido: semilla
  assert.equal(obtenerGrabacionActivaV2()?.estado, "RECUPERANDO");
  assert.equal(obtenerResumenGpsV2().puntosConfiables.length, 1, "la semilla todavia no es un punto confiable por si sola");
  alimentarFixCrudoV2(fix(503, 1, 10.1)); // converge con la semilla
  const resumen = obtenerResumenGpsV2();
  assert.equal(obtenerGrabacionActivaV2()?.estado, "GRABANDO");
  assert.equal(resumen.puntosConfiables.length, 2);
  assert.equal(resumen.discontinuidades.length, 1);
  assert.equal(resumen.discontinuidades[0].motivo, "hueco");
  detenerPipelineV2();
});

verificar("disponibilidad-4 -- maxIntervaloEntreFixesCrudosSeg sigue observando aunque los fixes esten bloqueados (ruta 102)", () => {
  iniciarPipelineV2("patinando", true);
  alimentarFixCrudoV2(fix(0, 0, 0));
  informarDisponibilidadUbicacionV2(false);
  for (let t = 1; t <= 60; t++) {
    alimentarFixCrudoV2(fix(0, 0, t)); // callbacks cada 1s, todos bloqueados
  }
  const resumen = obtenerResumenGpsV2();
  assert.equal(resumen.fixesRecibidosFuenteNoDisponible, 60);
  assert.equal(resumen.maxIntervaloEntreFixesCrudosSeg, 1, "debe seguir viendo el intervalo real de ~1s entre callbacks, aunque esten bloqueados");
  assert.equal(resumen.ruido, 0);
  assert.equal(resumen.rechazados.length, 0);
  assert.equal(resumen.candidatosPendientes, 0);
  assert.equal(resumen.candidatosRecuperacion, 0);
  detenerPipelineV2();
});

verificar("disponibilidad-5 -- caso critico ruta102: 60s de callbacks bloqueados no cuentan para la ventana de estabilizacion", () => {
  iniciarPipelineV2("patinando", true);
  alimentarFixCrudoV2(fix(0, 0, 0));
  informarDisponibilidadUbicacionV2(false);
  for (let t = 1; t <= 60; t++) {
    alimentarFixCrudoV2(fix(0, 0, t)); // bloqueados -- simulan el plugin viejo ticklando cada 1s
  }
  informarDisponibilidadUbicacionV2(true);
  // Primer fix real permitido tras `true`: se vuelve semilla. Si los 60s
  // bloqueados hubieran contado para la ventana, esto ya habria superado
  // VENTANA_ESTABILIZACION_SEG=15s y se habria resuelto por timeout -- no
  // debe pasar.
  alimentarFixCrudoV2(fix(500, 0, 61));
  let resumen = obtenerResumenGpsV2();
  assert.equal(obtenerGrabacionActivaV2()?.estado, "RECUPERANDO", "no debe resolverse por timeout: la ventana recien empieza con este fix");
  assert.equal(resumen.puntosConfiables.length, 1, "la semilla todavia no es un punto confiable por si sola");

  // Segundo fix, bien dentro de los 15s reales desde la semilla (no desde el
  // apagado), que SI converge -- recien aca debe completar la recuperacion.
  alimentarFixCrudoV2(fix(503, 1, 61.5));
  resumen = obtenerResumenGpsV2();
  assert.equal(obtenerGrabacionActivaV2()?.estado, "GRABANDO");
  assert.equal(resumen.puntosConfiables.length, 2);
  assert.equal(resumen.discontinuidades[resumen.discontinuidades.length - 1].motivo, "hueco");
  detenerPipelineV2();
});

verificar("disponibilidad-6 -- la duracion del apagado (5 minutos) no altera el criterio de estabilizacion", () => {
  iniciarPipelineV2("patinando", true);
  alimentarFixCrudoV2(fix(0, 0, 0));
  informarDisponibilidadUbicacionV2(false);
  // 5 minutos apagado, sin ningun callback intermedio esta vez -- prueba el
  // caso false...true solo, independiente de si el plugin viejo siguio
  // mandando algo mientras tanto (ver disponibilidad-5 para ese caso).
  informarDisponibilidadUbicacionV2(true);
  alimentarFixCrudoV2(fix(500, 0, 300)); // primer fix real, 300s (5min) despues del false
  assert.equal(obtenerGrabacionActivaV2()?.estado, "RECUPERANDO", "5 minutos de apagado no deben resolverse por timeout: la ventana ni habia empezado");
  alimentarFixCrudoV2(fix(503, 1, 300.5)); // converge, 0.5s despues de la semilla real
  const resumen = obtenerResumenGpsV2();
  assert.equal(obtenerGrabacionActivaV2()?.estado, "GRABANDO", "misma logica de siempre, sin importar cuanto duro el apagado");
  assert.equal(resumen.puntosConfiables.length, 2);
  detenerPipelineV2();
});

verificar("disponibilidad-7 -- decisivo: jamas vuelve a GRABANDO mientras la fuente sigue en false, ni con datos que si confirmarian", () => {
  iniciarPipelineV2("patinando", true);
  alimentarFixCrudoV2(fix(0, 0, 0));
  informarDisponibilidadUbicacionV2(false);
  for (let i = 1; i <= 100; i++) {
    // Todos convergen entre si -- el peor caso posible.
    alimentarFixCrudoV2(fix(2, 1, i));
    assert.equal(obtenerGrabacionActivaV2()?.estado, "RECUPERANDO", `fix bloqueado #${i} no debe poder sacar el pipeline de RECUPERANDO`);
    assert.equal(obtenerResumenGpsV2().puntosConfiables.length, 1, `fix bloqueado #${i} no debe poder agregar un punto confiable`);
  }
  assert.equal(obtenerResumenGpsV2().fixesRecibidosFuenteNoDisponible, 100);
  detenerPipelineV2();
});

verificar("disponibilidad-8 -- invariante de conteo cierra en cualquier instante, incluyendo candidatosRecuperacion y fixesRecibidosFuenteNoDisponible", () => {
  iniciarPipelineV2("patinando", true);
  alimentarFixCrudoV2(fix(0, 0, 0)); // confiable
  alimentarFixCrudoV2(fix(500, 0, 301)); // hueco real -> candidato-recuperacion
  informarDisponibilidadUbicacionV2(false); // reinicia la recuperacion sin semilla
  alimentarFixCrudoV2(fix(2, 1, 302)); // bloqueado
  alimentarFixCrudoV2(fix(2, 1, 303)); // bloqueado
  informarDisponibilidadUbicacionV2(true);
  alimentarFixCrudoV2(fix(500, 0, 304)); // primer fix real -> nueva semilla, candidato-recuperacion
  const resumen = obtenerResumenGpsV2();
  const sumaRechazados = resumen.rechazados.reduce((acc, r) => acc + r.cantidad, 0);
  const total =
    resumen.puntosConfiables.length +
    resumen.candidatosPendientes +
    resumen.candidatosRecuperacion +
    sumaRechazados +
    resumen.ruido +
    resumen.fixesRecibidosFuenteNoDisponible;
  assert.equal(total, resumen.fixesRecibidos, "el invariante de conteo debe cerrar exactamente, incluyendo candidatosRecuperacion");
  detenerPipelineV2();
});

console.log(`\nTODO OK (${ok} verificaciones)`);
