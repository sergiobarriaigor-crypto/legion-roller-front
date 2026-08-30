// GPS V2 -- FASE 1 (paralelo, sin control real todavía, ver README de diseño
// en la conversación con el equipo). Tipos compartidos por todo el módulo.

export interface FixCrudoV2 {
  lat: number;
  lon: number;
  accuracy: number;
  // Timestamp REAL del fix, entregado por el chip/plugin. V2 nunca usa
  // Date.now() como sustituto de este valor -- ver PuntoConfiableV2.timestamp.
  time: number | null;
  speed: number | null; // m/s del chip, puede no venir
  simulated: boolean | null;
  // Únicamente para diagnóstico/telemetría -- nunca se usa para decidir
  // aceptación, orden temporal ni huecos (eso es siempre con `time`).
  horaRecepcion: number;
}

export interface PuntoConfiableV2 {
  lat: number;
  lon: number;
  // SIEMPRE fix.time real -- nunca Date.now(). Si algún día hace falta
  // guardar también horaRecepcion por punto, se agrega aparte, sin
  // reemplazar este campo.
  timestamp: number;
}

export type EstadoGpsV2 = "SIN_GRABACION" | "GRABANDO" | "RECUPERANDO" | "FINALIZANDO";

export interface DiscontinuidadV2 {
  // Índices dentro de puntosConfiables (antes/después del corte).
  antesIndice: number;
  despuesIndice: number;
  motivo: "hueco" | "cambio-trayectoria";
}

// Resultado de procesar UN fix crudo -- para que quien orquesta (o una
// prueba) pueda inspeccionar qué pasó sin tener que releer todo el estado
// interno.
export type ResultadoProcesarFix =
  | { tipo: "rechazado"; motivo: string }
  | { tipo: "ruido" }
  | { tipo: "candidato-pendiente" } // GRABANDO, esperando confirmación del siguiente fix
  | { tipo: "candidato-recuperacion" } // RECUPERANDO, esperando convergencia
  | { tipo: "confiable"; punto: PuntoConfiableV2; discontinuidad: DiscontinuidadV2 | null };

// Instrumentación diagnóstica (auditoría ruta 103, ver conversación de
// diseño) -- señales nativas Android que hoy no llegan a JS por ningún otro
// camino. Puramente observacional: ningún campo de acá participa en
// ningún criterio de aceptación/rechazo/recuperación de V1 ni V2.

export interface HuecoNativoV2 {
  // Hora de reloj nativa (System.currentTimeMillis(), NO fix.time) del
  // callback onLocationResult() inmediatamente anterior y del que detectó
  // el hueco -- ver DiagnosticoNativo.registrarCallback en el patch de
  // BackgroundGeolocationService.java.
  anteriorTimestamp: number;
  actualTimestamp: number;
  intervaloSeg: number;
}

// providerAvailability -- FusedLocationProviderClient.onLocationAvailability().
// Deliberadamente separado de systemLocationEnabled (eventosDisponibilidad
// más abajo, que viene de LocationManager.MODE_CHANGED_ACTION): son dos
// señales distintas de Android, ver DisponibilidadUbicacionPlugin.java.
export interface EventoDisponibilidadProveedorV2 {
  disponible: boolean;
  horaNativa: number;
}

// Lifecycle de MainActivity (onPause/onResume) -- deliberadamente NO
// llamado "foreground/background de la app": esta señal solo prueba que la
// Activity pasó por ese punto de su ciclo de vida, no que el proceso
// completo esté suspendido ni que el WebView haya dejado de ejecutar JS.
export interface EventoPauseResumeActivityV2 {
  activo: boolean;
  hora: number;
}

// Instrumentación adicional (auditoría ruta 104 -- investigación de la
// hipótesis "doble watcher" tras el hallazgo de ráfagas onLocationAvailability
// false/true). Puramente observacional -- ver comentario en el patch de
// BackgroundGeolocationService.java.
export interface EventoWatcherV2 {
  hora: number;
  // watchers.size() real del lado nativo, JUSTO después de add()/remove().
  cantidad: number;
}

export interface ForegroundErrorV2 {
  mensaje: string;
  hora: number;
}

export interface ThreadRequestUpdatesV2 {
  nombreThread: string;
  hora: number;
}

// Lado JS de la misma investigación -- ver grabacionGps.ts. NO viene del
// plugin nativo (por eso no tiene equivalente en DiagnosticoNativo.snapshot()
// del patch); se fusiona acá por obtenerResumenGpsV2ConDiagnosticoNativo()
// en index.ts para que toda la evidencia de una misma grabación quede junta.
export interface IntentosIniciarGrabacionV2 {
  entradas: number;
  pasaronGuard: number;
  llegaronAWatcher: number;
}

export interface DiagnosticoNativoV2 {
  total: number;
  ultimoTimestamp: number;
  maxIntervaloSeg: number;
  huecosNativos: HuecoNativoV2[];
  eventosDisponibilidadProveedor: EventoDisponibilidadProveedorV2[];
  eventosPauseResumeActivity: EventoPauseResumeActivityV2[];
  // Instrumentación adicional (auditoría ruta 104) -- ver arriba.
  watchersActivos: number;
  maxWatchersSimultaneos: number;
  eventosWatchers: EventoWatcherV2[];
  foregroundIntentos: number;
  foregroundExitos: number;
  foregroundErrores: ForegroundErrorV2[];
  threadsRequestUpdates: ThreadRequestUpdatesV2[];
  // Opcional a propósito -- solo obtenerResumenGpsV2ConDiagnosticoNativo()
  // lo completa (viene de JS, no del plugin nativo). Ver index.ts.
  intentosIniciarGrabacion?: IntentosIniciarGrabacionV2;
}
