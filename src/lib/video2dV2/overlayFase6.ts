// V2 -- Fase 6A: fotos durante el recorrido + cierre (foto final + logo y
// ciudad). Dibuja ENCIMA del overlay de Fase 5 (orden ya fijo: tiles ->
// Fase 5 -> Fase 6), y agrega los beats de cierre como cuadros adicionales
// DESPUÉS de trayectoria[] -- no depende de camaraV2.ts/trayectoriaV2.ts
// para nada (los beats de cierre reutilizan el último estado de cámara ya
// congelado en panoramicaFinal, sin volver a llamar calcularFaseYCamaraV2).
// No modifica overlayFase5.ts -- las fórmulas que comparte conceptualmente
// (fracción de trazado, interpolación por distancia, tarjeta con línea
// guía) están REIMPLEMENTADAS acá de forma independiente, a propósito, para
// no crear ningún acoplamiento con ese archivo congelado.
import { ANCHO_VIDEO, ALTO_VIDEO, type EstadoCamaraV2, type ParametrosCoreografiaV2, type RutaCoreografiaV2 } from "./camaraV2";
import type { FrameV2 } from "./trayectoriaV2";
// Solo el TIPO -- lectura de datos.indiceVelMax/velocidadMaxima ya
// resueltos por Fase 5 (velocidadMaximaConPunto), nunca se recalculan acá
// ni se importa ninguna función/lógica de overlayFase5.ts.
import type { DatosEstadisticasV2 } from "./overlayFase5";

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

// --- Carga/decodificación -- SIEMPRE antes de MediaRecorder.start() (mismo
// principio que tilesHibridos.ts). Nunca aborta: una foto que falla se
// omite (log + exclusión), nunca corta la generación del video completo. ---
export async function cargarImagenDecodificada(url: string, log?: (linea: string) => void): Promise<HTMLImageElement | null> {
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } catch (e) {
    log?.(`[v2-fase6] ERROR al cargar/decodificar imagen (${url}): ${(e as Error).message ?? e}`);
    return null;
  }
}

export async function cargarFotosRutaV2(
  urls: string[],
  log?: (linea: string) => void,
): Promise<HTMLImageElement[]> {
  const cargadas = await Promise.all(urls.map((url) => cargarImagenDecodificada(url, log)));
  const validas = cargadas.filter((img): img is HTMLImageElement => img !== null);
  if (validas.length < urls.length) {
    log?.(`[v2-fase6] fotos de ruta descartadas por error de carga: ${urls.length - validas.length}/${urls.length}`);
  }
  return validas;
}

// --- Fracciones de aparición -- mismos valores ya usados en V1
// (fraccionesPines), reutilizados acá tal cual: 1 foto -> mitad de la
// ruta; 2 -> 35%/70%; 3 -> 18%/50%/82%. No expuestos como configuración. ---
function fraccionesFotosRuta(n: number): number[] {
  if (n <= 0) return [];
  if (n === 1) return [0.5];
  if (n === 2) return [0.35, 0.7];
  return [0.18, 0.5, 0.82];
}

const FADE_IN_FOTO_SEG = 0.4;
const HOLD_FOTO_NOMINAL_SEG = 3.5;
const FADE_OUT_FOTO_NOMINAL_SEG = 0.5;
const FADE_OUT_FOTO_MIN_SEG = 0.15;
const SEPARACION_MIN_ENTRE_FOTOS_SEG = 0.05; // colchón para que nunca toquen el siguiente evento

export interface FotoRutaV2 {
  img: HTMLImageElement;
  distanciaObjetivoKm: number;
  punto: { x: number; y: number };
  tiempoEventoSeg: number;
  duracionFadeInSeg: number;
  duracionHoldSeg: number;
  duracionFadeOutSeg: number;
  // Posición de pantalla CONGELADA al construir (no se recalcula por frame)
  // -- ver comentario en construirFotosRutaV2 sobre por qué y cómo.
  cardX: number;
  cardY: number;
  arriba: boolean;
}

function limitesTiempoSeguimiento(params: ParametrosCoreografiaV2): { tBC: number; tD: number } {
  const tBC = params.duracionPanoramicaInicialSeg + params.duracionPaneoAcercamientoSeg;
  return { tBC, tD: tBC + params.duracionSeguimientoSeg };
}

function indiceYProgresoEnDistancia(ruta: RutaCoreografiaV2, distObjetivoKm: number): { indice: number; progreso: number } {
  const { distanciaAcumuladaKm } = ruta;
  let i = 0;
  while (i < distanciaAcumuladaKm.length - 2 && distanciaAcumuladaKm[i + 1] <= distObjetivoKm) i++;
  const distTramoKm = distanciaAcumuladaKm[i + 1] - distanciaAcumuladaKm[i];
  const progreso = distTramoKm > 0 ? clamp((distObjetivoKm - distanciaAcumuladaKm[i]) / distTramoKm, 0, 1) : 0;
  return { indice: i, progreso };
}

function puntoEnDistancia(ruta: RutaCoreografiaV2, distObjetivoKm: number): { x: number; y: number } {
  const { indice, progreso } = indiceYProgresoEnDistancia(ruta, distObjetivoKm);
  const a = ruta.puntosZ17[indice];
  const b = ruta.puntosZ17[indice + 1];
  return { x: a.x + (b.x - a.x) * progreso, y: a.y + (b.y - a.y) * progreso };
}

// Progreso 0..1 del trazado -- misma fórmula que fraccionTrazoDeFrame en
// overlayFase5.ts, reimplementada acá de forma independiente (no importada).
export function fraccionTrazoDeFrameV2(frame: FrameV2, params: ParametrosCoreografiaV2): number {
  if (frame.fase === "panoramicaInicial" || frame.fase === "paneoAcercamiento") return 0;
  if (frame.fase === "alejamientoPaneo" || frame.fase === "panoramicaFinal") return 1;
  const { tBC, tD } = limitesTiempoSeguimiento(params);
  if (tD <= tBC) return 1;
  return clamp((frame.tiempoSeg - tBC) / (tD - tBC), 0, 1);
}

function aPantalla(punto: { x: number; y: number }, camara: EstadoCamaraV2): { x: number; y: number } {
  return {
    x: ANCHO_VIDEO / 2 + (punto.x - camara.cx) * camara.escala,
    y: ALTO_VIDEO / 2 + (punto.y - camara.cy) * camara.escala,
  };
}

// Frame de trayectoria[] cuyo tiempoSeg está más cerca del buscado --
// búsqueda lineal (trayectoria tiene a lo sumo unos cientos de elementos,
// se llama una vez por foto, nunca por frame de video). Determinista: solo
// lee el array ya precomputado por Fase 3, ningún reloj real de por medio.
function buscarFrameCercano(trayectoria: FrameV2[], tiempoSeg: number): FrameV2 {
  let mejor = trayectoria[0];
  let mejorDelta = Math.abs(trayectoria[0].tiempoSeg - tiempoSeg);
  for (let i = 1; i < trayectoria.length; i++) {
    const delta = Math.abs(trayectoria[i].tiempoSeg - tiempoSeg);
    if (delta < mejorDelta) {
      mejor = trayectoria[i];
      mejorDelta = delta;
    }
  }
  return mejor;
}

const PADDING_TARJETA_FOTO = 16;
const ANCHO_TARJETA_FOTO = ANCHO_VIDEO * 0.6;
const ALTO_TARJETA_FOTO = 480;

// Tamaño de la tarjeta -- ancho y alto FIJOS E IDÉNTICOS para las 3 fotos
// (ancho ~60% del video, dentro de 55-65%), independientemente de la
// orientación real de cada imagen. La foto se ajusta con "contain" DENTRO
// de esa caja fija (nunca la agranda más allá de sus dimensiones
// originales ni la recorta ni la deforma) -- una foto panorámica deja
// franjas arriba/abajo, una foto vertical deja franjas a los costados,
// pero el contenedor (y sus bordes redondeados) siempre miden lo mismo.
// Depende solo de la imagen, nunca de la cámara -- por eso es seguro
// llamarla tanto al congelar la posición (una vez) como al dibujar (cada
// frame): siempre da el mismo resultado para la misma imagen.
function calcularTamanoTarjetaFoto(img: HTMLImageElement): { anchoCard: number; altoCard: number; anchoImg: number; altoImg: number } {
  const cajaInteriorAncho = ANCHO_TARJETA_FOTO - PADDING_TARJETA_FOTO * 2;
  const cajaInteriorAlto = ALTO_TARJETA_FOTO - PADDING_TARJETA_FOTO * 2;
  const escalaContain = Math.min(cajaInteriorAncho / img.naturalWidth, cajaInteriorAlto / img.naturalHeight);
  const anchoImg = img.naturalWidth * escalaContain;
  const altoImg = img.naturalHeight * escalaContain;
  return { anchoCard: ANCHO_TARJETA_FOTO, altoCard: ALTO_TARJETA_FOTO, anchoImg, altoImg };
}

// Elige arriba/abajo + clampea contra los bordes -- misma lógica de
// siempre, pero evaluada UNA sola vez (al congelar), no por frame.
function calcularPosicionTarjeta(px: number, py: number, anchoCard: number, altoCard: number): { cardX: number; cardY: number; arriba: boolean } {
  const margen = 10;
  let arriba = true;
  let cardY = py - altoCard - 26;
  if (cardY < margen) {
    arriba = false;
    cardY = py + 26;
  }
  if (cardY + altoCard > ALTO_VIDEO - margen) cardY = ALTO_VIDEO - margen - altoCard;
  const cardX = clamp(px - anchoCard / 2, margen, ANCHO_VIDEO - anchoCard - margen);
  return { cardX, cardY, arriba };
}

// Construye los eventos de foto -- calcula distancia/punto/tiempo objetivo
// de cada una, recorta hold/fade-out (nunca el fade-in) para que la
// tarjeta de una foto SIEMPRE termine antes de que empiece la siguiente, y
// CONGELA la posición de pantalla de la tarjeta (cardX/cardY/arriba) en el
// frame de trayectoria[] más cercano al instante en que el evento arranca.
// Esa posición queda fija durante todo el evento -- el punto GPS (px,py)
// se sigue reproyectando con la cámara actual en cada frame (para la línea
// guía), pero la tarjeta ya no. No mueve fracciones de aparición.
export function construirFotosRutaV2(
  imagenes: HTMLImageElement[],
  ruta: RutaCoreografiaV2,
  params: ParametrosCoreografiaV2,
  trayectoria: FrameV2[],
): FotoRutaV2[] {
  const fracciones = fraccionesFotosRuta(imagenes.length);
  const { tBC, tD } = limitesTiempoSeguimiento(params);

  const base = imagenes.map((img, i) => {
    const fraccion = fracciones[i];
    const distanciaObjetivoKm = fraccion * ruta.distanciaTotalKm;
    return {
      img,
      distanciaObjetivoKm,
      punto: puntoEnDistancia(ruta, distanciaObjetivoKm),
      tiempoEventoSeg: tBC + fraccion * (tD - tBC),
    };
  });

  return base.map((foto, i) => {
    // La última foto no tiene "siguiente foto" contra qué recortarse -- su
    // límite pasa a ser tD (fin de seguimiento), para garantizar que
    // ninguna tarjeta de foto sobreviva a alejamiento/panorámica final
    // (esa fase le pertenece al resumen de Fase 5 y a la foto de cierre).
    const siguienteTiempoSeg = i + 1 < base.length ? base[i + 1].tiempoEventoSeg : tD;
    const disponibleSeg = siguienteTiempoSeg - foto.tiempoEventoSeg - SEPARACION_MIN_ENTRE_FOTOS_SEG;

    let hold = HOLD_FOTO_NOMINAL_SEG;
    let fadeOut = FADE_OUT_FOTO_NOMINAL_SEG;
    const disponibleParaHoldYFadeOut = disponibleSeg - FADE_IN_FOTO_SEG;

    if (disponibleParaHoldYFadeOut < hold + fadeOut) {
      // 1) recortar primero el hold (puede llegar a 0)
      hold = Math.max(0, disponibleParaHoldYFadeOut - fadeOut);
      // 2) si con hold=0 todavía no alcanza, recortar el fade-out (con un piso
      // mínimo para que siga siendo un fundido, no un corte duro)
      if (hold === 0 && disponibleParaHoldYFadeOut < fadeOut) {
        fadeOut = clamp(disponibleParaHoldYFadeOut, 0, FADE_OUT_FOTO_NOMINAL_SEG);
        if (fadeOut < FADE_OUT_FOTO_MIN_SEG) fadeOut = Math.max(0, disponibleParaHoldYFadeOut);
      }
    }

    const frameEvento = buscarFrameCercano(trayectoria, foto.tiempoEventoSeg);
    const pantallaEnElEvento = aPantalla(foto.punto, frameEvento.camara);
    const { anchoCard, altoCard } = calcularTamanoTarjetaFoto(foto.img);
    const { cardX, cardY, arriba } = calcularPosicionTarjeta(pantallaEnElEvento.x, pantallaEnElEvento.y, anchoCard, altoCard);

    return {
      ...foto,
      duracionFadeInSeg: FADE_IN_FOTO_SEG,
      duracionHoldSeg: hold,
      duracionFadeOutSeg: fadeOut,
      cardX,
      cardY,
      arriba,
    };
  });
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

const COLOR_FONDO_MARCA = "#0d0a06";
const COLOR_DORADO = "#e0b24e";
const COLOR_TEXTO_SECUNDARIO = "#c9c2b4";
const COLOR_MARCA_FOTO = "#7fb2e0";

// Marca discreta y permanente del lugar donde apareció una foto -- mismo
// criterio visual que la marca de velocidad máxima de Fase 5 (círculo
// chico con anillo claro), pero en un color propio para no confundirse con
// el evento de velocidad máxima.
function dibujarMarcaFotoDiscreta(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, 5, 0, Math.PI * 2);
  ctx.fillStyle = COLOR_MARCA_FOTO;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.stroke();
  ctx.restore();
}

// Tarjeta de foto -- ancho FIJO (~60% del video, dentro de 55-65%), alto
// según la orientación real de la imagen (contain, nunca recorta), tope de
// alto para fotos muy verticales. Alpha y escala de entrada ya vienen
// resueltos por el llamador (fade-in/hold/fade-out).
function dibujarTarjetaFotoV2(ctx: CanvasRenderingContext2D, foto: FotoRutaV2, px: number, py: number, alpha: number, escala: number): void {
  const { anchoCard, altoCard, anchoImg, altoImg } = calcularTamanoTarjetaFoto(foto.img);
  // Posición CONGELADA -- (px,py) es el punto GPS reproyectado con la
  // cámara de ESTE frame (se sigue moviendo), pero la tarjeta usa siempre
  // el mismo cardX/cardY/arriba calculados una vez en construirFotosRutaV2.
  const { cardX, cardY, arriba } = foto;

  ctx.save();
  ctx.globalAlpha = alpha;

  // Línea guía dinámica: del punto real actual (px,py, se mueve con la
  // cámara) al borde fijo de la tarjeta -- largo/ángulo cambian con el
  // paneo, la tarjeta no.
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.lineTo(cardX + anchoCard / 2, arriba ? cardY + altoCard : cardY);
  ctx.stroke();

  const cx = cardX + anchoCard / 2;
  const cy = cardY + altoCard / 2;
  ctx.translate(cx, cy);
  ctx.scale(escala, escala);
  ctx.translate(-cx, -cy);

  trazarRectRedondeado(ctx, cardX, cardY, anchoCard, altoCard, 14);
  ctx.fillStyle = "rgba(13,10,6,0.75)";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(224,178,78,0.55)";
  ctx.stroke();

  const imgX = cardX + (anchoCard - anchoImg) / 2;
  const imgY = cardY + (altoCard - altoImg) / 2;
  trazarRectRedondeado(ctx, imgX, imgY, anchoImg, altoImg, 8);
  ctx.save();
  ctx.clip();
  ctx.drawImage(foto.img, imgX, imgY, anchoImg, altoImg);
  ctx.restore();

  ctx.restore();
}

// Progreso 0..1..0 (fade-in/hold/fade-out) + escala de entrada leve, dado el
// tiempo transcurrido desde el evento y las duraciones (ya recortadas para
// no solaparse con la siguiente foto).
function calcularAlphaYEscala(
  tDesdeEventoSeg: number,
  fadeInSeg: number,
  holdSeg: number,
  fadeOutSeg: number,
): { visible: boolean; alpha: number; escala: number } {
  const finFadeIn = fadeInSeg;
  const finHold = finFadeIn + holdSeg;
  const finFadeOut = finHold + fadeOutSeg;
  if (tDesdeEventoSeg < 0 || tDesdeEventoSeg >= finFadeOut) return { visible: false, alpha: 0, escala: 1 };

  if (tDesdeEventoSeg < finFadeIn) {
    const k = fadeInSeg > 0 ? tDesdeEventoSeg / fadeInSeg : 1;
    return { visible: true, alpha: k, escala: 0.92 + 0.08 * k };
  }
  if (tDesdeEventoSeg < finHold) {
    return { visible: true, alpha: 1, escala: 1 };
  }
  const k = fadeOutSeg > 0 ? (tDesdeEventoSeg - finHold) / fadeOutSeg : 1;
  return { visible: true, alpha: 1 - k, escala: 1 };
}

// Punto de entrada -- fotos durante el recorrido. Se llama DESPUÉS de
// dibujarOverlayFase5 (orden: tiles -> Fase 5 -> Fase 6), en los mismos dos
// call-sites de grabacionV2.ts donde ya se llama Fase 5.
export function dibujarFotosRutaV2(ctx: CanvasRenderingContext2D, frame: FrameV2, ruta: RutaCoreografiaV2, params: ParametrosCoreografiaV2, fotos: FotoRutaV2[]): void {
  if (frame.fase === "panoramicaInicial" || frame.fase === "paneoAcercamiento") return;
  if (fotos.length === 0) return;

  const camara = frame.camara;
  const fraccionTrazo = fraccionTrazoDeFrameV2(frame, params);
  const distObjetivoKm = fraccionTrazo * ruta.distanciaTotalKm;

  for (const foto of fotos) {
    if (distObjetivoKm < foto.distanciaObjetivoKm) continue;
    const p = aPantalla(foto.punto, camara);
    dibujarMarcaFotoDiscreta(ctx, p.x, p.y);

    const tDesdeEvento = frame.tiempoSeg - foto.tiempoEventoSeg;
    const { visible, alpha, escala } = calcularAlphaYEscala(tDesdeEvento, foto.duracionFadeInSeg, foto.duracionHoldSeg, foto.duracionFadeOutSeg);
    if (visible) dibujarTarjetaFotoV2(ctx, foto, p.x, p.y, alpha, escala);
  }
}

// Alto del panel de resumen que Fase 5 dibuja arriba durante
// alejamiento/panorámica final (ver dibujarBarraEstadisticas en
// overlayFase5.ts) -- reimplementado acá como constante propia, solo para
// no ubicar la etiqueta encima de ese panel. No es una llamada a esa
// función ni depende de su código, solo del mismo número ya conocido.
const ALTO_PANEL_RESUMEN_FINAL = 168;
const COLOR_VELMAX_FINAL = "#e2453c"; // mismo rojo que la marca discreta de Fase 5, reimplementado (no importado)

// Etiqueta compacta "⚡ XX km/h" durante alejamiento + panorámica final --
// distinta de la tarjeta grande de Fase 5 (esa ya desapareció antes de
// tD). Ancla al MISMO punto/índice que Fase 5 ya resolvió
// (datos.indiceVelMax/velocidadMaxima, vía velocidadMaximaConPunto) --
// nunca recalcula nada de GPS/velocidad. Se georreferencia con la cámara
// de cada frame (tamaño en pantalla fijo, como todo lo demás acá). Deja de
// dibujarse sola en cuanto termina panoramicaFinal, porque esta función
// solo se llama desde el loop principal -- los beats de cierre (foto
// final/logo) nunca la invocan.
export function dibujarEtiquetaVelMaxFinalV2(ctx: CanvasRenderingContext2D, frame: FrameV2, ruta: RutaCoreografiaV2, datos: DatosEstadisticasV2): void {
  if (frame.fase !== "alejamientoPaneo" && frame.fase !== "panoramicaFinal") return;
  if (datos.indiceVelMax < 0) return;

  const p = aPantalla(ruta.puntosZ17[datos.indiceVelMax], frame.camara);
  const texto = `⚡ ${Math.round(datos.velocidadMaxima)} km/h`;

  ctx.save();
  ctx.font = "700 15px Arial, sans-serif";
  const anchoTexto = ctx.measureText(texto).width;
  const paddingX = 10;
  const anchoChip = anchoTexto + paddingX * 2;
  const altoChip = 26;

  const margen = 8;
  let arriba = true;
  let chipY = p.y - altoChip - 16;
  // Nunca superponerse con el panel de estadísticas de Fase 5 (arriba de
  // todo, siempre presente en estas dos fases).
  if (chipY < ALTO_PANEL_RESUMEN_FINAL + margen) {
    arriba = false;
    chipY = p.y + 16;
  }
  if (chipY + altoChip > ALTO_VIDEO - margen) chipY = ALTO_VIDEO - margen - altoChip;
  const chipX = clamp(p.x - anchoChip / 2, margen, ANCHO_VIDEO - anchoChip - margen);

  // Línea guía corta -- mismo criterio que la tarjeta de foto/vel. máxima,
  // conecta el punto real (georreferenciado) con la etiqueta.
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineTo(chipX + anchoChip / 2, arriba ? chipY + altoChip : chipY);
  ctx.stroke();

  // Píldora compacta -- deliberadamente más chica que la tarjeta temporal
  // (158x62) de Fase 5.
  trazarRectRedondeado(ctx, chipX, chipY, anchoChip, altoChip, altoChip / 2);
  ctx.fillStyle = "rgba(13,10,6,0.78)";
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = COLOR_VELMAX_FINAL;
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(0,0,0,0.8)";
  ctx.shadowBlur = 4;
  ctx.fillStyle = "#f2efe9";
  ctx.fillText(texto, chipX + anchoChip / 2, chipY + altoChip / 2 + 1);
  ctx.restore();
}

// --- Cierre: foto final + transición + logo/ciudad -- cuadros agregados
// DESPUÉS de trayectoria[] en grabacionV2.ts, sin volver a tocar la cámara.
// Todo lo de acá trabaja en tiempo propio (0..duracion de cada beat), nunca
// en frame.tiempoSeg (ese eje ya terminó con el último frame real). ---
// Envolvente de alpha fade-in/hold/fade-out para un beat de duración fija
// en tiempo propio (0..duracionTotalSeg) -- usada por la foto final.
export function alphaFadeInHoldOut(tSeg: number, duracionTotalSeg: number, fadeSeg: number): number {
  if (tSeg < 0 || duracionTotalSeg <= 0) return 0;
  if (tSeg < fadeSeg) return clamp(tSeg / fadeSeg, 0, 1);
  if (tSeg < duracionTotalSeg - fadeSeg) return 1;
  if (tSeg < duracionTotalSeg) return clamp((duracionTotalSeg - tSeg) / fadeSeg, 0, 1);
  return 0;
}

// Solo fade-in, se sostiene en 1 después -- usada por el logo/ciudad (es el
// último beat antes de stop(), no necesita fade-out propio).
export function alphaFadeIn(tSeg: number, fadeSeg: number): number {
  if (tSeg < 0) return 0;
  return fadeSeg > 0 ? clamp(tSeg / fadeSeg, 0, 1) : 1;
}

export function dibujarFondoMarcaV2(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = COLOR_FONDO_MARCA;
  ctx.fillRect(0, 0, ANCHO_VIDEO, ALTO_VIDEO);
}

// Fundido hacia el color de fondo de marca -- se dibuja SIN limpiar el
// canvas antes, así el último cuadro real (mapa+resumen, o el cierre de la
// foto final) se ve debajo, cada vez más cubierto por el color de marca.
// Reemplaza el corte duro que tenía V1 antes del logo/ciudad.
export function dibujarTransicionAFondoMarcaV2(ctx: CanvasRenderingContext2D, progreso01: number): void {
  ctx.fillStyle = `rgba(13,10,6,${clamp(progreso01, 0, 1)})`;
  ctx.fillRect(0, 0, ANCHO_VIDEO, ALTO_VIDEO);
}

// Foto final -- 80-85% del ancho, contain, esquinas redondeadas, centrada
// sobre el fondo de marca (ya dibujado por el llamador). Sin blur.
export function dibujarFotoFinalV2(ctx: CanvasRenderingContext2D, img: HTMLImageElement, alpha: number): void {
  const anchoCard = ANCHO_VIDEO * 0.82;
  const altoMaxCard = ALTO_VIDEO * 0.62;
  const relacion = img.naturalWidth / img.naturalHeight || 1;
  const escalaContain = Math.min(anchoCard / img.naturalWidth, altoMaxCard / img.naturalHeight);
  const anchoImg = img.naturalWidth * escalaContain;
  const altoImg = anchoImg / relacion;
  const x = (ANCHO_VIDEO - anchoImg) / 2;
  const y = (ALTO_VIDEO - altoImg) / 2;

  ctx.save();
  ctx.globalAlpha = clamp(alpha, 0, 1);
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = 24;
  trazarRectRedondeado(ctx, x, y, anchoImg, altoImg, 18);
  ctx.save();
  ctx.clip();
  ctx.drawImage(img, x, y, anchoImg, altoImg);
  ctx.restore();
  ctx.restore();
}

// Logo + "LEGIÓN ROLLER" + ciudad -- sobre el fondo de marca ya dibujado.
// Si el logo no cargó, fallback de SOLO texto (nunca aborta el video).
// Misma paleta/escala tipográfica que los paneles de Fase 5 para que se
// sienta parte del mismo sistema visual, no una pantalla aparte como V1.
export function dibujarCierreLogoV2(ctx: CanvasRenderingContext2D, logoImg: HTMLImageElement | null, ciudad: string | undefined, alpha: number): void {
  const cx = ANCHO_VIDEO / 2;
  const cy = ALTO_VIDEO / 2 - 60;
  const tamanoLogo = 300;

  ctx.save();
  ctx.globalAlpha = clamp(alpha, 0, 1);

  if (logoImg) {
    const escalaContain = Math.min(tamanoLogo / logoImg.naturalWidth, tamanoLogo / logoImg.naturalHeight);
    const anchoImg = logoImg.naturalWidth * escalaContain;
    const altoImg = logoImg.naturalHeight * escalaContain;
    ctx.drawImage(logoImg, cx - anchoImg / 2, cy - altoImg / 2, anchoImg, altoImg);
  }

  ctx.textAlign = "center";
  ctx.shadowColor = "rgba(0,0,0,0.8)";
  ctx.shadowBlur = 6;
  ctx.fillStyle = COLOR_DORADO;
  ctx.font = "800 32px Arial, sans-serif";
  ctx.fillText("LEGIÓN ROLLER", cx, cy + tamanoLogo / 2 + 50);

  if (ciudad) {
    ctx.fillStyle = COLOR_TEXTO_SECUNDARIO;
    ctx.font = "700 22px Arial, sans-serif";
    ctx.fillText(ciudad, cx, cy + tamanoLogo / 2 + 84);
  }
  ctx.restore();
}
