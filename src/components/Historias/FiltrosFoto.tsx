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

// Dibuja la imagen en un lienzo 1080x1920 con el filtro CSS "quemado" y
// devuelve el resultado como Blob JPEG. La foto se escala para CUBRIR todo
// el lienzo (recortando lo que sobre por los costados o arriba/abajo según
// corresponda) en vez de dejar franjas negras cuando la relación de aspecto
// original no es exactamente 9:16 — mismo criterio que Instagram/TikTok:
// nunca queda con bordes negros, aunque signifique perder un poco de borde.
export function prepararFotoHistoria(url: string, filtroCss: string): Promise<Blob> {
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

      const escala = Math.max(ANCHO_HISTORIA / img.naturalWidth, ALTO_HISTORIA / img.naturalHeight);
      const anchoDestino = img.naturalWidth * escala;
      const altoDestino = img.naturalHeight * escala;
      const x = (ANCHO_HISTORIA - anchoDestino) / 2;
      const y = (ALTO_HISTORIA - altoDestino) / 2;

      ctx.filter = filtroCss;
      ctx.drawImage(img, x, y, anchoDestino, altoDestino);
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
