// EXIF Orientation (tag 0x0112): algunas fotos tomadas con la app de cámara
// nativa del celular en horizontal no rotan los píxeles en el momento, sino
// que graban esta bandera (1-8) para que quien la muestre la rote/espeje.
// El navegador/WebView no siempre la respeta de forma consistente (varía
// entre Android/motor), y ahí aparece la foto girada en la previsualización.
// Para no depender de eso, se lee el tag a mano y se "hornea" la rotación
// correcta en un canvas una sola vez, apenas se elige el archivo.

// Recorre los segmentos del JPEG buscando APP1/Exif y el tag de orientación
// dentro del IFD0. Devuelve 1 (normal) si no es JPEG, no trae Exif, o no
// tiene el tag -- nunca lanza, para que el llamador pueda seguir con el
// archivo original ante cualquier formato inesperado. Exportada para que
// comprimirFotoChat (comprimirImagen.ts) la reutilice en su propia pasada de
// canvas en vez de duplicar el parseo.
export function leerOrientacionExif(buffer: ArrayBuffer): number {
  const vista = new DataView(buffer);
  if (vista.byteLength < 4 || vista.getUint16(0, false) !== 0xffd8) return 1;

  let offset = 2;
  while (offset < vista.byteLength - 1) {
    const marcador = vista.getUint16(offset, false);
    offset += 2;

    if (marcador === 0xffe1) {
      // Segmento APP1: [largo(2)] ["Exif\0\0"(6)] [TIFF header...]
      if (vista.getUint32(offset + 2, false) !== 0x45786966) return 1;
      const inicioTiff = offset + 8;
      const little = vista.getUint16(inicioTiff, false) === 0x4949; // "II"
      const offsetIfd0 = vista.getUint32(inicioTiff + 4, little);
      let cursor = inicioTiff + offsetIfd0;
      const numEntradas = vista.getUint16(cursor, little);
      cursor += 2;
      for (let i = 0; i < numEntradas; i++) {
        const entrada = cursor + i * 12;
        if (vista.getUint16(entrada, little) === 0x0112) {
          return vista.getUint16(entrada + 8, little);
        }
      }
      return 1;
    }

    if ((marcador & 0xff00) !== 0xff00) break; // ya no hay más marcadores válidos
    offset += vista.getUint16(offset, false);
  }
  return 1;
}

// Para orientación 5-8 la imagen queda "de lado" (transpuesta): el lienzo de
// destino debe tener ancho/alto invertidos respecto al original.
export function dimensionesTransformadas(
  orientacion: number,
  ancho: number,
  alto: number,
): { ancho: number; alto: number } {
  return orientacion >= 5 && orientacion <= 8 ? { ancho: alto, alto: ancho } : { ancho, alto };
}

// Matriz de transformación estándar por cada valor de Orientation (1 no
// necesita nada). `ancho`/`alto` son las dimensiones ORIGINALES de la
// imagen (antes de invertir), tal como espera cada fórmula.
export function aplicarTransformCanvas(
  ctx: CanvasRenderingContext2D,
  orientacion: number,
  ancho: number,
  alto: number,
) {
  switch (orientacion) {
    case 2:
      ctx.transform(-1, 0, 0, 1, ancho, 0);
      break;
    case 3:
      ctx.transform(-1, 0, 0, -1, ancho, alto);
      break;
    case 4:
      ctx.transform(1, 0, 0, -1, 0, alto);
      break;
    case 5:
      ctx.transform(0, 1, 1, 0, 0, 0);
      break;
    case 6:
      ctx.transform(0, 1, -1, 0, alto, 0);
      break;
    case 7:
      ctx.transform(0, -1, -1, 0, alto, ancho);
      break;
    case 8:
      ctx.transform(0, -1, 1, 0, 0, ancho);
      break;
    default:
      break;
  }
}

// Corrige la orientación de un archivo de imagen "horneando" la rotación en
// un canvas, y devuelve un nuevo File ya derecho. Si la imagen ya está
// normal (orientación 1) o no se puede leer/procesar, devuelve el mismo
// archivo sin tocar -- nunca bloquea el flujo de elegir/tomar una foto.
export async function normalizarOrientacionFoto(archivo: File): Promise<File> {
  if (!archivo.type.startsWith("image/")) return archivo;

  let orientacion = 1;
  try {
    orientacion = leerOrientacionExif(await archivo.arrayBuffer());
  } catch {
    return archivo;
  }
  if (orientacion <= 1) return archivo;

  return new Promise((resolve) => {
    const url = URL.createObjectURL(archivo);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const { ancho, alto } = dimensionesTransformadas(orientacion, img.naturalWidth, img.naturalHeight);
      const canvas = document.createElement("canvas");
      canvas.width = ancho;
      canvas.height = alto;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(archivo);
        return;
      }
      aplicarTransformCanvas(ctx, orientacion, img.naturalWidth, img.naturalHeight);
      ctx.drawImage(img, 0, 0);
      canvas.toBlob(
        (blob) => resolve(blob ? new File([blob], archivo.name, { type: "image/jpeg" }) : archivo),
        "image/jpeg",
        0.92,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(archivo);
    };
    img.src = url;
  });
}
