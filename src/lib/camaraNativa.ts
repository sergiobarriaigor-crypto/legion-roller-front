import { Capacitor } from "@capacitor/core";
import { Camera, MediaTypeSelection, type MediaResult } from "@capacitor/camera";

// Reemplaza el <input type="file" capture> por la cámara nativa dentro de
// la app empaquetada con Capacitor. No es solo estético: los inputs de
// archivo con "capture" dentro de un WebView de Android tienen fallas
// conocidas y bien documentadas (el archivo capturado a veces no vuelve al
// input, por restricciones de FileProvider/almacenamiento con ámbito) --
// @capacitor/camera evita ese problema por completo. En la web (navegador
// normal) esto no se usa: ImageUploadCrop sigue con los inputs de archivo
// de siempre.
async function mediaResultAFile(resultado: MediaResult, nombre: string): Promise<File | null> {
  if (!resultado.webPath) return null;
  const respuesta = await fetch(resultado.webPath);
  const blob = await respuesta.blob();
  return new File([blob], nombre, { type: blob.type || "image/jpeg" });
}

export async function tomarFotoNativa(): Promise<File | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const resultado = await Camera.takePhoto({
      quality: 90,
      correctOrientation: true,
      saveToGallery: false,
    });
    return await mediaResultAFile(resultado, `foto-${Date.now()}.jpg`);
  } catch {
    // El usuario canceló o negó el permiso de cámara -- no es un error real.
    return null;
  }
}

export async function elegirDeGaleriaNativa(): Promise<File | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const { results } = await Camera.chooseFromGallery({ allowMultipleSelection: false });
    const primero = results[0];
    if (!primero) return null;
    return await mediaResultAFile(primero, `foto-${Date.now()}.jpg`);
  } catch {
    return null;
  }
}

// Selección múltiple nativa -- usada por las secciones que ya permiten
// elegir varias fotos de una vez con su propio máximo (post/page.tsx,
// impulsa/page.tsx, GaleriaPerfil.tsx). `limite` son SIEMPRE los cupos
// restantes de quien llama, nunca un valor fijo -- en Android 13+/iOS esto
// bloquea la selección dentro de la propia pantalla del picker; en
// versiones donde el sistema ignora `limit`, quien llama debe igual
// recortar el resultado como respaldo (mismo criterio ya usado en
// CompartirRecorridoModal.tsx). Mismo criterio de errores que
// elegirDeGaleriaNativa: cancelar o fallar se traga en silencio, sin
// distinguir por texto de mensaje.
export async function elegirVariasDeGaleriaNativa(limite: number): Promise<File[]> {
  if (!Capacitor.isNativePlatform() || limite <= 0) return [];
  try {
    const { results } = await Camera.chooseFromGallery({
      mediaType: MediaTypeSelection.Photo,
      allowMultipleSelection: true,
      limit: limite,
    });
    const archivos = await Promise.all(
      results.map((resultado, i) => mediaResultAFile(resultado, `foto-${Date.now()}-${i}.jpg`)),
    );
    return archivos.filter((archivo): archivo is File => archivo !== null);
  } catch {
    return [];
  }
}
