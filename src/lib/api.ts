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
  const data = await res.json().catch(() => ({}) as ApiErrorBody);

  if (!res.ok) {
    const mensaje = Array.isArray(data.message)
      ? data.message.join(", ")
      : (data.message ?? "Ocurrió un error inesperado");
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
