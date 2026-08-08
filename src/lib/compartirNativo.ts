// El selector "Compartir" de la app nativa (Android, vía Capacitor) NO usa
// el mismo camino que la web: la Web Share API para archivos (navigator.share
// con `files`) y el fallback de descarga (<a download> con blob: URL) dependen
// de comportamiento del navegador que el WebView embebido de Capacitor no
// replica -- ahí ambos fallan en silencio (sin lanzar error, sin abrir nada),
// que es justo el bug reportado ("no genera ninguna función" al tocar
// Compartir, tanto para imagen como video y 3D). La solución real en apps
// Capacitor es no depender del navegador para esto: escribir el archivo a
// disco con @capacitor/filesystem y compartirlo con el plugin nativo
// @capacitor/share, que sí abre la hoja de compartir real de Android.
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

function blobABase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => {
      const resultado = lector.result;
      if (typeof resultado !== "string") {
        reject(new Error("no se pudo leer el archivo"));
        return;
      }
      // readAsDataURL da "data:<mime>;base64,AAAA..." -- Filesystem.writeFile
      // solo quiere la parte de datos, sin el prefijo.
      resolve(resultado.slice(resultado.indexOf(",") + 1));
    };
    lector.onerror = () => reject(new Error("no se pudo leer el archivo"));
    lector.readAsDataURL(blob);
  });
}

export async function compartirArchivoNativo(
  archivo: File,
  opciones: { titulo?: string; texto?: string },
): Promise<void> {
  const base64 = await blobABase64(archivo);
  const escrito = await Filesystem.writeFile({
    path: archivo.name,
    data: base64,
    directory: Directory.Cache,
  });
  await Share.share({
    title: opciones.titulo,
    text: opciones.texto,
    url: escrito.uri,
    dialogTitle: opciones.titulo,
  });
}
