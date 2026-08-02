# Música para historias

Catálogo propio de la app para el sticker de música de Historias (no es
contenido de usuarios, es música que la app misma ofrece).

## Cómo agregar pistas nuevas

1. Bajar los archivos (Pixabay Music u otra fuente libre de derechos, uso
   comercial permitido, sin atribución obligatoria) en formato MP3.
2. Idealmente cortas (15-30 segundos) — son para historias, no para
   escuchar la canción completa.
3. Copiar cada archivo a la subcarpeta de su género:
   - `fiesta/`
   - `rock/`
   - `dance/`
   - `romantica/`
   - `cumbia/`
4. Agregar una entrada por cada pista en
   `frontend/src/lib/musicaHistorias.ts`, en el array `CANCIONES_HISTORIA`:

   ```ts
   { id: "fiesta-01", nombre: "Noche de fiesta", genero: "fiesta", archivo: "/musica/fiesta/01-noche-de-fiesta.mp3" },
   ```

No hace falta tocar nada más — el selector de música del editor de
historias y el visor leen directo de `CANCIONES_HISTORIA`.
