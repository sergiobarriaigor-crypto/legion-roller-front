// Compresión genérica para fotos de chat: a diferencia de
// prepararFotoHistoria (FiltrosFoto.tsx), acá NO se recorta a un lienzo fijo
// (la foto de chat debe verse completa, sin perder bordes) — solo se limita
// el lado más largo a ANCHO_MAX_FOTO_CHAT y se reencoda a JPEG, para que una
// foto de cámara de 12MP+ no viaje entera por la red en cada envío.
const LADO_MAX_FOTO_CHAT = 1600;
const CALIDAD_FOTO_CHAT = 0.82;

export function comprimirFotoChat(archivo: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(archivo);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      // Nunca se agranda una foto más chica que el límite, solo se achica.
      const escala = Math.min(
        1,
        LADO_MAX_FOTO_CHAT / img.naturalWidth,
        LADO_MAX_FOTO_CHAT / img.naturalHeight,
      );
      const ancho = Math.round(img.naturalWidth * escala);
      const alto = Math.round(img.naturalHeight * escala);
      const canvas = document.createElement("canvas");
      canvas.width = ancho;
      canvas.height = alto;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("No se pudo procesar la imagen"));
        return;
      }
      ctx.drawImage(img, 0, 0, ancho, alto);
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
