"use client";

export interface FiltroFoto {
  id: string;
  nombre: string;
  css: string;
}

// Filtros preestablecidos tipo Instagram, aplicados con CSS `filter` (mismo
// valor usado en vivo sobre la vista previa y luego "horneado" en la imagen
// final vía canvas antes de subirla, con prepararFotoHistoria).
export const FILTROS_FOTO: FiltroFoto[] = [
  { id: "normal", nombre: "Normal", css: "none" },
  { id: "bn", nombre: "B&N", css: "grayscale(1)" },
  { id: "calido", nombre: "Cálido", css: "sepia(0.35) saturate(1.4) brightness(1.05)" },
  { id: "frio", nombre: "Frío", css: "saturate(1.2) hue-rotate(-8deg) contrast(1.05)" },
  { id: "contraste", nombre: "Contraste", css: "contrast(1.35) saturate(1.15)" },
  { id: "vintage", nombre: "Vintage", css: "sepia(0.4) contrast(0.9) brightness(1.1) saturate(0.85)" },
];

// Resolución/relación de aspecto recomendada para historias (igual que
// Instagram): 1080x1920, 9:16, pantalla completa vertical. Exportadas para
// que CamaraHistoria pida esta misma resolución al iniciar la cámara.
export const ANCHO_HISTORIA = 1080;
export const ALTO_HISTORIA = 1920;

// Encuadre libre elegido por el usuario sobre la foto (mover/pellizcar en
// EditorHistoria.tsx) — panFrac es una fracción del ancho/alto del lienzo
// (no píxeles), así el mismo valor sirve tanto para la vista previa en vivo
// (tamaño de contenedor variable) como para este lienzo fijo de publicación.
// Los valores por defecto reproducen el comportamiento de siempre (cover
// centrado, sin mover ni hacer zoom).
//
// modo "cubrir": la foto llena todo el lienzo sin bordes negros, recortando
// lo que sobre (comportamiento de siempre, con zoom/pan del usuario).
// modo "ajustar": la foto se ve COMPLETA, sin recortar nada -- para fotos
// horizontales que perderían mucho contenido en "cubrir". El espacio libre
// arriba/abajo (o a los costados) se rellena con la misma foto de fondo,
// agrandada y difuminada, en vez de dejarlo negro liso (igual que Instagram).
export interface EncuadreFoto {
  modo: "cubrir" | "ajustar";
  zoom: number;
  panFrac: { x: number; y: number };
}

const ENCUADRE_DEFECTO: EncuadreFoto = { modo: "cubrir", zoom: 1, panFrac: { x: 0, y: 0 } };

// Filtro combinado del fondo en modo "ajustar": el filtro de color elegido +
// desenfoque + oscurecido, para que el primer plano (la foto completa, nítida)
// resalte por encima. Se reutiliza igual en la vista previa en vivo
// (EditorHistoria.tsx) y acá al exportar, para que quede igual a lo que se vio.
export function filtroFondoAjustar(filtroCss: string): string {
  const base = filtroCss === "none" ? "" : filtroCss;
  return `${base} blur(25px) brightness(0.55)`.trim();
}

// Dibuja la imagen en un lienzo 1080x1920 con el filtro CSS "quemado" y
// devuelve el resultado como Blob JPEG. Ver EncuadreFoto arriba para la
// diferencia entre "cubrir" (de siempre, con zoom/pan) y "ajustar" (foto
// completa sin recortar, con fondo difuminado).
export function prepararFotoHistoria(
  url: string,
  filtroCss: string,
  encuadre: EncuadreFoto = ENCUADRE_DEFECTO,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = ANCHO_HISTORIA;
      canvas.height = ALTO_HISTORIA;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("No se pudo procesar la imagen"));
        return;
      }

      if (encuadre.modo === "ajustar") {
        const escalaFondo = Math.max(ANCHO_HISTORIA / img.naturalWidth, ALTO_HISTORIA / img.naturalHeight);
        const anchoFondo = img.naturalWidth * escalaFondo;
        const altoFondo = img.naturalHeight * escalaFondo;
        ctx.filter = filtroFondoAjustar(filtroCss);
        ctx.drawImage(
          img,
          (ANCHO_HISTORIA - anchoFondo) / 2,
          (ALTO_HISTORIA - altoFondo) / 2,
          anchoFondo,
          altoFondo,
        );

        const escala = Math.min(ANCHO_HISTORIA / img.naturalWidth, ALTO_HISTORIA / img.naturalHeight);
        const ancho = img.naturalWidth * escala;
        const alto = img.naturalHeight * escala;
        ctx.filter = filtroCss;
        ctx.drawImage(img, (ANCHO_HISTORIA - ancho) / 2, (ALTO_HISTORIA - alto) / 2, ancho, alto);
      } else {
        const baseScale = Math.max(ANCHO_HISTORIA / img.naturalWidth, ALTO_HISTORIA / img.naturalHeight);
        const escala = baseScale * encuadre.zoom;
        const anchoDestino = img.naturalWidth * escala;
        const altoDestino = img.naturalHeight * escala;
        const x = (ANCHO_HISTORIA - anchoDestino) / 2 + encuadre.panFrac.x * ANCHO_HISTORIA;
        const y = (ALTO_HISTORIA - altoDestino) / 2 + encuadre.panFrac.y * ALTO_HISTORIA;

        ctx.filter = filtroCss;
        ctx.drawImage(img, x, y, anchoDestino, altoDestino);
      }

      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("No se pudo generar la imagen"))),
        "image/jpeg",
        0.9,
      );
    };
    img.onerror = () => reject(new Error("No se pudo cargar la imagen"));
    img.src = url;
  });
}

export function FiltrosFoto({
  previewUrl,
  filtroActual,
  onCambiar,
}: {
  previewUrl: string;
  filtroActual: FiltroFoto;
  onCambiar: (filtro: FiltroFoto) => void;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto px-0.5 pb-0.5" data-no-swipe>
      {FILTROS_FOTO.map((f) => (
        <button
          key={f.id}
          type="button"
          onClick={() => onCambiar(f)}
          className="flex shrink-0 flex-col items-center gap-1"
        >
          <span
            className={`block h-14 w-14 rounded-app border-2 bg-cover bg-center ${
              filtroActual.id === f.id ? "border-text-accent" : "border-transparent"
            }`}
            style={{ backgroundImage: `url(${previewUrl})`, filter: f.css }}
          />
          <span
            className={`text-[11px] ${filtroActual.id === f.id ? "text-text-accent" : "text-text-secondary"}`}
          >
            {f.nombre}
          </span>
        </button>
      ))}
    </div>
  );
}
