"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/context/SessionContext";
import { rutaInicialParaRol } from "@/lib/session";

type Panel = "roles" | "login-usuario" | "login-admin" | "registro" | null;

export default function BienvenidaPage() {
  const { sesion, cargando, login } = useSession();
  const router = useRouter();
  const [panel, setPanel] = useState<Panel>("roles");
  const [telefono, setTelefono] = useState("");
  const [clave, setClave] = useState("");
  const [nombreRegistro, setNombreRegistro] = useState("");
  const [ciudadRegistro, setCiudadRegistro] = useState("");
  const [mensajeRegistro, setMensajeRegistro] = useState("");
  const [errorLogin, setErrorLogin] = useState("");

  useEffect(() => {
    if (!cargando && sesion) {
      router.replace(rutaInicialParaRol(sesion.rol));
    }
  }, [cargando, sesion, router]);

  function entrarComoUsuario(e: React.FormEvent) {
    e.preventDefault();
    if (!telefono || !clave) {
      setErrorLogin("Ingresa tu teléfono y contraseña.");
      return;
    }
    login(`Usuario ${telefono}`, "usuario");
    router.replace(rutaInicialParaRol("usuario"));
  }

  function entrarComoAdmin(e: React.FormEvent) {
    e.preventDefault();
    if (!telefono || !clave) {
      setErrorLogin("Ingresa tu teléfono y contraseña de administrador.");
      return;
    }
    login("Admin", "admin");
    router.replace(rutaInicialParaRol("admin"));
  }

  function enviarRegistro(e: React.FormEvent) {
    e.preventDefault();
    if (!nombreRegistro || !ciudadRegistro) return;
    setMensajeRegistro(
      "Tu solicitud fue enviada. Un administrador debe aprobarla antes de que puedas ingresar.",
    );
  }

  function entrarComoVisitante() {
    login("Visitante", "visitante");
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
          onSubmit={panel === "login-usuario" ? entrarComoUsuario : entrarComoAdmin}
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
          <button type="submit" className="btn-hero rounded-app px-4 py-2">
            Ingresar
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
            type="text"
            placeholder="Ciudad"
            value={ciudadRegistro}
            onChange={(e) => setCiudadRegistro(e.target.value)}
            className="rounded-app border border-border bg-surface-2 px-3 py-2 text-text-primary outline-none"
          />
          {mensajeRegistro ? (
            <p className="text-xs text-fill-success">{mensajeRegistro}</p>
          ) : (
            <button type="submit" className="btn-hero rounded-app px-4 py-2">
              Enviar solicitud
            </button>
          )}
          <button
            type="button"
            className="text-xs text-text-secondary underline"
            onClick={() => {
              setPanel("roles");
              setMensajeRegistro("");
            }}
          >
            Volver
          </button>
        </form>
      )}
    </div>
  );
}
