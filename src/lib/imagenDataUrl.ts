// Convierte una imagen (propia o remota) a data URL vía fetch + FileReader —
// así se puede incrustar dentro de un SVG con <image href="..."> sin "manchar"
// el canvas al rasterizarlo (el clásico "canvas tainted by cross-origin
// data" que aparecería si se dibujara la imagen remota directo con <img>).
// Compartido entre tarjetaRecorrido.ts y tarjetaPost.ts.
export function cargarImagenComoDataUrl(ruta: string): Promise<string | null> {
  return fetch(ruta)
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
