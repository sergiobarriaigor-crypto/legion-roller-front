// V2 -- Fase 5: trazado progresivo, marcador del patinador, evento de
// velocidad máxima y estadísticas, dibujados ENCIMA de los tiles híbridos
// ya renderizados por dibujarFrameGrabacion()/renderV2.ts. No modifica
// camaraV2.ts/trayectoriaV2.ts/segmentacionZ17.ts/tilesHibridos.ts/
// renderV2.ts/geo.ts -- todo acá es un consumidor nuevo, de solo lectura,
// de esos módulos ya congelados.
//
// Reutiliza geo.ts (distanciaHaversineKm/clasificarTramos/
// velocidadMaximaConPunto) EXACTAMENTE como ya lo hace V1 conceptualmente,
// pero sin tocar ese archivo: clasificarTramos() se llama en modo
// solo-lectura para decidir qué tramos NO deben dibujarse como parte del
// trazado (saltoGps) -- nunca para reclasificar ni "reparar" GPS. La
// velocidad máxima viene siempre de velocidadMaximaConPunto (mismo dato,
// nunca recalculado acá).
//
// Progreso SIEMPRE derivado de frame.tiempoSeg/frame.fase (FrameV2, ya
// precomputado en Fase 3) -- nunca del reloj real de MediaRecorder. Esto
// también rige el "evento" de velocidad máxima (la marca discreta y
// permanente que dibuja este archivo): su aparición se calcula con
// distObjetivoKm, igual que todo lo demás acá. La tarjeta destacada del
// evento (pausa + fade/scale) vive en overlayFase6.ts.
//
// A diferencia de V1 (que dibuja con ctx.scale/translate y necesita
// contrarrestarlo para que puntos/trazo no cambien de grosor con el
// zoom), acá TODO el canvas se dibuja con aritmética manual en espacio de
// pantalla (mismo criterio que dibujarTilesHibridos/dibujarFrameGrabacion)
// -- así que un lineWidth/radio fijo ya da grosor constante en pantalla
// sin ningún truco de escala inversa.
import { clasificarTramos, velocidadMaximaConPunto, type PuntoGps, type ClasificacionTramo } from "@/lib/geo";
import { ANCHO_VIDEO, ALTO_VIDEO, type EstadoCamaraV2, type ParametrosCoreografiaV2, type RutaCoreografiaV2 } from "./camaraV2";
import type { FrameV2 } from "./trayectoriaV2";

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

// --- Estadísticas derivadas de los puntos GPS crudos -- se calculan UNA
// sola vez (no por frame) y se reutilizan durante toda la grabación/
// preview. `distanciaTotalKm` se recibe de afuera (ruta.distanciaTotalKm,
// ya computado en Fase 2) en vez de recalcularse acá, para que el trazado/
// marcador (que interpolan sobre `ruta.distanciaAcumuladaKm`) y las
// estadísticas de distancia mostradas en pantalla nunca queden en dos
// espacios de distancia distintos.
export interface DatosEstadisticasV2 {
  clasificacion: ClasificacionTramo[];
  distanciaTotalKm: number;
  duracionTotalSeg: number;
  velocidadPromedio: number;
  velocidadMaxima: number;
  indiceVelMax: number;
}

export function construirDatosEstadisticasV2(puntos: PuntoGps[], distanciaTotalKm: number): DatosEstadisticasV2 {
  const clasificacion = clasificarTramos(puntos);
  const duracionTotalSeg = puntos.length > 1 ? (puntos[puntos.length - 1].timestamp - puntos[0].timestamp) / 1000 : 0;
  const { kmh: velocidadMaxima, indice: indiceVelMax } = velocidadMaximaConPunto(puntos);
  const velocidadPromedio = duracionTotalSeg > 0 ? distanciaTotalKm / (duracionTotalSeg / 3600) : 0;
  return { clasificacion, distanciaTotalKm, duracionTotalSeg, velocidadPromedio, velocidadMaxima, indiceVelMax };
}

// Progreso 0..1 del trazado para este frame -- reimplementación
// independiente de los mismos límites de tiempo que ya usa
// calcularFaseYCamaraV2 (tA/tBC/tD), a partir de campos públicos de
// ParametrosCoreografiaV2 + frame.fase/frame.tiempoSeg ya existentes en
// FrameV2. No se agrega fraccionTrazo a FrameV2 (tipo congelado de Fase 3).
export function fraccionTrazoDeFrame(frame: FrameV2, params: ParametrosCoreografiaV2): number {
  if (frame.fase === "panoramicaInicial" || frame.fase === "paneoAcercamiento") return 0;
  if (frame.fase === "alejamientoPaneo" || frame.fase === "panoramicaFinal") return 1;
  const tBC = limitesTiempo(params).tBC;
  const tD = limitesTiempo(params).tD;
  if (tD <= tBC) return 1;
  return clamp((frame.tiempoSeg - tBC) / (tD - tBC), 0, 1);
}

function limitesTiempo(params: ParametrosCoreografiaV2): { tBC: number; tD: number; tEF: number } {
  const tBC = params.duracionPanoramicaInicialSeg + params.duracionPaneoAcercamientoSeg;
  const tD = tBC + params.duracionSeguimientoSeg;
  const tEF = tD + params.duracionAlejamientoPaneoSeg;
  return { tBC, tD, tEF };
}

// panoramicaFinal (cámara SIEMPRE fija en ruta.centroide, sin zoom/paneo) se
// divide en dos momentos, sin mover la cámara -- mismas fracciones
// reimplementadas de forma independiente en overlayFase6.ts (que dibuja las
// etiquetas de calles/velocidad máxima con el mismo corte): primero
// trazado+calles+velocidad máxima, después un fundido corto, después las
// estadísticas generales. Acá solo se usa para decidir CUÁNDO mostrar la
// grilla grande de estadísticas (barra chica antes, grilla grande después);
// si esa división cambia, hay que replicar el cambio en overlayFase6.ts.
const FRAC_BEAT_A_FIN = 2.5 / 5.5;
const FRAC_FUNDIDO_FIN = 2.8 / 5.5;

// Punto de corte "duro" para la barra de estadísticas (a mitad del fundido)
// -- a diferencia de las etiquetas de calles (que sí se desvanecen suave),
// la barra ocupa la misma franja de pantalla en sus dos versiones y un
// fundido cruzado entre ambas se ve confuso (textos superpuestos); un corte
// único, escondido dentro del fundido corto de las etiquetas, se percibe
// como parte de la misma transición.
function enBeatEstadisticasFinal(frame: FrameV2, params: ParametrosCoreografiaV2): boolean {
  if (frame.fase !== "panoramicaFinal") return false;
  if (params.duracionPanoramicaFinalSeg <= 0) return true;
  const { tEF } = limitesTiempo(params);
  const tau = clamp((frame.tiempoSeg - tEF) / params.duracionPanoramicaFinalSeg, 0, 1);
  const corte = (FRAC_BEAT_A_FIN + FRAC_FUNDIDO_FIN) / 2;
  return tau > corte;
}

function indiceYProgresoEnDistancia(ruta: RutaCoreografiaV2, distObjetivoKm: number): { indice: number; progreso: number } {
  const { distanciaAcumuladaKm } = ruta;
  let i = 0;
  while (i < distanciaAcumuladaKm.length - 2 && distanciaAcumuladaKm[i + 1] <= distObjetivoKm) i++;
  const distTramoKm = distanciaAcumuladaKm[i + 1] - distanciaAcumuladaKm[i];
  const progreso = distTramoKm > 0 ? clamp((distObjetivoKm - distanciaAcumuladaKm[i]) / distTramoKm, 0, 1) : 0;
  return { indice: i, progreso };
}

// Posición real interpolada del patinador sobre la ruta (espacio Z17),
// para el fraccionTrazo dado -- misma lógica de interpolación por
// distancia que la cámara (puntoADistanciaKmZ17 en camaraV2.ts),
// reimplementada acá de forma independiente en vez de exportarla desde
// ahí, para no tocar ese archivo.
export function interpolarPosicionEnRuta(ruta: RutaCoreografiaV2, fraccionTrazo: number): { x: number; y: number } {
  const distObjetivo = clamp(fraccionTrazo, 0, 1) * ruta.distanciaTotalKm;
  const { indice, progreso } = indiceYProgresoEnDistancia(ruta, distObjetivo);
  const a = ruta.puntosZ17[indice];
  const b = ruta.puntosZ17[indice + 1];
  return { x: a.x + (b.x - a.x) * progreso, y: a.y + (b.y - a.y) * progreso };
}

function aPantalla(punto: { x: number; y: number }, camara: EstadoCamaraV2): { x: number; y: number } {
  return {
    x: ANCHO_VIDEO / 2 + (punto.x - camara.cx) * camara.escala,
    y: ALTO_VIDEO / 2 + (punto.y - camara.cy) * camara.escala,
  };
}

const COLOR_DORADO = "#e0b24e";
const COLOR_TEXTO_SECUNDARIO = "#c9c2b4";
const COLOR_INICIO = "#5fae4e";
const COLOR_VELMAX = "#e2453c";
const COLOR_TRAZO = "#f0b23c";
const COLOR_TRAZO_CASING = "rgba(13,10,6,0.5)";

function dibujarPuntoSimple(ctx: CanvasRenderingContext2D, cx: number, cy: number, radio: number, color: string): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radio, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.stroke();
  ctx.restore();
}

// Marcador del patinador -- anillo blanco exterior (contraste sobre fondos
// oscuros: agua/vegetación) + relleno dorado + borde oscuro pegado al
// relleno (contraste sobre fondos claros: hormigón/arena) + halo suave.
// Todo en radios de pantalla fijos -- constante en pantalla sin importar
// camara.escala (misma razón que el resto de este archivo).
function dibujarMarcadorPatinador(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
  const radio = 10;
  ctx.save();
  ctx.shadowColor = "rgba(224,178,78,0.85)";
  ctx.shadowBlur = 9;
  ctx.beginPath();
  ctx.arc(cx, cy, radio + 3, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255,255,255,0.95)";
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.beginPath();
  ctx.arc(cx, cy, radio, 0, Math.PI * 2);
  ctx.fillStyle = COLOR_DORADO;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#0d0a06";
  ctx.stroke();
  ctx.restore();
}

// Marca discreta y permanente del punto real de velocidad máxima -- queda
// así una vez que la tarjeta temporal se retira.
function dibujarMarcaVelMaxDiscreta(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
  dibujarPuntoSimple(ctx, cx, cy, 6, COLOR_VELMAX);
}

// Barra superior -- durante seguimiento solo DISTANCIA/TIEMPO (la
// velocidad actual dejó de mostrarse permanentemente: solo tiene
// protagonismo en el evento de velocidad máxima y en el resumen final).
// Resumen final: panel más alto con las 4 métricas en grilla 2x2.
function dibujarBarraEstadisticas(
  ctx: CanvasRenderingContext2D,
  datos: DatosEstadisticasV2,
  distanciaMostrarKm: number,
  tiempoMostrarSeg: number,
  enResumenFinal: boolean,
): void {
  ctx.save();

  if (!enResumenFinal) {
    const altura = 100;
    ctx.fillStyle = "rgba(13,10,6,0.64)";
    ctx.fillRect(0, 0, ANCHO_VIDEO, altura);
    ctx.shadowColor = "rgba(0,0,0,0.85)";
    ctx.shadowBlur = 6;
    ctx.textAlign = "center";

    const columnas = [
      { valor: `${distanciaMostrarKm.toFixed(2)} km`, etiqueta: "DISTANCIA" },
      { valor: `${Math.round(tiempoMostrarSeg / 60)} min`, etiqueta: "TIEMPO" },
    ];
    const anchoColumna = ANCHO_VIDEO / columnas.length;
    columnas.forEach((col, i) => {
      const cx = anchoColumna * i + anchoColumna / 2;
      ctx.fillStyle = COLOR_DORADO;
      ctx.font = "800 36px Arial, sans-serif";
      ctx.fillText(col.valor, cx, 52);
      ctx.fillStyle = COLOR_TEXTO_SECUNDARIO;
      ctx.font = "700 19px Arial, sans-serif";
      ctx.fillText(col.etiqueta, cx, 80);
    });
  } else {
    const altura = 168;
    ctx.fillStyle = "rgba(13,10,6,0.78)";
    ctx.fillRect(0, 0, ANCHO_VIDEO, altura);
    ctx.shadowColor = "rgba(0,0,0,0.85)";
    ctx.shadowBlur = 6;
    ctx.textAlign = "center";

    const celdas = [
      { valor: `${datos.distanciaTotalKm.toFixed(2)} km`, etiqueta: "DISTANCIA TOTAL" },
      { valor: `${Math.round(datos.duracionTotalSeg / 60)} min`, etiqueta: "TIEMPO TOTAL" },
      { valor: `${Math.round(datos.velocidadPromedio)} km/h`, etiqueta: "VEL. PROMEDIO" },
      { valor: `${Math.round(datos.velocidadMaxima)} km/h`, etiqueta: "VEL. MÁXIMA" },
    ];
    const anchoColumna = ANCHO_VIDEO / 2;
    celdas.forEach((celda, i) => {
      const col = i % 2;
      const fila = Math.floor(i / 2);
      const cx = anchoColumna * col + anchoColumna / 2;
      const yValor = 46 + fila * 78;
      ctx.fillStyle = COLOR_DORADO;
      ctx.font = "800 30px Arial, sans-serif";
      ctx.fillText(celda.valor, cx, yValor);
      ctx.fillStyle = COLOR_TEXTO_SECUNDARIO;
      ctx.font = "700 18px Arial, sans-serif";
      ctx.fillText(celda.etiqueta, cx, yValor + 26);
    });
  }

  ctx.restore();
}

// Punto de entrada único de Fase 5 -- se llama DESPUÉS de dibujar los
// tiles híbridos del frame (dibujarFrameGrabacion en grabacionV2.ts, o el
// draw loop del preview en /debug-video-v2). Orden interno ya fijo:
// trazado -> marca de velocidad máxima -> marcador/punto final ->
// estadísticas.
export function dibujarOverlayFase5(
  ctx: CanvasRenderingContext2D,
  frame: FrameV2,
  ruta: RutaCoreografiaV2,
  params: ParametrosCoreografiaV2,
  datos: DatosEstadisticasV2,
): void {
  if (frame.fase === "panoramicaInicial" || frame.fase === "paneoAcercamiento") return;

  const camara = frame.camara;
  const fraccionTrazo = fraccionTrazoDeFrame(frame, params);
  const distObjetivoKm = fraccionTrazo * ruta.distanciaTotalKm;
  const { indice: indiceActual } = indiceYProgresoEnDistancia(ruta, distObjetivoKm);
  const posicionActual = interpolarPosicionEnRuta(ruta, fraccionTrazo);

  // --- Trazado progresivo: tramos completos ya recorridos + el tramo
  // parcial hasta la posición actual, saltando los tramos saltoGps (hueco
  // visual, nunca una línea recta falsa sobre el error de GPS). Casing
  // oscuro debajo del trazo dorado para que se lea sobre satélite claro
  // sin necesitar una línea más gruesa. ---
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (let pasada = 0; pasada < 2; pasada++) {
    ctx.lineWidth = pasada === 0 ? 11 : 7;
    ctx.strokeStyle = pasada === 0 ? COLOR_TRAZO_CASING : COLOR_TRAZO;
    for (let k = 0; k < indiceActual; k++) {
      if (datos.clasificacion[k + 1] === "saltoGps") continue;
      const a = aPantalla(ruta.puntosZ17[k], camara);
      const b = aPantalla(ruta.puntosZ17[k + 1], camara);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    if (datos.clasificacion[indiceActual + 1] !== "saltoGps") {
      const a = aPantalla(ruta.puntosZ17[indiceActual], camara);
      const b = aPantalla(posicionActual, camara);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }
  ctx.restore();

  const inicioPantalla = aPantalla(ruta.puntosZ17[0], camara);
  dibujarPuntoSimple(ctx, inicioPantalla.x, inicioPantalla.y, 7, COLOR_INICIO);

  // --- Evento de velocidad máxima: la marca discreta aparece apenas el
  // progreso alcanza ese punto real (mismo índice de
  // velocidadMaximaConPunto, sin recalcular nada de GPS) y queda
  // permanente. La tarjeta destacada del evento (pausa + fade/scale) ya no
  // vive acá -- ver dibujarPausaVelMaxV2 en overlayFase6.ts, que arranca
  // exactamente en este mismo punto real (frame.pausaVelMax, resuelto por
  // Fase 3 al construir la trayectoria). ---
  if (datos.indiceVelMax >= 0 && distObjetivoKm >= ruta.distanciaAcumuladaKm[datos.indiceVelMax]) {
    const p = aPantalla(ruta.puntosZ17[datos.indiceVelMax], camara);
    dibujarMarcaVelMaxDiscreta(ctx, p.x, p.y);
  }

  // --- Marcador del patinador -- durante seguimiento, el ícono animado con
  // halo; una vez el trazado llega al final (alejamiento/panorámica final)
  // pasa a ser un punto simple, igual que el de inicio, para que "inicio" y
  // "fin" se lean como un par claro de extremos del trazado -- el ícono
  // animado (pensado para una posición EN MOVIMIENTO) queda reservado para
  // mientras el trazado sigue avanzando de verdad. ---
  const marcadorPantalla = aPantalla(posicionActual, camara);
  if (fraccionTrazo >= 1) {
    dibujarPuntoSimple(ctx, marcadorPantalla.x, marcadorPantalla.y, 7, COLOR_DORADO);
  } else {
    dibujarMarcadorPatinador(ctx, marcadorPantalla.x, marcadorPantalla.y);
  }

  // --- Estadísticas ---
  const enResumenFinal = frame.fase === "alejamientoPaneo" || enBeatEstadisticasFinal(frame, params);
  const distanciaMostrarKm = enResumenFinal ? datos.distanciaTotalKm : distObjetivoKm;
  const tiempoMostrarSeg = enResumenFinal ? datos.duracionTotalSeg : fraccionTrazo * datos.duracionTotalSeg;
  dibujarBarraEstadisticas(ctx, datos, distanciaMostrarKm, tiempoMostrarSeg, enResumenFinal);
}
