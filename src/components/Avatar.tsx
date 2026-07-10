"use client";

import type { ReactNode } from "react";

// Componente compartido de avatar circular con foto + fallback de inicial.
// El anillo "dorado" (con un pequeño espacio entre el aro y la foto, como en
// Instagram) indica historia activa sin ver; "ninguno" es el avatar liso de
// siempre. `children` permite superponer un botón (ej. el "+" de "Mi historia").
export function Avatar({
  fotoUrl,
  nombre,
  tamano = 56,
  anillo = "ninguno",
  children,
}: {
  fotoUrl: string | null;
  nombre: string;
  tamano?: number;
  anillo?: "dorado" | "ninguno";
  children?: ReactNode;
}) {
  const inicial = (nombre.charAt(0) || "?").toUpperCase();

  const contenido = fotoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={fotoUrl} alt={nombre} className="h-full w-full rounded-full object-cover" />
  ) : (
    <div className="flex h-full w-full items-center justify-center rounded-full bg-bg-accent text-sm font-semibold text-text-accent">
      {inicial}
    </div>
  );

  return (
    <div className="relative shrink-0" style={{ width: tamano, height: tamano }}>
      {anillo === "dorado" ? (
        <div
          className="h-full w-full rounded-full p-[2.5px]"
          style={{ background: "linear-gradient(135deg, #e7c168, #c99a3d)" }}
        >
          <div className="h-full w-full rounded-full bg-page-bg p-[2px]">{contenido}</div>
        </div>
      ) : (
        contenido
      )}
      {children}
    </div>
  );
}
