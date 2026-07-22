"use client";

import dynamic from "next/dynamic";
import { IconX } from "@tabler/icons-react";
import { Theme } from "emoji-picker-react";
import type { EmojiClickData } from "emoji-picker-react";

const EmojiPicker = dynamic(() => import("emoji-picker-react"), { ssr: false });

// Selector de emoji completo (no un set fijo), abierto desde el menú de
// mensaje. Reutiliza el mismo patrón de hoja inferior que el resto del chat.
export function SelectorEmojiMensaje({
  onElegir,
  onCerrar,
}: {
  onElegir: (emoji: string) => void;
  onCerrar: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50" data-no-swipe>
      <div className="absolute inset-0 bg-black/75" onClick={onCerrar} aria-hidden />
      <div className="absolute inset-x-0 bottom-0 flex max-h-[70%] flex-col items-center rounded-t-2xl bg-surface-2 pb-4 shadow-[0_-8px_30px_rgba(0,0,0,0.5)]">
        <div className="flex w-full items-center justify-between px-3 pb-1 pt-2">
          <span className="w-5" />
          <span className="h-1 w-10 rounded-full bg-white/20" />
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="text-text-secondary">
            <IconX size={20} />
          </button>
        </div>
        <EmojiPicker
          theme={Theme.DARK}
          width="100%"
          height={380}
          onEmojiClick={(data: EmojiClickData) => onElegir(data.emoji)}
        />
      </div>
    </div>
  );
}
