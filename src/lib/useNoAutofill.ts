import { useState, useCallback } from "react";

// `autoComplete="off"` no alcanza en Chrome/Android: el framework de Autofill
// del sistema (Google Password Manager / Autofill con Google) decide mostrar
// sus accesos rápidos (llave/tarjeta/ubicación) sobre el teclado por su cuenta,
// ignorando ese atributo. El truco que sí funciona es marcar el campo
// `readOnly` hasta que el usuario lo toca: un campo de solo lectura nunca se
// ofrece para autocompletar, y al enfocarlo se quita el `readOnly` de
// inmediato para que se pueda escribir con normalidad.
export function useNoAutofill() {
  const [readOnly, setReadOnly] = useState(true);
  const onFocus = useCallback(() => setReadOnly(false), []);
  return { readOnly, onFocus };
}
