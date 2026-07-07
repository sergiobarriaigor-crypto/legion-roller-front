"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/context/SessionContext";
import { rutaInicialParaRol, type Rol } from "@/lib/session";
import { apiPost, ApiError } from "@/lib/api";

type Panel = "roles" | "login-usuario" | "login-admin" | "registro" | null;

interface LoginResponse {
  accessToken: string;
  id: number;
  nombre: string;
  rol: Rol;
}

interface RegistroResponse {
  mensaje: string;
}

export default function BienvenidaPage() {
  const { sesion, cargando, login } = useSession();
  const router = useRouter();
  const [panel, setPanel] = useState<Panel>("roles");
  const [telefono, setTelefono] = useState("");
  const [clave, setClave] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [nombreRegistro, setNombreRegistro] = useState("");
  const [telefonoRegistro, setTelefonoRegistro] = useState("");
  const [ciudadRegistro, setCiudadRegistro] = useState("");
  const [claveRegistro, setClaveRegistro] = useState("");
  const [mensajeRegistro, setMensajeRegistro] = useState("");
  const [errorRegistro, setErrorRegistro] = useState("");
  const [errorLogin, setErrorLogin] = useState("");

  useEffect(() => {
    if (!cargando && sesion) {
      router.replace(rutaInicialParaRol(sesion.rol));
    }
  }, [cargando, sesion, router]);

  async function entrarConClave(e: React.FormEvent) {
    e.preventDefault();
    if (!telefono || !clave) {
      setErrorLogin("Ingresa tu teléfono y contraseña.");
      return;
    }
    setErrorLogin("");
    setEnviando(true);
    try {
      const res = await apiPost<LoginResponse>("/auth/login", { telefono, clave });
      login({ id: res.id, nombre: res.nombre, rol: res.rol, token: res.accessToken });
      router.replace(rutaInicialParaRol(res.rol));
    } catch (err) {
      setErrorLogin(err instanceof ApiError ? err.message : "No se pudo conectar con el servidor.");
    } finally {
      setEnviando(false);
    }
  }

  async function enviarRegistro(e: React.FormEvent) {
    e.preventDefault();
    if (!nombreRegistro || !telefonoRegistro || !claveRegistro) {
      setErrorRegistro("Completa nombre, teléfono y contraseña.");
      return;
    }
    setErrorRegistro("");
    setEnviando(true);
    try {
      const res = await apiPost<RegistroResponse>("/auth/registro", {
        nombre: nombreRegistro,
        telefono: telefonoRegistro,
        ciudad: ciudadRegistro || undefined,
        clave: claveRegistro,
      });
      setMensajeRegistro(res.mensaje);
    } catch (err) {
      setErrorRegistro(err instanceof ApiError ? err.message : "No se pudo conectar con el servidor.");
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
        <span className="text-3xl font-bold tracking-wide text-text-accent">
          LEGIÓN
        </span>
        <span className="text-3xl font-bold tracking-wide text-text-primary">
          ROLLER
        </span>
        <p className="text-sm text-text-secondary">
          Comunidad de patinaje — Puerto Montt / Puerto Varas
        </p>
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
            type="tel"
            placeholder="Teléfono"
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            className="rounded-app border border-border bg-surface-2 px-3 py-2 text-text-primary outline-none"
          />
          <input
            type="password"
            placeholder="Contraseña"
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            className="rounded-app border border-border bg-surface-2 px-3 py-2 text-text-primary outline-none"
          />
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
        <form
          onSubmit={enviarRegistro}
          className="card flex w-full max-w-xs flex-col gap-3 p-5"
        >
          <h2 className="text-sm font-semibold text-text-primary">
            Solicitud de registro
          </h2>
          <input
            type="text"
            placeholder="Nombre completo"
            value={nombreRegistro}
            onChange={(e) => setNombreRegistro(e.target.value)}
            className="rounded-app border border-border bg-surface-2 px-3 py-2 text-text-primary outline-none"
          />
          <input
            type="tel"
            placeholder="Teléfono"
            value={telefonoRegistro}
            onChange={(e) => setTelefonoRegistro(e.target.value)}
            className="rounded-app border border-border bg-surface-2 px-3 py-2 text-text-primary outline-none"
          />
          <input
            type="text"
            placeholder="Ciudad"
            value={ciudadRegistro}
            onChange={(e) => setCiudadRegistro(e.target.value)}
            className="rounded-app border border-border bg-surface-2 px-3 py-2 text-text-primary outline-none"
          />
          <input
            type="password"
            placeholder="Contraseña"
            value={claveRegistro}
            onChange={(e) => setClaveRegistro(e.target.value)}
            className="rounded-app border border-border bg-surface-2 px-3 py-2 text-text-primary outline-none"
          />
          {errorRegistro && <p className="text-xs text-fill-warning">{errorRegistro}</p>}
          {mensajeRegistro ? (
            <p className="text-xs text-fill-success">{mensajeRegistro}</p>
          ) : (
            <button type="submit" disabled={enviando} className="btn-hero rounded-app px-4 py-2 disabled:opacity-60">
              {enviando ? "Enviando..." : "Enviar solicitud"}
            </button>
          )}
          <button
            type="button"
            className="text-xs text-text-secondary underline"
            onClick={() => {
              setPanel("roles");
              setMensajeRegistro("");
              setErrorRegistro("");
            }}
          >
            Volver
          </button>
        </form>
      )}
    </div>
  );
}
