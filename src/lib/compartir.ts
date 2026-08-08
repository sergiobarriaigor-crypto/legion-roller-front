import { Capacitor } from "@capacitor/core";
import { compartirArchivoNativo } from "./compartirNativo";

// Comparte un archivo (imagen/video) o un texto simple con el selector nativo
// del sistema, agregando siempre el link de vuelta a la app -- así quien lo
// recibe por WhatsApp/redes puede tocarlo y entrar directo al contenido
// (post, ficha de Impulsa o historia). Se manda tanto en `url` como al final
// de `text`, porque el soporte de `url` junto a `files` no es parejo entre
// apps del selector nativo, pero el texto (con el link adentro) sí se
// respeta casi siempre y WhatsApp lo vuelve tocable solo.
export async function compartirConLink(
  titulo: string,
  texto: string,
  link: string,
  archivo?: File,
): Promise<void> {
  const textoConLink = `${texto}\n\n${link}`;

  // En la app nativa (Capacitor), la Web Share API y el fallback de descarga
  // de más abajo fallan en silencio -- ver compartirNativo.ts para el porqué.
  if (archivo && Capacitor.isNativePlatform()) {
    await compartirArchivoNativo(archivo, { titulo, texto: textoConLink });
    return;
  }

  if (
    archivo &&
    typeof navigator.share === "function" &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [archivo] })
  ) {
    await navigator.share({ files: [archivo], title: titulo, text: textoConLink, url: link });
    return;
  }

  if (typeof navigator.share === "function") {
    await navigator.share({ title: titulo, text: textoConLink, url: link });
    return;
  }

  // Sin Web Share (ej. escritorio): al menos descarga el archivo para que el
  // usuario lo comparta a mano; sin archivo no hay nada más que hacer acá.
  if (archivo) {
    const enlace = document.createElement("a");
    enlace.href = URL.createObjectURL(archivo);
    enlace.download = archivo.name;
    enlace.click();
    URL.revokeObjectURL(enlace.href);
  }
}
