import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Eliminar cuenta — Legión Roller",
  description:
    "Cómo solicitar la eliminación de tu cuenta de Legión Roller y de los datos personales asociados.",
};

const CORREO_CONTACTO = "sergio.barria.igor@gmail.com";

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="card flex flex-col gap-3 p-5">
      <h2 className="text-base font-semibold text-text-accent">{titulo}</h2>
      <div className="flex flex-col gap-3 text-sm leading-relaxed text-text-secondary">
        {children}
      </div>
    </section>
  );
}

export default function EliminarCuentaPage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 px-5 py-10">
      <div className="flex flex-col gap-2">
        <Link href="/bienvenida" className="text-xs text-text-secondary underline">
          ← Volver a Legión Roller
        </Link>
        <h1 className="text-xl font-bold text-text-primary">Eliminar tu cuenta</h1>
        <p className="text-xs text-text-muted">Legión Roller</p>
      </div>

      <Seccion titulo="Cómo pedir la eliminación">
        <p>
          Legión Roller es la app de comunidad de un club de patinaje, y las cuentas las gestiona
          el administrador del grupo — hoy no hay un botón de autoservicio dentro de la app para
          borrar tu propia cuenta, pero podés pedirlo en cualquier momento escribiendo a:
        </p>
        <p>
          <a href={`mailto:${CORREO_CONTACTO}?subject=Eliminar%20mi%20cuenta`} className="text-text-accent underline">
            {CORREO_CONTACTO}
          </a>
        </p>
        <p>
          Indicá el nombre o correo con el que te registraste. El administrador confirma tu
          identidad y elimina la cuenta — normalmente en menos de 7 días.
        </p>
      </Seccion>

      <Seccion titulo="Qué se elimina">
        <p>Al eliminar tu cuenta se borran o dejan de estar asociados a vos:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Tu nombre y foto de perfil.</li>
          <li>Tu correo electrónico y teléfono.</li>
          <li>Tu ciudad y fecha de nacimiento.</li>
          <li>Tu contraseña (queda inutilizada — la cuenta no puede volver a usarse para iniciar sesión).</li>
        </ul>
      </Seccion>

      <Seccion titulo="Qué se conserva">
        <p>
          El contenido que ya publicaste dentro del grupo (publicaciones, mensajes de chat,
          recorridos, reseñas, comentarios) se conserva para no romper conversaciones o hilos de
          otros integrantes, pero deja de estar asociado a tu nombre o foto real — queda mostrado
          como &quot;Usuario eliminado&quot;, sin ningún dato de contacto tuyo.
        </p>
        <p>
          Si además querés pedir que se borre contenido puntual (una foto, un mensaje, una
          publicación) antes o en vez de eliminar toda la cuenta, también podés pedirlo al mismo
          correo.
        </p>
      </Seccion>

      <Seccion titulo="Más información">
        <p>
          Para más detalle sobre qué datos recopila la app y cómo se usan, mirá la{" "}
          <Link href="/privacidad" className="text-text-accent underline">
            Política de Privacidad
          </Link>
          .
        </p>
      </Seccion>
    </div>
  );
}
