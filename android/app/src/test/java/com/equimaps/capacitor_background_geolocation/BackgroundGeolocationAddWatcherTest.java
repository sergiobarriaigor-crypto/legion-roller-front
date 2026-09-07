package com.equimaps.capacitor_background_geolocation;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyFloat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

import android.content.Context;
import android.location.LocationManager;

import androidx.test.core.app.ApplicationProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.MessageHandler;
import com.getcapacitor.PermissionState;
import com.getcapacitor.PluginCall;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.Shadows;

import java.lang.reflect.Field;

// FASE 1.1 -- corrige BackgroundGeolocation.addWatcher() (auditoria de la
// sesion huerfana 061adcec): las ramas "Permission denied" y "Location
// services disabled" llamaban call.reject(...) pero NO retornaban, y la
// ejecucion seguia de largo hasta service.addWatcher() al final del metodo
// -- creando un watcher nativo (y, desde Fase 1, una fila
// SesionGrabacionNativa) aunque la PluginCall ya hubiera sido rechazada.
// Vive en package com.equimaps.capacitor_background_geolocation (mismo
// paquete que BackgroundGeolocation/LocalBinder, aunque fisicamente reside
// en el sourceset de pruebas de :app, que ya referencia el modulo del
// plugin -- mismo patron que SesionGrabacionNativaTest) porque necesita
// llamar per nombre a LocalBinder.addWatcher(), que es package-private.
@RunWith(RobolectricTestRunner.class)
public class BackgroundGeolocationAddWatcherTest {

    // BackgroundGeolocation.getContext()/getPermissionState() delegan en un
    // Bridge real de Capacitor, nunca inicializado fuera del ciclo de vida
    // real de un plugin cargado por la app. Ambos metodos son publicos y no
    // finales -- se sobreescriben para inyectar estado controlado sin
    // necesitar un Bridge/Activity real.
    private static class BackgroundGeolocationDePrueba extends BackgroundGeolocation {
        PermissionState estadoPermiso = PermissionState.GRANTED;

        @Override
        public PermissionState getPermissionState(String alias) {
            return estadoPermiso;
        }

        @Override
        public Context getContext() {
            return ApplicationProvider.getApplicationContext();
        }
    }

    // requestPermissions=false fuerza la rama call.reject("Permission
    // denied...") en vez de la rama asincrona requestPermissionForAlias
    // (esa rama sigue su flujo vigente, no forma parte del fix autorizado).
    private static PluginCall crearLlamada(boolean requestPermissions) {
        JSObject data = new JSObject();
        data.put("requestPermissions", requestPermissions);
        return new PluginCall(mock(MessageHandler.class), "BackgroundGeolocation", "cb-test", "addWatcher", data);
    }

    // `service` es privado -- reflection es la unica forma de inyectar un
    // LocalBinder mockeado sin pasar por bindService()/onServiceConnected()
    // reales (que requieren el Service corriendo de verdad).
    private static BackgroundGeolocationService.LocalBinder inyectarServicioMock(BackgroundGeolocation plugin) throws Exception {
        BackgroundGeolocationService.LocalBinder servicioMock = mock(BackgroundGeolocationService.LocalBinder.class);
        Field campoService = BackgroundGeolocation.class.getDeclaredField("service");
        campoService.setAccessible(true);
        campoService.set(plugin, servicioMock);
        return servicioMock;
    }

    private static void marcarUbicacionHabilitada(boolean habilitada) {
        LocationManager lm = (LocationManager) ApplicationProvider.getApplicationContext()
                .getSystemService(Context.LOCATION_SERVICE);
        Shadows.shadowOf(lm).setLocationEnabled(habilitada);
    }

    // 1. permiso rechazado -> service.addWatcher nunca llamado.
    @Test
    public void permisoRechazado_serviceAddWatcherNuncaLlamado() throws Exception {
        BackgroundGeolocationDePrueba plugin = new BackgroundGeolocationDePrueba();
        plugin.estadoPermiso = PermissionState.DENIED;
        BackgroundGeolocationService.LocalBinder servicioMock = inyectarServicioMock(plugin);
        marcarUbicacionHabilitada(true);

        plugin.addWatcher(crearLlamada(false));

        verify(servicioMock, never()).addWatcher(anyString(), any(), anyFloat());
    }

    // 2. Location Services deshabilitado -> service.addWatcher nunca llamado.
    @Test
    public void locationServicesDeshabilitado_serviceAddWatcherNuncaLlamado() throws Exception {
        BackgroundGeolocationDePrueba plugin = new BackgroundGeolocationDePrueba();
        plugin.estadoPermiso = PermissionState.GRANTED;
        BackgroundGeolocationService.LocalBinder servicioMock = inyectarServicioMock(plugin);
        marcarUbicacionHabilitada(false);

        plugin.addWatcher(crearLlamada(true));

        verify(servicioMock, never()).addWatcher(anyString(), any(), anyFloat());
    }

    // 3. caso normal -> exactamente un addWatcher.
    @Test
    public void permisoYUbicacionOk_exactamenteUnAddWatcher() throws Exception {
        BackgroundGeolocationDePrueba plugin = new BackgroundGeolocationDePrueba();
        plugin.estadoPermiso = PermissionState.GRANTED;
        BackgroundGeolocationService.LocalBinder servicioMock = inyectarServicioMock(plugin);
        marcarUbicacionHabilitada(true);

        plugin.addWatcher(crearLlamada(true));

        verify(servicioMock, times(1)).addWatcher(anyString(), any(), anyFloat());
    }
}
