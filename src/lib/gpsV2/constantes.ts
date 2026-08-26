// GPS V2 -- FASE 1. Todos los umbrales candidatos en un solo lugar, cada uno
// con su justificación -- ninguno es un "número mágico" suelto. Se validan
// contra datos reales en Fase 2 (comparación V1 vs V2 sobre rutas reales)
// antes de que V2 controle nada.

// Mismo criterio que ya usaba V1 (KM_MOVIMIENTO_SIGNIFICATIVO +
// accuracy*1.5/1000): piso de "esto es ruido normal de GPS, no movimiento
// real". Sin cambios -- ya está validado en producción.
export const KM_MOVIMIENTO_SIGNIFICATIVO = 0.03;
export const FACTOR_ACCURACY_RUIDO = 1.5;

// Mismos gates de accuracy que V1 -- no se inventan números nuevos acá.
// accuracy sigue siendo filtro de ENTRADA, no garantía de posición correcta
// (ver validacion.ts/pipeline.ts: pasar este gate solo habilita que el fix
// compita por confiable, no lo acepta directo).
export const PRECISION_MAXIMA_PUNTO_GRABADO_M = 35;
export const PRECISION_INICIAL_MAXIMA_M = 20;

// Hueco de señal: sin ningún fix real durante este tiempo (medido con
// fix.time, nunca Date.now()). Validado como etiqueta de diagnóstico sobre
// la ruta 85 real (hueco de ~300.5s) sin falsos positivos -- un patinador
// con el watcher andando normal no pasa 30s sin ningún fix.
export const UMBRAL_HUECO_SEG = 30;

// Ventana máxima para resolver una recuperación tras un hueco. La ráfaga
// real de la ruta 85 (4 fixes) llegó completa en menos de 2s reales --
// 15s da margen de sobra sin dejar al usuario "congelado" mucho tiempo.
export const VENTANA_ESTABILIZACION_SEG = 15;

// Mínimo de candidatos consecutivos coherentes entre sí para confirmar una
// posición nueva tras un hueco -- 2 alcanza para hablar de "coherencia" sin
// exigir una racha larga que retrase la recuperación.
export const CONVERGENCIA_MIN_FIXES = 2;

// Radio de convergencia entre candidatos -- mismo orden de magnitud que el
// margen de accuracy ya usado en V1 (accuracy × 1.5). Dos fixes reales
// consecutivos (de alguien moviéndose o detenido) caen adentro; dos rebotes
// de señal al azar, no.
export const CONVERGENCIA_RADIO_KM = 0.05; // 50 m

// --- Candidato-pendiente dentro de GRABANDO (protección de la ruta 86) ---
// A propósito NO es un techo de velocidad fijo (nunca "más de 45km/h es
// salto") -- es un factor RELATIVO al ritmo propio de los últimos fixes de
// ESTA persona en ESTE momento. Un salto de ritmo x5 respecto al paso típico
// reciente es sospechoso tanto para alguien caminando como para alguien en
// una bajada rápida (que ya viene con un paso típico más grande, así que el
// factor no se dispara con la velocidad en sí). Candidato a ajustar en Fase 2
// con datos reales -- no es definitivo.
export const FACTOR_SALTO_SOSPECHOSO = 5;

// Cuántos intervalos confiables recientes se promedian (mediana) para saber
// el "paso típico" actual -- chico a propósito, para que se adapte rápido a
// cambios reales de ritmo (ver escenario de aceleración sostenida).
export const VENTANA_PASO_TIPICO_FIXES = 5;

// Contradicción con la velocidad del chip (cuando existe): diferencia
// relativa entre la velocidad implícita (distancia/dt) y `speed` del propio
// GPS antes de sumar sospecha. Señal BLANDA -- nunca rechaza ni confirma por
// sí sola, solo suma peso junto con factorSalto.
export const TOLERANCIA_CONTRADICCION_SPEED = 0.6; // 60%
