// Ayuda a mostrar sub-respuestas "aplanadas": en vez de indentar cada nivel
// de un hilo (ilegible en una pantalla angosta), toda respuesta a una
// respuesta se guarda igual bajo el comentario raíz, y el contexto de a
// quién le contesta se guarda como un prefijo "@Nombre " dentro del propio
// texto — esta función lo separa para poder resaltarlo al mostrarlo.
export function primerNombre(nombre: string): string {
  return nombre.split(" ")[0];
}

export function separarMencion(texto: string): { mencion: string | null; resto: string } {
  const match = texto.match(/^(@\S+)\s([\s\S]*)$/);
  if (!match) return { mencion: null, resto: texto };
  return { mencion: match[1], resto: match[2] };
}
