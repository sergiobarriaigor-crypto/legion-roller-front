"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import {
  IconMap2,
  IconUsers,
  IconMessage2,
  IconUserCircle,
  IconShieldLock,
} from "@tabler/icons-react";
import { useSession } from "@/context/SessionContext";

interface NavItem {
  href: string;
  label: string;
  icon?: ReactNode;
  ocultoParaVisitante?: boolean;
}

const items: NavItem[] = [
  { href: "/mapa", label: "Mapa", icon: <IconMap2 size={22} />, ocultoParaVisitante: true },
  { href: "/comunidad", label: "Comunidad", icon: <IconUsers size={22} /> },
  { href: "/post", label: "Post", icon: <IconMessage2 size={22} /> },
  { href: "/impulsa", label: "Impulsa" },
  { href: "/perfil", label: "Perfil", icon: <IconUserCircle size={22} />, ocultoParaVisitante: true },
];

export function BottomNav() {
  const pathname = usePathname();
  const { sesion } = useSession();
  const esVisitante = sesion?.rol === "visitante";
  const esAdmin = sesion?.rol === "admin";

  const visibles = items.filter((item) => !(esVisitante && item.ocultoParaVisitante));

  return (
    <nav className="flex items-stretch border-t border-border bg-surface-1">
      {visibles.map((item) => {
        const activo = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-1 flex-col items-center justify-center gap-1 py-2 text-xs ${
              activo ? "text-text-accent" : "text-text-secondary"
            }`}
          >
            {item.icon}
            <span>{item.label}</span>
          </Link>
        );
      })}

      {esAdmin && (
        <Link
          href="/admin"
          className={`flex flex-1 flex-col items-center justify-center gap-1 py-2 text-xs ${
            pathname.startsWith("/admin") ? "text-text-accent" : "text-text-secondary"
          }`}
        >
          <IconShieldLock size={22} />
          <span>Admin</span>
        </Link>
      )}
    </nav>
  );
}
