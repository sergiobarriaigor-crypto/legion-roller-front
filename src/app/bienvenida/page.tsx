"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/context/SessionContext";
import { rutaInicialParaRol, type Rol } from "@/lib/session";
import { apiPost, ApiError } from "@/lib/api";
import { FormularioRegistro } from "@/components/Bienvenida/FormularioRegistro";

type Panel = "roles" | "login-usuario" | "login-admin" | "registro" | null;

const URL_INSTAGRAM = "https://www.instagram.com/legionrollerpm";

interface LoginResponse {
  accessToken: string;
  id: number;
  nombre: string;
  rol: Rol;
}

export default function BienvenidaPage() {
  const { sesion, cargando, login } = useSession();
  const router = useRouter();
  const [panel, setPanel] = useState<Panel>("roles");
  const [correo, setCorreo] = useState("");
  const [clave, setClave] = useState("");
  const [mostrarClave, setMostrarClave] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [errorLogin, setErrorLogin] = useState("");

  useEffect(() => {
    if (!cargando && sesion) {
      router.replace(rutaInicialParaRol(sesion.rol));
    }
  }, [cargando, sesion, router]);

  async function entrarConClave(e: React.FormEvent) {
    e.preventDefault();
    if (!correo || !clave) {
      setErrorLogin("Ingresa tu correo y contraseña.");
      return;
    }
    setErrorLogin("");
    setEnviando(true);
    try {
      const res = await apiPost<LoginResponse>("/auth/login", { correo, clave });
      login({ id: res.id, nombre: res.nombre, rol: res.rol, token: res.accessToken });
      router.replace(rutaInicialParaRol(res.rol));
    } catch (err) {
      setErrorLogin(err instanceof ApiError ? err.message : "No se pudo conectar con el servidor.");
    } finally {
      setEnviando(false);
    }
  }

  function entrarComoVisitante() {
    login({ id: null, nombre: "Visitante", rol: "visitante", token: null });
    router.replace(rutaInicialParaRol("visitante"));
  }

  if (cargando || sesion) {
    return null;
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 px-6 py-12">
      <div className="flex flex-col items-center gap-2">
        <div className="relative flex items-center justify-center">
          <div
            className="absolute inset-[-30px] rounded-full blur-md"
            style={{
              background:
                "radial-gradient(circle, rgba(231,193,104,0.55) 0%, rgba(201,154,61,0.28) 35%, transparent 70%)",
            }}
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-legion-roller.png"
            alt="Legión Roller"
            className="relative h-40 w-40 object-contain"
          />
        </div>
      </div>

      {panel === "roles" && (
        <div className="flex w-full max-w-xs flex-col gap-3">
          <button
            type="button"
            className="btn-hero rounded-app px-4 py-3"
            onClick={() => {
              setErrorLogin("");
              setPanel("login-usuario");
            }}
          >
            Ingresar como Usuario
          </button>
          <button
            type="button"
            className="card rounded-app px-4 py-3 text-text-primary"
            onClick={() => {
              setErrorLogin("");
              setPanel("login-admin");
            }}
          >
            Ingresar como Admin
          </button>
          <button
            type="button"
            className="card rounded-app px-4 py-3 text-text-primary"
            onClick={() => setPanel("registro")}
          >
            Registrarme
          </button>
          <button
            type="button"
            className="rounded-app px-4 py-3 text-text-secondary underline"
            onClick={entrarComoVisitante}
          >
            Entrar como Visitante
          </button>
          <a
            href={URL_INSTAGRAM}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 flex justify-center"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/boton-instagram.png"
              alt="Síguenos en Instagram"
              className="h-auto w-56 object-contain"
            />
          </a>
        </div>
      )}

      {(panel === "login-usuario" || panel === "login-admin") && (
        <form
          onSubmit={entrarConClave}
          className="card flex w-full max-w-xs flex-col gap-3 p-5"
        >
          <h2 className="text-sm font-semibold text-text-primary">
            {panel === "login-usuario" ? "Ingresar como Usuario" : "Ingresar como Admin"}
          </h2>
          <input
            type="email"
            placeholder="Correo electrónico"
            value={correo}
            onChange={(e) => setCorreo(e.target.value)}
            className="rounded-app border border-border bg-surface-2 px-3 py-2 text-text-primary outline-none"
          />
          <div className="relative">
            <input
              type={mostrarClave ? "text" : "password"}
              placeholder="Contraseña"
              value={clave}
              onChange={(e) => setClave(e.target.value)}
              className="w-full rounded-app border border-border bg-surface-2 px-3 py-2 pr-16 text-text-primary outline-none"
            />
            <button
              type="button"
              onClick={() => setMostrarClave((v) => !v)}
              className="absolute inset-y-0 right-3 text-xs text-text-secondary underline"
            >
              {mostrarClave ? "Ocultar" : "Mostrar"}
            </button>
          </div>
          {errorLogin && <p className="text-xs text-fill-warning">{errorLogin}</p>}
          <button type="submit" disabled={enviando} className="btn-hero rounded-app px-4 py-2 disabled:opacity-60">
            {enviando ? "Ingresando..." : "Ingresar"}
          </button>
          <button
            type="button"
            className="text-xs text-text-secondary underline"
            onClick={() => setPanel("roles")}
          >
            Volver
          </button>
        </form>
      )}

      {panel === "registro" && (
        <FormularioRegistro onVolver={() => setPanel("roles")} />
      )}
    </div>
  );
}
