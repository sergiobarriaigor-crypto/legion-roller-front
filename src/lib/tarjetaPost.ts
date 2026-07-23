import { cargarImagenComoDataUrl } from "./imagenDataUrl";

export interface DatosTarjetaPost {
  imagenUrl: string;
  titulo: string;
  resena: string;
}

const ANCHO = 1080;
const ALTO_IMG = 1080;
// La tarjeta se dibuja con estas medidas "lógicas", pero se exporta al doble
// de resolución física para que no se vea pixelada en pantallas retina/alta
// densidad (mismo criterio que tarjetaRecorrido.ts).
const ESCALA = 2;

const PADDING = 56;
const PADDING_INFERIOR = 48;
const DORADO = "#e7c168";
const DORADO_BORDE = "#c99a3d";
const GRIS_TEXTO = "#b8ada0";
const TEXTO_BASE = "#f2ead8";
const FONDO_CARD = "#0b121c";

const TITULO_FONT = 52;
const TITULO_ALTO = 64;
const RESENA_FONT = 36;
const RESENA_ALTO = 50;
const GAP_TITULO_RESENA = 24;
const GAP_RESENA_FOOTER = 32;
const LOGO_TAM = 72;
const FOOTER_ALTO = LOGO_TAM;

function escapeXml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Envuelve el texto a un ancho máximo (medido con la misma tipografía que
// después se dibuja en el SVG) — no hay wrap nativo en SVG, hay que armar
// las líneas a mano antes de generarlo. Sin límite de líneas: la tarjeta
// nunca trunca texto con "…", crece en alto lo que haga falta (ver
// generarTarjetaCompartirPost) para mostrar el título y la reseña completos.
function envolverTexto(ctx: CanvasRenderingContext2D, texto: string, maxAncho: number): string[] {
  const palabras = texto.split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return [];

  const lineas: string[] = [];
  let actual = "";

  for (const palabra of palabras) {
    const prueba = actual ? `${actual} ${palabra}` : palabra;
    if (ctx.measureText(prueba).width <= maxAncho || !actual) {
      actual = prueba;
      continue;
    }
    lineas.push(actual);
    actual = palabra;
  }
  lineas.push(actual);

  return lineas;
}

function tspansEnvueltos(lineas: string[], x: number, lineAlto: number): string {
  return lineas
    .map((linea, i) => `<tspan x="${x}"${i === 0 ? "" : ` dy="${lineAlto}"`}>${escapeXml(linea)}</tspan>`)
    .join("");
}

// Genera la vista previa que se comparte junto con la publicación (imagen +
// título + descripción + logo de Legión Roller) — así el destinatario ve de
// qué trata sin depender de que la red social muestre el texto del `share`
// nativo por separado (WhatsApp/Telegram/Discord suelen priorizar la imagen).
export async function generarTarjetaCompartirPost(datos: DatosTarjetaPost): Promise<Blob> {
  const [logoDataUrl, fotoDataUrl] = await Promise.all([
    cargarImagenComoDataUrl("/logo-legion-roller-mini.png"),
    cargarImagenComoDataUrl(datos.imagenUrl),
  ]);
  if (!fotoDataUrl) throw new Error("No se pudo cargar la imagen de la publicación");

  const anchoTexto = ANCHO - PADDING * 2;
  const medidor = document.createElement("canvas").getContext("2d");
  if (!medidor) throw new Error("No se pudo generar la imagen");

  medidor.font = `800 ${TITULO_FONT}px Arial, sans-serif`;
  const lineasTitulo = envolverTexto(medidor, datos.titulo.trim(), anchoTexto);

  medidor.font = `400 ${RESENA_FONT}px Arial, sans-serif`;
  const resena = datos.resena.trim();
  const lineasResena = resena ? envolverTexto(medidor, resena, anchoTexto) : [];

  const altoTitulo = lineasTitulo.length * TITULO_ALTO;
  const altoResena = lineasResena.length * RESENA_ALTO;
  const altoPanel =
    PADDING +
    altoTitulo +
    (lineasResena.length > 0 ? GAP_TITULO_RESENA + altoResena : 0) +
    GAP_RESENA_FOOTER +
    FOOTER_ALTO +
    PADDING_INFERIOR;
  const alto = ALTO_IMG + altoPanel;

  // Cursor vertical simple: cada bloque se posiciona a partir del borde
  // inferior del anterior, sumando su propio "offset" de línea base (los
  // ~44/30px son la distancia típica entre el techo de una línea y su
  // línea base para estos tamaños de fuente) — evita acumular restas.
  let cursorY = ALTO_IMG + PADDING;

  const tituloBaselineY = cursorY + 44;
  const tituloSvg = `<text x="${PADDING}" y="${tituloBaselineY}" font-family="Arial, sans-serif" font-size="${TITULO_FONT}" font-weight="800" fill="${DORADO}">${tspansEnvueltos(lineasTitulo, PADDING, TITULO_ALTO)}</text>`;
  cursorY += altoTitulo;

  let resenaSvg = "";
  if (lineasResena.length > 0) {
    cursorY += GAP_TITULO_RESENA;
    const resenaBaselineY = cursorY + 30;
    resenaSvg = `<text x="${PADDING}" y="${resenaBaselineY}" font-family="Arial, sans-serif" font-size="${RESENA_FONT}" font-weight="400" fill="${GRIS_TEXTO}">${tspansEnvueltos(lineasResena, PADDING, RESENA_ALTO)}</text>`;
    cursorY += altoResena;
  }

  cursorY += GAP_RESENA_FOOTER;
  const footerY = cursorY;
  const marcaSvg = logoDataUrl
    ? `<image href="${logoDataUrl}" x="${PADDING}" y="${footerY}" width="${LOGO_TAM}" height="${LOGO_TAM}"/>
       <text x="${PADDING + LOGO_TAM + 18}" y="${footerY + LOGO_TAM / 2 + 10}" font-family="Arial, sans-serif" font-size="30" font-weight="700" letter-spacing="1" fill="${TEXTO_BASE}">LEGIÓN ROLLER</text>`
    : `<text x="${PADDING}" y="${footerY + LOGO_TAM / 2 + 10}" font-family="Arial, sans-serif" font-size="30" font-weight="800" letter-spacing="1" fill="${DORADO}">LEGIÓN ROLLER</text>`;

  const svg = `
    <svg width="${ANCHO * ESCALA}" height="${alto * ESCALA}" viewBox="0 0 ${ANCHO} ${alto}" xmlns="http://www.w3.org/2000/svg">
      <clipPath id="marcoTarjetaPost">
        <rect width="${ANCHO}" height="${alto}" rx="26"/>
      </clipPath>
      <g clip-path="url(#marcoTarjetaPost)">
        <rect width="${ANCHO}" height="${alto}" fill="${FONDO_CARD}"/>
        <image href="${fotoDataUrl}" x="0" y="0" width="${ANCHO}" height="${ALTO_IMG}" preserveAspectRatio="xMidYMid meet"/>
      </g>
      <rect x="0" y="${ALTO_IMG - 1}" width="${ANCHO}" height="2" fill="${DORADO_BORDE}" opacity="0.6"/>
      <rect x="14" y="14" width="${ANCHO - 28}" height="${alto - 28}" rx="26" fill="none" stroke="${DORADO_BORDE}" stroke-width="2" opacity="0.7"/>

      ${tituloSvg}
      ${resenaSvg}
      ${marcaSvg}
    </svg>
  `;
  const svgDataUrl = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = ANCHO * ESCALA;
      canvas.height = alto * ESCALA;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("No se pudo generar la imagen"));
        return;
      }
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("No se pudo generar la imagen"));
      }, "image/jpeg", 0.92);
    };
    img.onerror = () => reject(new Error("No se pudo generar la imagen"));
    img.src = svgDataUrl;
  });
}
