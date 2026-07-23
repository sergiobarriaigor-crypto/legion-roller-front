// Algunas fotos ya guardadas quedaron con el protocolo "http://" (bug de
// backend con el proxy de Railway, ya corregido para las subidas nuevas —
// ver main.ts). Un fetch() a http:// desde esta página https:// es
// "contenido mixto" y el navegador lo bloquea en silencio (a diferencia de
// un <img>, que sí lo tolera) — de ahí que "Compartir" no hiciera nada. Se
// sube a https acá mismo para que las fotos viejas también funcionen sin
// esperar a que se vuelvan a subir.
export function forzarHttps(ruta: string): string {
  return ruta.startsWith("http://") ? "https://" + ruta.slice("http://".length) : ruta;
}

// Convierte una imagen (propia o remota) a data URL vía fetch + FileReader —
// así se puede incrustar dentro de un SVG con <image href="..."> sin "manchar"
// el canvas al rasterizarlo (el clásico "canvas tainted by cross-origin
// data" que aparecería si se dibujara la imagen remota directo con <img>).
// Compartido entre tarjetaRecorrido.ts y tarjetaPost.ts.
export function cargarImagenComoDataUrl(ruta: string): Promise<string | null> {
  return fetch(forzarHttps(ruta))
    .then((res) => (res.ok ? res.blob() : Promise.reject(new Error("no encontrada: " + ruta))))
    .then(
      (blob) =>
        new Promise<string | null>((resolve) => {
          const lector = new FileReader();
          lector.onload = () => resolve(typeof lector.result === "string" ? lector.result : null);
          lector.onerror = () => resolve(null);
          lector.readAsDataURL(blob);
        }),
    )
    .catch(() => null);
}
