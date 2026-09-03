// GPS V2 (Opción A, ver auditoría) -- único dueño real del watcher de
// ubicación mientras hay una grabación de "Patinando"/"Estoy en Ruta" en
// curso. Antes, el watcher (iniciarSeguimientoUbicacion) vivía dentro de un
// useEffect de MapaView.tsx atado a su propio montaje/desmontaje -- como
// SwipeNavigator desmonta esa pantalla en cada cambio de pestaña (ver su
// comentario), el watcher se apagaba de verdad aunque la grabación siguiera
// activa, generando huecos reales en la captura (que luego se ven como línea
// recta o como corte en el trazado, según clasificarTramos en geo.ts -- eso
// no se toca acá).
//
// Este módulo vive a nivel de módulo (no de componente ni de contexto de
// React) a propósito, mismo criterio ya usado por grabacionActivaModulo en
// MapaView.tsx (de donde se movió este estado tal cual, sin cambiar ningún
// criterio de aceptación/rechazo de puntos): debe sobrevivir cualquier
// cantidad de montajes/desmontajes de MapaView durante la sesión. Solo dos
// cosas lo terminan: detenerGrabacionGps() (fin real de la ruta) o una
// recarga real de página (module state se reinicia solo, y ahí sigue
// existiendo el respaldo de /mapa/patinando-ahora en MapaView.tsx).
//
// MapaView.tsx pasa a ser CONSUMIDOR: llama iniciarGrabacionGps/
// detenerGrabacionGps en los mismos dos puntos de siempre (activarModo/
// finalizarModo), se suscribe a las posiciones con registrarCallbackPosicion
// en su propio efecto (conectar al montar, desconectar al desmontar -- eso
// nunca toca el watcher real), y lee obtenerGrabacionActiva()/
// hayGrabacionActiva() para todo lo que antes leía de grabacionActivaModulo.
import { iniciarSeguimientoUbicacion, type PosicionSimple } from "./geolocacionNativa";
import { distanciaHaversineKm, type PuntoGps } from "./geo";
// GPS V2 -- FASE 1 (modo sombra, ver diseño). Reutiliza el ÚNICO watcher real
// de este archivo -- V2 nunca crea uno propio (regla explícita: máximo un
// watcher GPS real activo). Se le pasa cada fix crudo tal cual llega acá,
// sin que V2 pueda influir en nada de lo de abajo.
import {
  alimentarFixCrudoV2,
  detenerPipelineV2,
  detenerSesionDiagnosticoNativoV2,
  iniciarPipelineV2,
  informarDisponibilidadUbicacionV2,
  iniciarSesionDiagnosticoNativoV2,
} from "./gpsV2";
// GPS V2 -- señal de disponibilidad de la fuente de ubicación del sistema
// (ver diseño acordado / disponibilidadUbicacion.ts). Mismo criterio de
// dueño único que el watcher real: se suscribe/desuscribe acá, en los mismos
// dos puntos donde arranca/para el watcher, nunca en otro lugar.
import { suscribirDisponibilidadUbicacion } from "./disponibilidadUbicacion";
// Fase 1 de la corrección de producción (auditoría ruta 107/108) -- ver
// recursosGrabacion.ts. Mismo criterio de dueño único: se adquiere/libera
// acá, en los mismos dos puntos donde arranca/para el watcher real.
import { adquirirWakeLockNativo, liberarWakeLockNativo } from "./recursosGrabacion";

// LOGS TEMPORALES (a sacar una vez confirmado en dispositivo real que el
// watcher sobrevive cambios de pestaña) -- ver también los logs espejo en
// MapaView.tsx ("MapaView desmontado/remontado").
function log(linea: string): void {
  console.log(`[grabacionGps] ${linea}`);
}

// Mismos valores/criterio que tenía MapaView.tsx (PRECISION_MAXIMA_PUNTO_GRABADO_M,
// PRECISION_INICIAL_MAXIMA_M, KMH_SALTO_SOSPECHOSO) -- movidos tal cual, sin
// cambiar ningún umbral. KM_MOVIMIENTO_SIGNIFICATIVO queda además duplicado
// en MapaView.tsx (mismo valor) porque ahí lo sigue usando registrarMovimiento
// para el modo Exploración de la cámara -- eso no es parte de la captura y no
// se movió acá.
const KM_MOVIMIENTO_SIGNIFICATIVO = 0.03;
const PRECISION_MAXIMA_PUNTO_GRABADO_M = 35;
const PRECISION_INICIAL_MAXIMA_M = 20;
const KMH_SALTO_SOSPECHOSO = 115;

export interface EstadoGrabacionGps {
  modo: "patinando" | "ruta";
  puntos: PuntoGps[];
  inicioGrabacion: number;
  mapeado: boolean;
  rodadaUnidaId: number | null;
  ultimoMovimientoEn: number;
  avisoInactividadDesde: number | null;
}

let grabacionActiva: EstadoGrabacionGps | null = null;
let detenerWatcherReal: (() => void) | null = null;
let detenerSuscripcionDisponibilidad: (() => void) | null = null;
// Corrección del race confirmado por la ruta 105 (watchersActivos=2,
// maxWatchersSimultaneos=2, dos watchers reales creados con 28ms de
// diferencia). `detenerWatcherReal` solo se asigna DESPUÉS del primer
// `await` de iniciarGrabacionGps -- eso dejaba una ventana real donde una
// segunda invocación concurrente (ej. el useEffect de MapaView disparado
// por el re-render de la primera) pasaba el mismo chequeo `if
// (detenerWatcherReal)` antes de que la primera terminara. Este flag se
// marca de forma SÍNCRONA, antes de cualquier await, cerrando esa ventana
// por completo -- ver iniciarGrabacionGps.
let arranqueEnCurso = false;
// Ver KMH_SALTO_SOSPECHOSO: un punto que salta lejos del último confirmado
// se retiene acá hasta que la lectura siguiente confirme o desmienta el
// salto (ver registrarPuntoGrabado) -- mismo mecanismo, movido tal cual.
let puntoPendienteConfirmar: PuntoGps | null = null;
// Un solo "slot" de suscripción (no una lista): a lo sumo una pantalla
// (MapaView) puede estar montada mirando esto a la vez -- no hace falta un
// pub/sub completo para este caso.
let callbackPosicionActual: ((pos: PosicionSimple) => void) | null = null;

// --- DIAGNÓSTICO TEMPORAL (fase previa a implementar la capa de
// recuperación GPS) -- SOLO observa y logea; nunca decide qué punto se
// acepta/rechaza (eso sigue siendo exclusivamente alRecibirPosicion/
// registrarPuntoGrabado, sin ningún cambio de comportamiento). Los dos
// umbrales de acá (30s/1s) son los valores CANDIDATOS para la futura capa
// de recuperación -- se usan acá ÚNICAMENTE para etiquetar el log y poder
// leerlo más fácil, nunca para descartar ni modificar ningún punto. Sacar
// todo este bloque (constantes + estado + logDiagnosticoFix + su llamado
// en alRecibirPosicion) una vez cerrada la investigación.
const UMBRAL_HUECO_DIAGNOSTICO_SEG = 30;
const UMBRAL_RAFAGA_SEG = 1;
const FIXES_A_ETIQUETAR_POST_HUECO = 10;

let ultimoFixRecibidoDiag: PosicionSimple | null = null;
let fixesRestantesEtiquetarPostHueco = 0;

// DIAGNÓSTICO TEMPORAL (auditoría ruta 104 -- investigación de la hipótesis
// "doble watcher" tras el hallazgo de ráfagas onLocationAvailability
// false/true, confirmada por la ruta 105). Puramente observacional: estos
// contadores no deciden nada por sí mismos -- la corrección real es
// `arranqueEnCurso` (arriba). Cuentan, desde afuera, cuántas veces se cruza
// el guard de iniciarGrabacionGps; con el fix, pasaronGuard/
// llegaronAWatcher deberían quedar en 1 por grabación, nunca más. Se
// resetean en detenerGrabacionGps() (fin real de una grabación), nunca
// dentro de iniciarGrabacionGps() -- resetearlos ahí sería exactamente el
// punto que se quiere poder auditar sin distorsionar. Sacar junto con el
// resto del bloque de diagnóstico temporal de arriba.
let diagIniciarGrabacionEntradas = 0;
let diagIniciarGrabacionPasaronGuard = 0;
let diagIniciarGrabacionLlegaronAWatcher = 0;

function logDiagnosticoFix(pos: PosicionSimple): {
  horaRecepcion: number;
  retrasoMs: number | null;
  dtRealSeg: number | null;
  etiquetas: string[];
} {
  const horaRecepcion = Date.now();
  const retrasoMs = pos.time !== null ? horaRecepcion - pos.time : null;
  const anterior = ultimoFixRecibidoDiag;
  const dtRealSeg =
    anterior && anterior.time !== null && pos.time !== null ? (pos.time - anterior.time) / 1000 : null;

  const etiquetas: string[] = [];
  if (dtRealSeg !== null && dtRealSeg > UMBRAL_HUECO_DIAGNOSTICO_SEG) {
    etiquetas.push(`HUECO_DETECTADO(candidato>${UMBRAL_HUECO_DIAGNOSTICO_SEG}s)`);
    fixesRestantesEtiquetarPostHueco = FIXES_A_ETIQUETAR_POST_HUECO;
  } else if (fixesRestantesEtiquetarPostHueco > 0) {
    etiquetas.push(
      `POST_HUECO(#${FIXES_A_ETIQUETAR_POST_HUECO - fixesRestantesEtiquetarPostHueco + 1}/${FIXES_A_ETIQUETAR_POST_HUECO})`,
    );
    fixesRestantesEtiquetarPostHueco--;
  }
  if (dtRealSeg !== null && dtRealSeg >= 0 && dtRealSeg < UMBRAL_RAFAGA_SEG) {
    etiquetas.push(`RAFAGA(candidato<${UMBRAL_RAFAGA_SEG}s entre fixes)`);
  }

  log(
    `DIAG-FIX horaRecepcion=${horaRecepcion} fix.time=${pos.time ?? "null"} retrasoMs=${retrasoMs ?? "null"} ` +
      `lat=${pos.lat.toFixed(6)} lon=${pos.lon.toFixed(6)} accuracy=${pos.accuracy.toFixed(1)} ` +
      `speed=${pos.speed ?? "null"} simulated=${pos.simulated ?? "null"} ` +
      `dtReal=${dtRealSeg !== null ? `${dtRealSeg.toFixed(3)}s` : "null(sin fix.time o primer fix de la sesión)"}` +
      (etiquetas.length ? ` [${etiquetas.join(" ")}]` : ""),
  );

  ultimoFixRecibidoDiag = pos;
  return { horaRecepcion, retrasoMs, dtRealSeg, etiquetas };
}

// DIAGNÓSTICO TEMPORAL -- persistencia (fase siguiente a los logs DIAG-FIX,
// para poder revisar una prueba real sin depender de la consola). Igual que
// logDiagnosticoFix, esto es un espejo de SOLO LECTURA: nunca escribe en
// grabacionActiva.puntos ni en puntoPendienteConfirmar, solo los lee para
// reproducir la MISMA decisión que ya toma alRecibirPosicion/
// registrarPuntoGrabado más abajo, y así poder etiquetar cada fix. Es
// diagnóstico DERIVADO, no la fuente oficial de qué quedó grabado -- si
// algún día este espejo y el comportamiento real llegaran a discrepar, el
// real manda siempre. Reutiliza las mismas constantes de umbral que la
// lógica real (nunca las duplica con otro valor), así que no hay riesgo de
// que se desalineen si esos umbrales cambian más adelante. Cuando el motivo
// no se puede determinar con certeza (no debería ocurrir en uso normal --
// ej. si por algún motivo llega un fix sin haber grabación activa), usa
// "indeterminado" en vez de adivinar. BORRAR este bloque completo
// (interfaz + estado + función + su llamado, y obtenerDiagnosticoGps) una
// vez cerrada la investigación GPS.
export interface FixDiagnosticoGps {
  indice: number;
  lat: number;
  lon: number;
  accuracy: number;
  fixTime: number | null;
  horaRecepcion: number;
  retrasoMs: number | null;
  speed: number | null;
  simulated: boolean | null;
  dtRealSeg: number | null;
  etiquetas: string[];
  entroAPuntos: boolean;
  motivoRechazo: string | null;
}

let diagnosticoFixes: FixDiagnosticoGps[] = [];
let indiceDiagSiguiente = 0;
// Referencia al registro de diagnóstico del fix que quedó "pendiente" (ver
// puntoPendienteConfirmar) -- para poder actualizar su resultado final
// (confirmado / descartado por rebote) recién cuando el fix SIGUIENTE lo
// resuelve, exactamente como decide la lógica real.
let registroPendienteDiag: FixDiagnosticoGps | null = null;

// DIAGNÓSTICO TEMPORAL -- señales escalares de "diagnosticoFlujo", ver
// obtenerDiagnosticoFlujo más abajo. A propósito NUNCA se derivan leyendo
// diagnosticoFixes.length después del hecho -- cada una se actualiza en su
// propio punto del código, para que sigan siendo un registro válido aunque
// el array se vacíe por algún motivo aún no identificado. BORRAR junto con
// el resto de la instrumentación de diagnosticoGps.
let vecesRegistrarDiagnosticoGps = 0;
let maxDiagnosticoFixesObservado = 0;
let diagnosticoFixesAlObtenerSnapshot = 0;
// Bump manual (v2, v3...) cada vez que se redespliegue esta instrumentación,
// para poder confirmar si el celular está ejecutando el build esperado.
// Exportado para que (app)/layout.tsx pueda mostrarlo en pantalla -- un
// único valor fuente, nunca duplicado a mano en dos archivos.
export const BUILD_TAG_DIAGNOSTICO = "diagflujo-v2";

function registrarDiagnosticoGps(
  pos: PosicionSimple,
  base: { horaRecepcion: number; retrasoMs: number | null; dtRealSeg: number | null; etiquetas: string[] },
): void {
  // DIAGNÓSTICO TEMPORAL -- primera línea, sin condición: si esta función se
  // invoca aunque sea una vez, este contador lo refleja.
  vecesRegistrarDiagnosticoGps++;

  const registro: FixDiagnosticoGps = {
    indice: indiceDiagSiguiente++,
    lat: pos.lat,
    lon: pos.lon,
    accuracy: pos.accuracy,
    fixTime: pos.time,
    horaRecepcion: base.horaRecepcion,
    retrasoMs: base.retrasoMs,
    speed: pos.speed,
    simulated: pos.simulated,
    dtRealSeg: base.dtRealSeg,
    etiquetas: base.etiquetas,
    entroAPuntos: false,
    motivoRechazo: "indeterminado",
  };
  diagnosticoFixes.push(registro);
  // DIAGNÓSTICO TEMPORAL -- confirma si registrarDiagnosticoGps() realmente
  // se ejecuta y acumula durante la grabación real. BORRAR junto con el
  // resto de la instrumentación de diagnosticoGps.
  log(`FRONT diag acumulado=${diagnosticoFixes.length}`);
  // DIAGNÓSTICO TEMPORAL -- pico histórico del largo del array, tomado acá
  // (no releído después) para que sobreviva aunque el array se vacíe.
  maxDiagnosticoFixesObservado = Math.max(maxDiagnosticoFixesObservado, diagnosticoFixes.length);

  if (!grabacionActiva) {
    return; // no debería ocurrir en uso normal -- queda como "indeterminado"
  }

  if (pos.accuracy > PRECISION_MAXIMA_PUNTO_GRABADO_M) {
    registro.motivoRechazo = "accuracy>35m";
    return;
  }

  const puntoGrabado: PuntoGps = { lat: pos.lat, lon: pos.lon, timestamp: Date.now() };
  const ultimoGrabado = grabacionActiva.puntos[grabacionActiva.puntos.length - 1];

  if (!ultimoGrabado) {
    if (pos.accuracy <= PRECISION_INICIAL_MAXIMA_M) {
      registro.entroAPuntos = true;
      registro.motivoRechazo = null;
    } else {
      registro.motivoRechazo = "primer-punto-precision-insuficiente(>20m)";
    }
    return;
  }

  const umbralKm = Math.max(KM_MOVIMIENTO_SIGNIFICATIVO, (pos.accuracy * 1.5) / 1000);
  const esRuido = distanciaHaversineKm(ultimoGrabado, puntoGrabado) < umbralKm;
  if (esRuido) {
    registro.motivoRechazo = "ruido(distancia<umbral)";
    return;
  }

  const pendienteAntes = puntoPendienteConfirmar;
  if (pendienteAntes) {
    // Mismo criterio que registrarPuntoGrabado: si este fix sigue lejos del
    // último confirmado, se confirman AMBOS (el pendiente y este); si no,
    // el pendiente se descarta por rebote y este fix termina confirmado de
    // todas formas (re-evaluado contra el mismo último confirmado, que no
    // cambió).
    const siguioLejos = kmhEntre(ultimoGrabado, puntoGrabado) > KMH_SALTO_SOSPECHOSO;
    if (registroPendienteDiag) {
      registroPendienteDiag.entroAPuntos = siguioLejos;
      registroPendienteDiag.motivoRechazo = siguioLejos ? null : "pendiente-descartado-rebote";
    }
    registroPendienteDiag = null;
    registro.entroAPuntos = true;
    registro.motivoRechazo = null;
    return;
  }

  const saltaLejos = kmhEntre(ultimoGrabado, puntoGrabado) > KMH_SALTO_SOSPECHOSO;
  if (saltaLejos) {
    registro.motivoRechazo = "pendiente-esperando-confirmacion";
    registroPendienteDiag = registro;
  } else {
    registro.entroAPuntos = true;
    registro.motivoRechazo = null;
  }
}

// Se lee al finalizar la ruta (ver MapaView.tsx finalizarModo). Devuelve una
// COPIA, nunca la referencia interna -- así, el snapshot que finalizarModo()
// captura para mandar en el POST queda protegido de cualquier fix tardío que
// llegue a registrarDiagnosticoGps() durante el propio cierre de la ruta
// (ver limpiarDiagnosticoGps más abajo).
export function obtenerDiagnosticoGps(): FixDiagnosticoGps[] {
  const copia = [...diagnosticoFixes];
  // DIAGNÓSTICO TEMPORAL -- congela el largo de ESTA copia en el instante
  // exacto en que se crea, para poder comparar contra maxDiagnosticoFixes
  // (¿el array ya venía vacío al llegar acá, o se vació después?).
  diagnosticoFixesAlObtenerSnapshot = copia.length;
  return copia;
}

// DIAGNÓSTICO TEMPORAL -- snapshot de las señales escalares de flujo (ver
// arriba), para viajar en el POST junto a diagnosticoGps dentro de
// diagnosticoFlujo (ver MapaView.tsx finalizarModo). BORRAR junto con el
// resto de la instrumentación de diagnosticoGps.
export function obtenerDiagnosticoFlujo(): {
  vecesRegistrarDiagnosticoGps: number;
  maxDiagnosticoFixes: number;
  diagnosticoFixesAlObtenerSnapshot: number;
  buildFrontend: string;
} {
  return {
    vecesRegistrarDiagnosticoGps,
    maxDiagnosticoFixes: maxDiagnosticoFixesObservado,
    diagnosticoFixesAlObtenerSnapshot,
    buildFrontend: BUILD_TAG_DIAGNOSTICO,
  };
}

// DIAGNÓSTICO TEMPORAL -- limpia el acumulador de diagnóstico-gps. La llama
// tanto iniciarGrabacionGps (red de seguridad para que una grabación nueva
// nunca arrastre datos de la anterior) como MapaView.tsx explícitamente,
// DESPUÉS de haber capturado y enviado el snapshot de la ruta que acaba de
// terminar (ver finalizarModo) -- a propósito no se limpia dentro de
// detenerGrabacionGps(), para no atar el momento del reset a cuándo se
// detiene el watcher: el snapshot ya capturado (copia, ver arriba) no se ve
// afectado de todas formas, pero así el orden queda explícito y no depende
// de que arranque una grabación siguiente.
export function limpiarDiagnosticoGps(): void {
  diagnosticoFixes = [];
  indiceDiagSiguiente = 0;
  registroPendienteDiag = null;
  // DIAGNÓSTICO TEMPORAL -- mismo criterio: recién se reinician acá, nunca
  // antes de que finalizarModo() ya haya capturado/enviado el snapshot.
  vecesRegistrarDiagnosticoGps = 0;
  maxDiagnosticoFixesObservado = 0;
  diagnosticoFixesAlObtenerSnapshot = 0;
}

function kmhEntre(a: PuntoGps, b: PuntoGps): number {
  const dtSeg = (b.timestamp - a.timestamp) / 1000;
  if (dtSeg <= 0) return 0;
  return (distanciaHaversineKm(a, b) / dtSeg) * 3600;
}

// Ver KMH_SALTO_SOSPECHOSO arriba. Reemplaza al enfoque de un umbral de
// velocidad fijo que rechaza de una: acá el punto sospechoso se retiene
// hasta la lectura siguiente, que confirma o desmiente el salto
// comparándose ella misma contra el último punto YA confirmado (no contra
// el pendiente). Movida tal cual desde MapaView.tsx, sin cambiar el
// criterio.
function registrarPuntoGrabado(puntoNuevo: PuntoGps): void {
  if (!grabacionActiva) return;

  function confirmarPunto(p: PuntoGps): void {
    if (!grabacionActiva) return;
    grabacionActiva.puntos = [...grabacionActiva.puntos, p];
  }

  const pendiente = puntoPendienteConfirmar;
  if (pendiente) {
    puntoPendienteConfirmar = null;
    const ultimoConfirmado = grabacionActiva.puntos[grabacionActiva.puntos.length - 1];
    const siguioLejos = ultimoConfirmado ? kmhEntre(ultimoConfirmado, puntoNuevo) > KMH_SALTO_SOSPECHOSO : true;
    if (siguioLejos) {
      confirmarPunto(pendiente);
      confirmarPunto(puntoNuevo);
    } else {
      registrarPuntoGrabado(puntoNuevo);
    }
    return;
  }

  const ultimoConfirmado = grabacionActiva.puntos[grabacionActiva.puntos.length - 1];
  if (ultimoConfirmado && kmhEntre(ultimoConfirmado, puntoNuevo) > KMH_SALTO_SOSPECHOSO) {
    puntoPendienteConfirmar = puntoNuevo;
    return;
  }

  confirmarPunto(puntoNuevo);
}

// Handler real del watcher -- SIEMPRE corre mientras haya un watcher activo,
// sin importar si alguna pantalla está escuchando (callbackPosicionActual
// puede ser null mientras MapaView está desmontado): la aceptación de
// puntos nunca depende de que haya UI montada. Al final reenvía la posición
// cruda a quien esté suscripto, para cámara/broadcast/rodada -- igual que
// antes.
function alRecibirPosicion(pos: PosicionSimple): void {
  const diagBase = logDiagnosticoFix(pos);
  registrarDiagnosticoGps(pos, diagBase);
  // GPS V2 -- FASE 1: mismo fix crudo, en modo sombra. No lee ni escribe
  // nada de lo que sigue -- puramente observacional todavía.
  alimentarFixCrudoV2(pos);

  if (grabacionActiva && pos.accuracy <= PRECISION_MAXIMA_PUNTO_GRABADO_M) {
    const puntoGrabado: PuntoGps = { lat: pos.lat, lon: pos.lon, timestamp: Date.now() };
    const ultimoGrabado = grabacionActiva.puntos[grabacionActiva.puntos.length - 1];
    if (!ultimoGrabado) {
      if (pos.accuracy <= PRECISION_INICIAL_MAXIMA_M) {
        registrarPuntoGrabado(puntoGrabado);
      }
    } else {
      const umbralKm = Math.max(KM_MOVIMIENTO_SIGNIFICATIVO, (pos.accuracy * 1.5) / 1000);
      const esRuido = distanciaHaversineKm(ultimoGrabado, puntoGrabado) < umbralKm;
      if (!esRuido) {
        registrarPuntoGrabado(puntoGrabado);
      }
    }
  }
  callbackPosicionActual?.(pos);
}

// Idempotente a propósito: si ya hay un watcher corriendo (porque MapaView
// se remontó sin que la grabación haya terminado), no crea uno nuevo -- nunca
// debe haber más de un watcher real activo a la vez. `mapeado` solo se usa
// para la grabación NUEVA; si ya hay una en curso, se ignora (la existente
// manda).
// ASYNC desde la instrumentación diagnóstica de auditoría ruta 103 (ver
// gpsV2/diagnosticoNativo.ts): hay un `await` antes de crear el watcher
// real. La ruta 105 demostró que el guard de arriba (basado únicamente en
// `detenerWatcherReal`, que solo se asigna DESPUÉS de ese await) no basta
// por sí solo: dos invocaciones concurrentes de esta función (ej. una desde
// activarModo y otra desde el useEffect de MapaView, que en condiciones
// normales el guard distingue bien) pueden pasarlo las dos, porque ninguna
// llegó todavía a asignar `detenerWatcherReal` cuando la otra hace su
// propio chequeo. `arranqueEnCurso` (declarado arriba) cierra esa ventana:
// se marca de forma SÍNCRONA, en la misma línea de ejecución que el
// chequeo, antes de cualquier await -- una segunda invocación concurrente
// ve el flag en `true` y retorna de inmediato, sin llegar ni al reset
// diagnóstico ni a iniciarSeguimientoUbicacion(). Se revisaron los dos
// callers existentes (MapaView.tsx, ninguno hace await ni depende del
// retorno) -- ninguno cambia de comportamiento: todo el estado síncrono de
// V1 (grabacionActiva y el resto de abajo) se sigue asignando ANTES del
// primer await, exactamente en el mismo orden que ya existía.
export async function iniciarGrabacionGps(modo: "patinando" | "ruta", mapeado: boolean, onError: () => void): Promise<void> {
  // DIAGNÓSTICO TEMPORAL (auditoría ruta 104) -- cuenta TODA entrada a la
  // función, incluidas las que el guard de abajo bloquea. Ver comentario en
  // la declaración de estas variables.
  diagIniciarGrabacionEntradas++;
  // Guard SÍNCRONO -- se chequea Y se marca (arranqueEnCurso = true) en el
  // mismo tramo de ejecución síncrona, sin ningún await entre medio, para
  // que no exista ninguna ventana en la que una segunda invocación
  // concurrente pueda leer el flag todavía en `false`. Ver comentario
  // arriba de la función y en la declaración de arranqueEnCurso.
  if (detenerWatcherReal || arranqueEnCurso) {
    log("iniciarGrabacionGps: ya había un watcher activo o un arranque en curso -- se reutiliza, no se crea otro");
    return;
  }
  arranqueEnCurso = true;
  // DIAGNÓSTICO TEMPORAL -- solo las invocaciones que pasan el guard de
  // arriba llegan acá. Con el fix, esto debería quedar en exactamente 1 por
  // grabación -- si alguna vez vuelve a valer >1, el guard síncrono en sí
  // tendría un problema (no la ventana ya cerrada).
  diagIniciarGrabacionPasaronGuard++;
  try {
    grabacionActiva = {
      modo,
      puntos: [],
      inicioGrabacion: Date.now(),
      mapeado,
      rodadaUnidaId: null,
      ultimoMovimientoEn: Date.now(),
      avisoInactividadDesde: null,
    };
    puntoPendienteConfirmar = null;
    // DIAGNÓSTICO TEMPORAL -- reinicia el estado de logDiagnosticoFix para
    // que una grabación nueva no arrastre el "último fix" ni el contador
    // post-hueco de una sesión anterior ya finalizada.
    ultimoFixRecibidoDiag = null;
    fixesRestantesEtiquetarPostHueco = 0;
    // DIAGNÓSTICO TEMPORAL -- red de seguridad: si por lo que sea MapaView
    // no llegó a llamar limpiarDiagnosticoGps() al terminar la ruta
    // anterior, esto evita que una grabación nueva arrastre datos de la
    // anterior.
    limpiarDiagnosticoGps();
    // Instrumentación diagnóstica (auditoría ruta 103) -- reset nativo
    // AWAITED, antes de inicializar V2 y de crear el watcher real. Ver
    // gpsV2/diagnosticoNativo.ts / iniciarSesionDiagnosticoNativoV2().
    await iniciarSesionDiagnosticoNativoV2();
    // GPS V2 -- FASE 1: arranca el pipeline en modo sombra junto con el
    // único watcher real -- nunca antes ni después por separado, para que
    // V1 y V2 arranquen exactamente en el mismo instante de la grabación.
    iniciarPipelineV2(modo, mapeado);
    // Se suscribe ANTES de arrancar el watcher real -- si Ubicación ya
    // estaba apagada al momento de iniciar, GPS V2 se entera desde el
    // primer instante (ver estaDisponible() en disponibilidadUbicacion.ts),
    // no recién en el próximo cambio.
    detenerSuscripcionDisponibilidad = suscribirDisponibilidadUbicacion((disponible) => {
      informarDisponibilidadUbicacionV2(disponible);
    });
    // Fase 1 de la corrección de producción (auditoría ruta 107/108) --
    // AWAITED, justo antes de crear el watcher real, para que el WakeLock
    // ya esté sostenido desde el primer fix. Nunca puede impedir que el
    // watcher real se cree (ver try/catch interno en recursosGrabacion.ts).
    await adquirirWakeLockNativo();
    // DIAGNÓSTICO TEMPORAL -- justo antes de crear el watcher real. Si esto
    // llega a valer >1 en una misma grabación, hubo más de un
    // iniciarSeguimientoUbicacion()/addWatcher() real -- evidencia directa e
    // inequívoca del lado JS de la hipótesis "doble watcher" (a cruzar
    // contra watchersActivos/maxWatchersSimultaneos del lado nativo).
    diagIniciarGrabacionLlegaronAWatcher++;
    detenerWatcherReal = iniciarSeguimientoUbicacion(alRecibirPosicion, onError);
    log("watcher iniciado");
    // A partir de acá, la protección contra una nueva invocación
    // concurrente/posterior queda a cargo del guard normal de arriba
    // (`detenerWatcherReal` ya no es null) -- `arranqueEnCurso` deliberadamente
    // NO se baja a `false` en el camino de éxito: seguirá en `true` hasta
    // detenerGrabacionGps(), que es quien la deja preparada para la próxima
    // grabación (ver ahí). No hace falta que valga `false` para que el
    // guard de arriba siga bloqueando correctamente mientras tanto.
  } catch (err) {
    // Si el arranque falla en cualquier punto ANTES de crear el watcher
    // real (reset nativo o iniciarSeguimientoUbicacion), se libera el flag
    // acá mismo -- sin esto, un fallo transitorio dejaría arranqueEnCurso
    // en `true` para siempre, sin ningún watcher activo que lo justifique,
    // bloqueando cualquier intento futuro de grabar. En la práctica ni
    // iniciarSesionDiagnosticoNativoV2() (traga sus propios errores, ver
    // diagnosticoNativo.ts) ni iniciarSeguimientoUbicacion() (síncrona,
    // reporta fallas por su propio onError interno) deberían llegar a tirar
    // acá -- este catch es la red de seguridad explícita para ese caso.
    arranqueEnCurso = false;
    log(`iniciarGrabacionGps: fallo antes de crear el watcher real -- ${err instanceof Error ? err.message : String(err)}`);
    onError();
  }
}

// DIAGNÓSTICO TEMPORAL (auditoría ruta 104) -- snapshot de solo lectura de
// los 3 contadores de arriba, para que MapaView.tsx lo pase a
// obtenerResumenGpsV2ConDiagnosticoNativo() y viaje junto con el resto del
// diagnóstico nativo de esta misma grabación. No expone las variables
// mutables directamente.
export function obtenerDiagnosticoIniciarGrabacion(): {
  entradas: number;
  pasaronGuard: number;
  llegaronAWatcher: number;
} {
  return {
    entradas: diagIniciarGrabacionEntradas,
    pasaronGuard: diagIniciarGrabacionPasaronGuard,
    llegaronAWatcher: diagIniciarGrabacionLlegaronAWatcher,
  };
}

// Único lugar donde el watcher real se apaga -- debe llamarse solo al
// terminar de verdad la ruta (finalizarModo), nunca desde un desmontaje de
// pantalla. Devuelve los puntos acumulados para que el llamador los guarde.
export function detenerGrabacionGps(): PuntoGps[] {
  const puntos = grabacionActiva?.puntos ?? [];
  if (detenerWatcherReal) {
    detenerWatcherReal();
    detenerWatcherReal = null;
    log("watcher detenido — fin de grabación");
  }
  // Fase 1 de la corrección de producción (auditoría ruta 107/108) --
  // fire-and-forget: detenerGrabacionGps es síncrona, nunca debe bloquear
  // ni poder fallar el cierre real de la grabación (ver try/catch interno
  // en recursosGrabacion.ts). Se libera siempre, sin condicionar a que
  // detenerWatcherReal fuera truthy -- adquirir()/liberar() son idempotentes.
  void liberarWakeLockNativo();
  // Deja el guard síncrono listo para una futura grabación -- ver
  // arranqueEnCurso y el comentario en iniciarGrabacionGps.
  arranqueEnCurso = false;
  if (detenerSuscripcionDisponibilidad) {
    detenerSuscripcionDisponibilidad();
    detenerSuscripcionDisponibilidad = null;
  }
  // GPS V2 -- FASE 1: se detiene junto con el watcher real. Su resultado
  // todavía no se usa para nada (no controla el recorrido oficial).
  detenerPipelineV2();
  // Heartbeat (auditoría ruta 107) -- fire-and-forget: detenerGrabacionGps
  // es síncrona y esto es puramente diagnóstico, nunca debe bloquear ni
  // poder fallar el cierre real de la grabación (ver try/catch interno en
  // diagnosticoNativo.ts).
  void detenerSesionDiagnosticoNativoV2();
  grabacionActiva = null;
  puntoPendienteConfirmar = null;
  callbackPosicionActual = null;
  // DIAGNÓSTICO TEMPORAL -- ver comentario en iniciarGrabacionGps.
  ultimoFixRecibidoDiag = null;
  fixesRestantesEtiquetarPostHueco = 0;
  // DIAGNÓSTICO TEMPORAL (auditoría ruta 104) -- se resetean acá, al
  // terminar de verdad la grabación (mismo criterio que el resto de este
  // bloque), NUNCA dentro de iniciarGrabacionGps -- ver comentario en la
  // declaración de estas variables.
  diagIniciarGrabacionEntradas = 0;
  diagIniciarGrabacionPasaronGuard = 0;
  diagIniciarGrabacionLlegaronAWatcher = 0;
  return puntos;
}

export function hayGrabacionActiva(): boolean {
  return detenerWatcherReal !== null;
}

// Devuelve la MISMA referencia mutable interna (no una copia) -- mismo
// criterio que ya tenía grabacionActivaModulo en MapaView.tsx, para que los
// call sites que hoy hacen `grabacionActivaModulo.campo = valor` sigan
// funcionando igual, solo leyendo el objeto desde acá.
export function obtenerGrabacionActiva(): EstadoGrabacionGps | null {
  return grabacionActiva;
}

// MapaView llama esto en cada montaje (mientras el modo siga activo) para
// volver a recibir posiciones -- el watcher real puede llevar rato
// corriendo desde una pantalla anterior; esto solo conecta/desconecta quién
// escucha, nunca crea ni destruye el watcher en sí.
export function registrarCallbackPosicion(cb: ((pos: PosicionSimple) => void) | null): void {
  callbackPosicionActual = cb;
}
