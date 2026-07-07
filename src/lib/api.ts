const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

interface ApiErrorBody {
  message?: string | string[];
}

export class ApiError extends Error {}

export async function apiPost<T>(ruta: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${ruta}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}) as ApiErrorBody);

  if (!res.ok) {
    const mensaje = Array.isArray(data.message)
      ? data.message.join(", ")
      : (data.message ?? "Ocurrió un error inesperado");
    throw new ApiError(mensaje);
  }

  return data as T;
}
