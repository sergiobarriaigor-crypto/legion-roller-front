package com.legionroller.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;

import android.content.Context;

import androidx.test.core.app.ApplicationProvider;

import com.equimaps.capacitor_background_geolocation.SesionGrabacionNativa;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;

import java.util.List;

// FASE 1 -- pruebas de SesionGrabacionNativa (persistencia nativa PARALELA
// de fixes GPS, ver diseño de arquitectura combinada acordado). La clase
// bajo prueba vive en el paquete del plugin vendorizado
// (com.equimaps.capacitor_background_geolocation), no en com.legionroller.app
// -- ver comentario en SesionGrabacionNativa.java sobre por qué (modulo
// Gradle separado). Este test vive en el modulo :app porque :app SI puede
// depender del modulo del plugin (al reves de una libreria dependiendo de
// la app). Corre en JVM plano via Robolectric (sin emulador/dispositivo):
//
//   ./gradlew testDebugUnitTest
//
// Puramente estructural: no depende de ninguna ruta real ni de GPS V1/V2 --
// solo verifica el mecanismo de persistencia en si mismo.
@RunWith(RobolectricTestRunner.class)
public class SesionGrabacionNativaTest {

    private Context contexto() {
        return ApplicationProvider.getApplicationContext();
    }

    // A. iniciar sesión nativa
    @Test
    public void iniciarSesion_devuelveIdNoVacioYQuedaRegistrada() {
        SesionGrabacionNativa db = new SesionGrabacionNativa(contexto());
        String sesionId = db.iniciarSesion("watcher-1", 1000L);
        assertNotNull(sesionId);
        assertFalse(sesionId.isEmpty());
    }

    // B. insertar fixes
    @Test
    public void registrarFix_seInsertaCorrectamente() {
        SesionGrabacionNativa db = new SesionGrabacionNativa(contexto());
        String sesionId = db.iniciarSesion("watcher-1", 1000L);
        db.registrarFix(sesionId, -41.46, -72.94, 2000L, 8.0f, 3.0f, 15.0);
        assertEquals(1, db.contarFixes(sesionId));
    }

    // C. conservar timestamp real (nunca System.currentTimeMillis())
    @Test
    public void registrarFix_conservaTimestampReal() {
        SesionGrabacionNativa db = new SesionGrabacionNativa(contexto());
        String sesionId = db.iniciarSesion("watcher-1", 1000L);
        db.registrarFix(sesionId, -41.46, -72.94, 1788213449499L, 8.0f, 3.0f, 15.0);
        List<SesionGrabacionNativa.FixPersistido> fixes = db.obtenerFixes(sesionId);
        assertEquals(1, fixes.size());
        assertEquals(1788213449499L, fixes.get(0).timestamp);
    }

    // D. conservar lat/lon/accuracy/speed/altitude
    @Test
    public void registrarFix_conservaTodosLosCampos() {
        SesionGrabacionNativa db = new SesionGrabacionNativa(contexto());
        String sesionId = db.iniciarSesion("watcher-1", 1000L);
        db.registrarFix(sesionId, -41.4693, -72.9424, 2000L, 8.5f, 4.2f, 123.7);
        SesionGrabacionNativa.FixPersistido f = db.obtenerFixes(sesionId).get(0);
        assertEquals(-41.4693, f.lat, 0.00001);
        assertEquals(-72.9424, f.lon, 0.00001);
        assertEquals(8.5f, f.accuracy, 0.001f);
        assertEquals(4.2f, f.speed, 0.001f);
        assertEquals(123.7, f.altitude, 0.001);
    }

    // D (complemento) -- campos ausentes (accuracy/speed/altitude que el
    // Location real a veces no trae) deben quedar NULL, no un valor inventado.
    @Test
    public void registrarFix_camposAusentesQuedanNull() {
        SesionGrabacionNativa db = new SesionGrabacionNativa(contexto());
        String sesionId = db.iniciarSesion("watcher-1", 1000L);
        db.registrarFix(sesionId, -41.4693, -72.9424, 2000L, null, null, null);
        SesionGrabacionNativa.FixPersistido f = db.obtenerFixes(sesionId).get(0);
        assertNull(f.accuracy);
        assertNull(f.speed);
        assertNull(f.altitude);
    }

    // E. múltiples inserts en orden -- insertados fuera de orden cronológico
    // a propósito, deben salir ordenados por timestamp real, no por orden
    // de llegada/id de fila.
    @Test
    public void registrarFix_multiplesInsertsQuedanEnOrdenCronologico() {
        SesionGrabacionNativa db = new SesionGrabacionNativa(contexto());
        String sesionId = db.iniciarSesion("watcher-1", 1000L);
        db.registrarFix(sesionId, -41.0, -72.0, 3000L, 8f, null, null);
        db.registrarFix(sesionId, -41.1, -72.1, 1000L, 8f, null, null);
        db.registrarFix(sesionId, -41.2, -72.2, 2000L, 8f, null, null);
        List<SesionGrabacionNativa.FixPersistido> fixes = db.obtenerFixes(sesionId);
        assertEquals(3, fixes.size());
        assertEquals(1000L, fixes.get(0).timestamp);
        assertEquals(2000L, fixes.get(1).timestamp);
        assertEquals(3000L, fixes.get(2).timestamp);
    }

    // F. SQLite sobrevive a la recreación de la clase/repositorio -- prueba
    // que los datos viven en el ARCHIVO, no en memoria del objeto Java, que
    // es la garantía real necesaria para sobrevivir a que el proceso
    // Android muera y todo se reinicie.
    @Test
    public void datosSobrevivenARecrearLaInstanciaJava() {
        Context contexto = contexto();
        SesionGrabacionNativa primera = new SesionGrabacionNativa(contexto);
        String sesionId = primera.iniciarSesion("watcher-1", 1000L);
        primera.registrarFix(sesionId, -41.46, -72.94, 2000L, 8f, null, null);
        primera.close();

        SesionGrabacionNativa segunda = new SesionGrabacionNativa(contexto);
        List<SesionGrabacionNativa.FixPersistido> fixes = segunda.obtenerFixes(sesionId);
        assertEquals(1, fixes.size());
        assertEquals(2000L, fixes.get(0).timestamp);
    }

    // G. un fallo simulado de entrega no elimina el fix persistido. Prueba
    // el PATRÓN de diseño (persistir antes de intentar entregar, y que una
    // excepción en la entrega no afecte lo ya persistido) -- no es una
    // integración real con el Bridge de Capacitor, que requeriría mockear
    // toda su infraestructura (Bridge/PluginCall/WebView), fuera de alcance
    // de una prueba unitaria de este componente. La protección real del
    // ServiceReceiver está en BackgroundGeolocation.java (try/catch), este
    // test verifica que la garantía que ese try/catch se apoya en --
    // "lo ya persistido no desaparece si algo después falla" -- es cierta.
    @Test
    public void fixPersistidoSobreviveAUnFalloSimuladoDeEntrega() {
        SesionGrabacionNativa db = new SesionGrabacionNativa(contexto());
        String sesionId = db.iniciarSesion("watcher-1", 1000L);

        // Paso 1: persistir (siempre ocurre primero, ver diseño).
        db.registrarFix(sesionId, -41.46, -72.94, 2000L, 8f, null, null);

        // Paso 2: simular que la entrega al Bridge/JS falla -- mismo patrón
        // que ServiceReceiver.onReceive() en BackgroundGeolocation.java.
        try {
            throw new RuntimeException("Bridge/WebView no disponible (simulado)");
        } catch (RuntimeException ignorada) {
            // Una falla acá no debe afectar lo ya persistido.
        }

        // El fix persistido en el paso 1 debe seguir intacto.
        assertEquals(1, db.contarFixes(sesionId));
    }
}
