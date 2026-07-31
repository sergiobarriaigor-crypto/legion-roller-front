const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

interface ApiErrorBody {
  message?: string | string[];
}

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function manejarRespuesta<T>(res: Response): Promise<T> {
  // Cuando un endpoint devuelve `null` (p. ej. "no tenés ficha" o "sin
  // emergencia activa"), Nest envía el body vacío (content-length: 0), no el
  // literal "null" — `res.json()` sobre un body vacío tira SyntaxError. Hay
  // que distinguir "vacío" (→ null, una respuesta válida) de "JSON inválido"
  // (→ {}, solo para no romper el mensaje de error de abajo).
  const texto = await res.text();
  let data: unknown = null;
  if (texto) {
    try {
      data = JSON.parse(texto);
    } catch {
      data = {};
    }
  }

  if (!res.ok) {
    const cuerpo = (data ?? {}) as ApiErrorBody;
    const mensaje = Array.isArray(cuerpo.message)
      ? cuerpo.message.join(", ")
      : (cuerpo.message ?? "Ocurrió un error inesperado");
    throw new ApiError(mensaje, res.status);
  }

  return data as T;
}

function headersConToken(token: string | null): HeadersInit {
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (token) {
    (headers as Record<string, string>).Authorization = `Bearer ${token}`;
  }
  return headers;
}

export async function apiPost<T>(
  ruta: string,
  body: unknown,
  token: string | null = null,
): Promise<T> {
  const res = await fetch(`${API_URL}${ruta}`, {
    method: "POST",
    headers: headersConToken(token),
    body: JSON.stringify(body),
  });
  return manejarRespuesta<T>(res);
}

export async function apiPut<T>(
  ruta: string,
  body: unknown,
  token: string | null = null,
): Promise<T> {
  const res = await fetch(`${API_URL}${ruta}`, {
    method: "PUT",
    headers: headersConToken(token),
    body: JSON.stringify(body),
  });
  return manejarRespuesta<T>(res);
}

export async function apiPatch<T>(
  ruta: string,
  body: unknown,
  token: string | null = null,
): Promise<T> {
  const res = await fetch(`${API_URL}${ruta}`, {
    method: "PATCH",
    headers: headersConToken(token),
    body: JSON.stringify(body),
  });
  return manejarRespuesta<T>(res);
}

export async function apiGet<T>(ruta: string, token: string | null): Promise<T> {
  const res = await fetch(`${API_URL}${ruta}`, {
    headers: headersConToken(token),
  });
  return manejarRespuesta<T>(res);
}

export async function apiDelete<T>(ruta: string, token: string | null): Promise<T> {
  const res = await fetch(`${API_URL}${ruta}`, {
    method: "DELETE",
    headers: headersConToken(token),
  });
  return manejarRespuesta<T>(res);
}

export async function apiUpload<T>(
  ruta: string,
  archivo: Blob,
  token: string | null,
  nombreArchivo = "foto.jpg",
): Promise<T> {
  const formData = new FormData();
  formData.append("archivo", archivo, nombreArchivo);
  const headers: HeadersInit = {};
  if (token) (headers as Record<string, string>).Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${ruta}`, {
    method: "POST",
    headers,
    body: formData,
  });
  return manejarRespuesta<T>(res);
}

// Igual que apiUpload, pero con XMLHttpRequest en vez de fetch: es la única
// API del navegador que expone el evento de progreso de subida (fetch no lo
// tiene), necesario para mostrar un % real mientras se sube un archivo
// grande (foto/video/documento) en el chat.
export function apiUploadConProgreso<T>(
  ruta: string,
  archivo: Blob,
  token: string | null,
  nombreArchivo: string,
  onProgreso: (pct: number) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append("archivo", archivo, nombreArchivo);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_URL}${ruta}`);
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgreso(Math.round((e.loaded / e.total) * 100));
    };

    xhr.onload = () => {
      let data: unknown = null;
      if (xhr.responseText) {
        try {
          data = JSON.parse(xhr.responseText);
        } catch {
          data = {};
        }
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(data as T);
        return;
      }
      const cuerpo = (data ?? {}) as ApiErrorBody;
      const mensaje = Array.isArray(cuerpo.message)
        ? cuerpo.message.join(", ")
        : (cuerpo.message ?? "Ocurrió un error inesperado");
      reject(new ApiError(mensaje, xhr.status));
    };

    xhr.onerror = () => reject(new ApiError("No se pudo conectar con el servidor.", 0));

    xhr.send(formData);
  });
}
