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

console.log(`\nTODO OK (${ok} verificaciones)`);
