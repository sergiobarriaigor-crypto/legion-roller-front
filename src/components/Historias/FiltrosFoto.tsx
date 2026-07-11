"use client";

export interface FiltroFoto {
  id: string;
  nombre: string;
  css: string;
}

// Filtros preestablecidos tipo Instagram, aplicados con CSS `filter` (mismo
// valor usado en vivo sobre la vista previa y luego "horneado" en la imagen
// final vía canvas antes de subirla, con aplicarFiltroABlob).
export const FILTROS_FOTO: FiltroFoto[] = [
  { id: "normal", nombre: "Normal", css: "none" },
  { id: "bn", nombre: "B&N", css: "grayscale(1)" },
  { id: "calido", nombre: "Cálido", css: "sepia(0.35) saturate(1.4) brightness(1.05)" },
  { id: "frio", nombre: "Frío", css: "saturate(1.2) hue-rotate(-8deg) contrast(1.05)" },
  { id: "contraste", nombre: "Contraste", css: "contrast(1.35) saturate(1.15)" },
  { id: "vintage", nombre: "Vintage", css: "sepia(0.4) contrast(0.9) brightness(1.1) saturate(0.85)" },
];

// Dibuja la imagen en un canvas con el filtro CSS aplicado y devuelve el
// resultado como Blob JPEG — así el filtro queda "quemado" en la foto que se
// sube, no depende de que quien la vea también renderice CSS.
export function aplicarFiltroABlob(url: string, filtroCss: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("No se pudo procesar la imagen"));
        return;
      }
      ctx.filter = filtroCss;
      ctx.drawImage(img, 0, 0);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("No se pudo generar la imagen filtrada"))),
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
