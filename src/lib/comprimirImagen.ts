import { aplicarTransformCanvas, dimensionesTransformadas, leerOrientacionExif } from "@/lib/orientacionFoto";

// Compresión genérica para fotos de chat: a diferencia de
// prepararFotoHistoria (FiltrosFoto.tsx), acá NO se recorta a un lienzo fijo
// (la foto de chat debe verse completa, sin perder bordes) — solo se limita
// el lado más largo a ANCHO_MAX_FOTO_CHAT y se reencoda a JPEG, para que una
// foto de cámara de 12MP+ no viaje entera por la red en cada envío. De paso,
// se corrige acá mismo (en la misma pasada de canvas, sin duplicar el
// reencode) la orientación EXIF de fotos que vengan de la cámara nativa del
// celular con el teléfono sostenido en horizontal (ver orientacionFoto.ts) —
// "Captura Express" (canvas propio) no la necesita, ya viene derecha.
const LADO_MAX_FOTO_CHAT = 1600;
const CALIDAD_FOTO_CHAT = 0.82;

export async function comprimirFotoChat(archivo: File): Promise<Blob> {
  let orientacion = 1;
  try {
    orientacion = leerOrientacionExif(await archivo.arrayBuffer());
  } catch {
    // sigue con orientación normal si el archivo no se puede leer
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(archivo);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      // Nunca se agranda una foto más chica que el límite, solo se achica
      // (medido sobre las dimensiones ya corregidas por orientación).
      const { ancho: anchoOriginal, alto: altoOriginal } = dimensionesTransformadas(
        orientacion,
        img.naturalWidth,
        img.naturalHeight,
      );
      const escala = Math.min(1, LADO_MAX_FOTO_CHAT / anchoOriginal, LADO_MAX_FOTO_CHAT / altoOriginal);
      const ancho = Math.round(anchoOriginal * escala);
      const alto = Math.round(altoOriginal * escala);
      const canvas = document.createElement("canvas");
      canvas.width = ancho;
      canvas.height = alto;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("No se pudo procesar la imagen"));
        return;
      }
      ctx.scale(escala, escala);
      aplicarTransformCanvas(ctx, orientacion, img.naturalWidth, img.naturalHeight);
      ctx.drawImage(img, 0, 0);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("No se pudo comprimir la imagen"))),
        "image/jpeg",
        CALIDAD_FOTO_CHAT,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("No se pudo leer la imagen"));
    };
    img.src = url;
  });
}
