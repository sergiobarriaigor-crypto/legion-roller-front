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
// también rige el "evento" de velocidad máxima (marca + tarjeta temporal):
// su aparición/desaparición se calcula con tiempoSeg, igual que todo lo
// demás acá.
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

// Misma división en fracciones que camaraV2.ts (PF_FRAC_*) -- reimplementada
// acá de forma independiente (no importada, ese archivo queda congelado
// para este overlay). Si esa división cambia alguna vez, hay que replicar
// el cambio acá también. Solo se usa para decidir CUÁNDO mostrar la grilla
// grande de estadísticas -- nunca para mover cámara ni recalcular nada de
// GPS/velocidad.
const PF_FRAC_HOLD_OVERVIEW = 0.9 / 6.5;
const PF_FRAC_ZOOM_IN = 0.9 / 6.5;
const PF_FRAC_HOLD_VELMAX = 1.7 / 6.5;
const PF_FRAC_ZOOM_OUT = 0.9 / 6.5;

// Durante la sub-secuencia de zoom hacia velocidad máxima (panoramicaFinal
// con puntoVelMax válido), la grilla grande de estadísticas solo aparece en
// el hold final, DESPUÉS del zoom-out -- mientras tanto se muestra la barra
// chica (igual que en seguimiento), para no competir visualmente con el
// zoom/etiqueta. Sin secuencia especial (puntoVelMax null), se comporta
// EXACTAMENTE como antes de este cambio: grilla grande en toda
// panoramicaFinal.
function enHoldEstadisticasFinal(frame: FrameV2, params: ParametrosCoreografiaV2, puntoVelMax: { x: number; y: number } | null): boolean {
  if (frame.fase !== "panoramicaFinal") return false;
  if (!puntoVelMax || params.duracionPanoramicaFinalSeg <= 0) return true;
  const { tEF } = limitesTiempo(params);
  const tau = clamp((frame.tiempoSeg - tEF) / params.duracionPanoramicaFinalSeg, 0, 1);
  const t4 = PF_FRAC_HOLD_OVERVIEW + PF_FRAC_ZOOM_IN + PF_FRAC_HOLD_VELMAX + PF_FRAC_ZOOM_OUT;
  return tau > t4;
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

// Tiempo lógico (mismo eje que frame.tiempoSeg) en el que el trazado
// alcanza el punto real de velocidad máxima -- se usa solo para saber
// cuánto tiempo lleva mostrándose la tarjeta del evento, nunca para
// recalcular la velocidad ni el punto (eso siempre viene de
// datos.indiceVelMax/velocidadMaxima, ya resueltos por velocidadMaximaConPunto).
function tiempoEventoVelMax(ruta: RutaCoreografiaV2, params: ParametrosCoreografiaV2, datos: DatosEstadisticasV2): number {
  if (datos.indiceVelMax < 0) return Infinity;
  const { tBC, tD } = limitesTiempo(params);
  const fraccionEvento = ruta.distanciaAcumuladaKm[datos.indiceVelMax] / ruta.distanciaTotalKm;
  return tBC + fraccionEvento * (tD - tBC);
}

const COLOR_DORADO = "#e0b24e";
const COLOR_TEXTO_SECUNDARIO = "#c9c2b4";
const COLOR_INICIO = "#5fae4e";
const COLOR_VELMAX = "#e2453c";
const COLOR_TRAZO = "#f0b23c";
const COLOR_TRAZO_CASING = "rgba(13,10,6,0.5)";

// Cuánto tiempo (segundos de tiempoSeg, no reloj real) permanece visible la
// tarjeta del evento de velocidad máxima antes de reducirse a la marca
// discreta permanente.
const DURACION_TARJETA_VELMAX_SEG = 3;

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

function trazarRectRedondeado(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Tarjeta temporal del evento "velocidad máxima" -- aparece asociada al
// punto real (línea guía + tarjeta), sin tapar el trazado completo. Se
// ancla EXCLUSIVAMENTE a (px,py) -- la proyección de ese punto real con la
// cámara del frame actual -- nunca a la posición del marcador: si se usara
// la posición del marcador (que sigue avanzando mientras la tarjeta está
// visible) para reubicarla, la tarjeta parecería "perseguir" al marcador
// en vez de quedar fija sobre el punto geográfico donde ocurrió el evento.
// Único ajuste que sí se permite: no salirse de los bordes del canvas.
function dibujarTarjetaVelMax(ctx: CanvasRenderingContext2D, px: number, py: number, kmh: number): void {
  const ancho = 158;
  const alto = 62;
  const margen = 8;
  let arriba = true;
  let cardY = py - alto - 24;
  if (cardY < margen) {
    arriba = false;
    cardY = py + 24;
  }
  if (cardY + alto > ALTO_VIDEO - margen) cardY = ALTO_VIDEO - margen - alto;
  const cardX = clamp(px - ancho / 2, margen, ANCHO_VIDEO - ancho - margen);

  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.lineTo(px, arriba ? cardY + alto : cardY);
  ctx.stroke();

  trazarRectRedondeado(ctx, cardX, cardY, ancho, alto, 12);
  ctx.fillStyle = "rgba(13,10,6,0.82)";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = COLOR_VELMAX;
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.shadowColor = "rgba(0,0,0,0.8)";
  ctx.shadowBlur = 4;
  ctx.fillStyle = COLOR_TEXTO_SECUNDARIO;
  ctx.font = "700 13px Arial, sans-serif";
  ctx.fillText("VELOCIDAD MÁX.", cardX + ancho / 2, cardY + 24);
  ctx.fillStyle = COLOR_VELMAX;
  ctx.font = "800 26px Arial, sans-serif";
  ctx.fillText(`${Math.round(kmh)} km/h`, cardX + ancho / 2, cardY + 50);
  ctx.restore();
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
// estadísticas. `puntoVelMax` (ver resolverPuntoVelMaxV2 en camaraV2.ts) es
// el mismo valor, ya resuelto una vez, que se le pasa a la cámara -- acá
// solo se usa para decidir CUÁNDO mostrar la grilla grande de estadísticas
// (nunca para recalcular nada de GPS/velocidad).
export function dibujarOverlayFase5(
  ctx: CanvasRenderingContext2D,
  frame: FrameV2,
  ruta: RutaCoreografiaV2,
  params: ParametrosCoreografiaV2,
  datos: DatosEstadisticasV2,
  puntoVelMax: { x: number; y: number } | null,
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
  // permanente; la tarjeta con el valor solo se muestra los primeros
  // segundos lógicos después de alcanzarlo, anclada exclusivamente a la
  // proyección de ESE punto (nunca a la posición del marcador). ---
  if (datos.indiceVelMax >= 0 && distObjetivoKm >= ruta.distanciaAcumuladaKm[datos.indiceVelMax]) {
    const p = aPantalla(ruta.puntosZ17[datos.indiceVelMax], camara);
    dibujarMarcaVelMaxDiscreta(ctx, p.x, p.y);
    const tEvento = tiempoEventoVelMax(ruta, params, datos);
    if (frame.tiempoSeg < tEvento + DURACION_TARJETA_VELMAX_SEG) {
      dibujarTarjetaVelMax(ctx, p.x, p.y, datos.velocidadMaxima);
    }
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
  const enResumenFinal = frame.fase === "alejamientoPaneo" || enHoldEstadisticasFinal(frame, params, puntoVelMax);
  const distanciaMostrarKm = enResumenFinal ? datos.distanciaTotalKm : distObjetivoKm;
  const tiempoMostrarSeg = enResumenFinal ? datos.duracionTotalSeg : fraccionTrazo * datos.duracionTotalSeg;
  dibujarBarraEstadisticas(ctx, datos, distanciaMostrarKm, tiempoMostrarSeg, enResumenFinal);
}
