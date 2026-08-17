import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Política de Privacidad — Legión Roller",
  description:
    "Política de privacidad de la app Legión Roller: qué datos recopilamos, para qué los usamos y cómo los protegemos.",
};

const ULTIMA_ACTUALIZACION = "17 de agosto de 2026";
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

export default function PoliticaPrivacidadPage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 px-5 py-10">
      <div className="flex flex-col gap-2">
        <Link href="/bienvenida" className="text-xs text-text-secondary underline">
          ← Volver a Legión Roller
        </Link>
        <h1 className="text-xl font-bold text-text-primary">Política de Privacidad</h1>
        <p className="text-xs text-text-muted">
          Legión Roller — Última actualización: {ULTIMA_ACTUALIZACION}
        </p>
      </div>

      <Seccion titulo="Quiénes somos">
        <p>
          Legión Roller es una app de comunidad para el grupo de patinaje (roller/skate) del mismo
          nombre, con base en Puerto Montt / Puerto Varas, Chile. Esta política explica qué
          información recopilamos de las personas que usan la app, para qué la usamos, con quién se
          comparte y qué derechos tenés sobre tus propios datos.
        </p>
        <p>
          El responsable del tratamiento de tus datos es Sergio Barría, desarrollador y
          administrador de la app. Podés escribirle a{" "}
          <a href={`mailto:${CORREO_CONTACTO}`} className="text-text-accent underline">
            {CORREO_CONTACTO}
          </a>{" "}
          por cualquier consulta sobre esta política o tus datos.
        </p>
      </Seccion>

      <Seccion titulo="Qué información recopilamos">
        <p>
          <strong className="text-text-primary">Datos de tu cuenta:</strong> nombre, correo
          electrónico, fecha de nacimiento y contraseña (guardada siempre cifrada, nunca en texto
          plano) al registrarte. Opcionalmente, una foto de perfil.
        </p>
        <p>
          <strong className="text-text-primary">Ubicación (GPS):</strong> cuando activás el modo
          &quot;Patinando&quot; o &quot;En Ruta&quot; en el Mapa, la app registra tu posición para
          mostrarte a otros integrantes patinando en el momento, calcular la distancia/velocidad de
          tu recorrido y, si elegís mapearlo, guardar el trazado de la ruta en tu historial. También
          se usa tu ubicación si activás una alerta de emergencia (SOS), para avisar a los
          integrantes que estén cerca tuyo.
        </p>
        <p>
          <strong className="text-text-primary">Cámara y galería:</strong> para subir foto de
          perfil, fotos en publicaciones, historias, mensajes de chat, tu ficha de emprendedor o tu
          galería personal. Solo se accede a la cámara o galería cuando vos elegís subir una foto o
          video — la app nunca activa la cámara por su cuenta.
        </p>
        <p>
          <strong className="text-text-primary">Micrófono:</strong> únicamente si grabás una nota
          de voz en el Chat.
        </p>
        <p>
          <strong className="text-text-primary">Notificaciones push:</strong> un identificador
          técnico de tu dispositivo (o de tu navegador) para poder enviarte avisos —
          mensajes nuevos, rodadas próximas, alertas de emergencia, recordatorios de eventos, etc.
        </p>
        <p>
          <strong className="text-text-primary">Contenido que generás:</strong> mensajes de chat,
          publicaciones, comentarios, reacciones, encuestas y cualquier otro contenido que crees
          dentro de la app.
        </p>
      </Seccion>

      <Seccion titulo="Ubicación en segundo plano">
        <p>
          Mientras tenés activo el modo &quot;Patinando&quot; o &quot;En Ruta&quot;, la app puede
          seguir registrando tu ubicación aunque la app esté minimizada, para que el trazado de tu
          recorrido no se corte si bajás la pantalla o cambiás de app un momento. Esto funciona
          mediante un servicio en primer plano de Android, que muestra siempre una notificación
          visible mientras está activo (nunca funciona de forma oculta). Podés desactivarlo en
          cualquier momento deteniendo el modo desde el Mapa, o revocando el permiso de ubicación de
          la app desde los ajustes de tu celular.
        </p>
      </Seccion>

      <Seccion titulo="Para qué usamos tu información">
        <ul className="list-disc space-y-1 pl-5">
          <li>Crear y proteger tu cuenta, y verificar que sos parte del grupo.</li>
          <li>Mostrar el mapa en vivo con quién está patinando o en ruta cerca tuyo.</li>
          <li>Calcular y guardar tus recorridos, estadísticas y logros.</li>
          <li>Avisar a integrantes cercanos ante una emergencia (SOS).</li>
          <li>Enviarte notificaciones relevantes que vos mismo activaste.</li>
          <li>
            Mostrar tu contenido (fotos, publicaciones, mensajes) al resto del grupo o a la persona
            destinataria, según corresponda.
          </li>
          <li>Que el Admin del grupo pueda moderar la comunidad (aprobar integrantes, gestionar reportes, etc.).</li>
        </ul>
        <p>No usamos tu información para publicidad ni la vendemos a terceros.</p>
      </Seccion>

      <Seccion titulo="Con quién compartimos información">
        <p>
          Tu información se comparte únicamente con los demás integrantes de Legión Roller, dentro
          de los límites normales de la app (por ejemplo, tu ubicación en vivo solo la ven otros
          mientras estás patinando/en ruta; tus mensajes privados solo los ve el destinatario).
        </p>
        <p>Además, usamos estos servicios externos para que la app funcione:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong className="text-text-primary">Google Firebase Cloud Messaging</strong>, para
            entregar las notificaciones push a la app instalada en tu celular.
          </li>
          <li>
            <strong className="text-text-primary">Esri y OpenStreetMap</strong>, como proveedores
            de los mapas e imágenes satelitales que se muestran en la app.
          </li>
          <li>
            <strong className="text-text-primary">Vercel y Railway</strong>, como proveedores de
            hosting donde corren la app y el servidor.
          </li>
        </ul>
        <p>
          Estos servicios procesan datos técnicos (como tu dirección IP o las coordenadas de un mapa
          que pedís ver) según sus propias políticas de privacidad, únicamente para prestar el
          servicio que ofrecen.
        </p>
      </Seccion>

      <Seccion titulo="Seguridad">
        <p>
          Las contraseñas se guardan siempre cifradas, nunca en texto plano. Las conexiones entre la
          app y el servidor viajan cifradas (HTTPS). El acceso a funciones de administración está
          restringido a las cuentas con rol de Admin.
        </p>
      </Seccion>

      <Seccion titulo="Cuánto tiempo conservamos tus datos">
        <p>
          Conservamos tu información mientras tu cuenta esté activa. Si el Admin elimina tu cuenta, o
          vos solicitás su eliminación, se borran tus datos personales y contenido asociado (con
          algunas excepciones razonables, como registros necesarios para prevenir abusos). Algunos
          contenidos con vigencia limitada por diseño (por ejemplo, mensajes de chat o fotos de
          eventos pasados) se eliminan automáticamente pasado ese plazo.
        </p>
      </Seccion>

      <Seccion titulo="Tus derechos">
        <p>
          Podés pedir acceder a tus datos, corregirlos o eliminarlos en cualquier momento, escribiendo
          a{" "}
          <a href={`mailto:${CORREO_CONTACTO}`} className="text-text-accent underline">
            {CORREO_CONTACTO}
          </a>
          . También podés revocar los permisos de ubicación, cámara, micrófono o notificaciones
          directamente desde los ajustes de tu celular en cualquier momento — la app seguirá
          funcionando, solo que sin esa función puntual.
        </p>
      </Seccion>

      <Seccion titulo="Menores de edad">
        <p>
          Legión Roller es un grupo/club, y algunos de sus integrantes pueden ser menores de edad con
          el conocimiento de un adulto responsable del grupo. No recopilamos deliberadamente datos de
          niños fuera de ese contexto de club.
        </p>
      </Seccion>

      <Seccion titulo="Cambios a esta política">
        <p>
          Si actualizamos esta política, publicamos la nueva versión en esta misma página con su
          fecha de actualización.
        </p>
      </Seccion>

      <Seccion titulo="Contacto">
        <p>
          Ante cualquier duda sobre esta política o tus datos, escribinos a{" "}
          <a href={`mailto:${CORREO_CONTACTO}`} className="text-text-accent underline">
            {CORREO_CONTACTO}
          </a>
          .
        </p>
      </Seccion>
    </div>
  );
}
