"use client";

import { IconAlertTriangle, IconBell, IconMessageCircle2 } from "@tabler/icons-react";

export function AppHeader() {
  return (
    <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-page-bg">
      <button
        type="button"
        aria-label="Emergencia / SOS"
        className="flex h-9 w-9 items-center justify-center rounded-full bg-fill-warning/10 text-fill-warning"
      >
        <IconAlertTriangle size={20} />
      </button>

      <div className="flex items-center gap-2">
        <span className="text-lg font-bold tracking-wide text-text-accent">
          LEGIÓN
        </span>
        <span className="text-lg font-bold tracking-wide text-text-primary">
          ROLLER
        </span>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="Chat"
          className="relative flex h-9 w-9 items-center justify-center rounded-full text-text-secondary hover:text-text-primary"
        >
          <IconMessageCircle2 size={20} />
        </button>
        <button
          type="button"
          aria-label="Notificaciones"
          className="relative flex h-9 w-9 items-center justify-center rounded-full text-text-secondary hover:text-text-primary"
        >
          <IconBell size={20} />
        </button>
      </div>
    </header>
  );
}
