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

function registrarDiagnosticoGps(
  pos: PosicionSimple,
  base: { horaRecepcion: number; retrasoMs: number | null; dtRealSeg: number | null; etiquetas: string[] },
): void {
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

// Se lee al finalizar la ruta (ver MapaView.tsx finalizarModo) -- a
// propósito NO se limpia en detenerGrabacionGps (ver más abajo), para que
// siga disponible en ese momento; se reinicia recién al arrancar la
// PRÓXIMA grabación (iniciarGrabacionGps).
export function obtenerDiagnosticoGps(): FixDiagnosticoGps[] {
  return diagnosticoFixes;
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
export function iniciarGrabacionGps(modo: "patinando" | "ruta", mapeado: boolean, onError: () => void): void {
  if (detenerWatcherReal) {
    log("iniciarGrabacionGps: ya había un watcher activo -- se reutiliza, no se crea otro");
    return;
  }
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
  // DIAGNÓSTICO TEMPORAL -- reinicia el estado de logDiagnosticoFix para que
  // una grabación nueva no arrastre el "último fix" ni el contador
  // post-hueco de una sesión anterior ya finalizada.
  ultimoFixRecibidoDiag = null;
  fixesRestantesEtiquetarPostHueco = 0;
  // DIAGNÓSTICO TEMPORAL -- reinicia el acumulador de diagnóstico-gps de la
  // grabación anterior (ver registrarDiagnosticoGps/obtenerDiagnosticoGps).
  // A propósito NO se reinicia en detenerGrabacionGps -- ver su comentario.
  diagnosticoFixes = [];
  indiceDiagSiguiente = 0;
  registroPendienteDiag = null;
  detenerWatcherReal = iniciarSeguimientoUbicacion(alRecibirPosicion, onError);
  log("watcher iniciado");
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
  grabacionActiva = null;
  puntoPendienteConfirmar = null;
  callbackPosicionActual = null;
  // DIAGNÓSTICO TEMPORAL -- ver comentario en iniciarGrabacionGps.
  ultimoFixRecibidoDiag = null;
  fixesRestantesEtiquetarPostHueco = 0;
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
