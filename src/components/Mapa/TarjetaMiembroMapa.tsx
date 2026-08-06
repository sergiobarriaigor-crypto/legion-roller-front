"use client";

import { IconMessage2, IconHeartHandshake } from "@tabler/icons-react";
import { tiempoTranscurrido } from "@/lib/tiempo";

// Tipo y tarjeta de "otro patinador" compartidos entre el mapa Leaflet
// (MapaView.tsx: Popup individual y lista de cluster) y el mapa 3D
// (Mapa3D.tsx: Popup de MapLibre) -- viven en su propio archivo para que
// ninguno de los dos componentes de mapa tenga que importar del otro.
export interface OtroMiembro {
  miembroId: number;
  nombre: string;
  fotoUrl: string | null;
  estado: string | null;
  lat: number;
  lon: number;
  modo: string;
  iniciadoEn: string;
}

// Contenido de la tarjeta de otro patinador (mensaje directo / reconocimiento
// breve). El formulario de reconocimiento se abre en un modal aparte, no acá
// -- un Popup se puede cerrar solo por gestos del mapa (clic fuera,
// reposicionamiento al abrirse el teclado en el celular, etc.), lo que hacía
// que el formulario desapareciera a mitad de escribir/enviar.
export function ContenidoPopupMiembro({
  miembro,
  onAbrirChat,
  onAbrirReconocimiento,
  fondo = "bg-surface-1",
}: {
  miembro: OtroMiembro;
  onAbrirChat: (miembro: OtroMiembro) => void;
  onAbrirReconocimiento: (miembro: OtroMiembro) => void;
  fondo?: string;
}) {
  return (
    <div className={`flex items-center gap-2.5 rounded-full border border-border ${fondo} py-2 pr-2.5 pl-3`}>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-text-primary">{miembro.nombre}</p>
        <p className="text-[10px] text-text-secondary">{tiempoTranscurrido(miembro.iniciadoEn)}</p>
      </div>
      <div className="h-8 w-px shrink-0 bg-border" />
      <div className="flex shrink-0 gap-0.5">
        <button
          type="button"
          aria-label="Enviar mensaje"
          onClick={() => onAbrirChat(miembro)}
          className="flex h-8 w-8 items-center justify-center rounded-full text-amber-text active:bg-amber-bg"
        >
          <IconMessage2 size={17} />
        </button>
        <button
          type="button"
          aria-label="Enviar reconocimiento"
          onClick={() => onAbrirReconocimiento(miembro)}
          className="flex h-8 w-8 items-center justify-center rounded-full text-amber-text active:bg-amber-bg"
        >
          <IconHeartHandshake size={17} />
        </button>
      </div>
    </div>
  );
}
