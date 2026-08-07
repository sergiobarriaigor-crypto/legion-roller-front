import { Capacitor } from "@capacitor/core";
import { Camera, type MediaResult } from "@capacitor/camera";

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
