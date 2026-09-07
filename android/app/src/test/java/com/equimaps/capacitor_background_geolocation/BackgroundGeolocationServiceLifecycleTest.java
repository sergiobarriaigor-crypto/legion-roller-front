package com.equimaps.capacitor_background_geolocation;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertSame;
import static org.junit.Assert.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.mockStatic;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import android.app.Application;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;

import androidx.test.core.app.ApplicationProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.MessageHandler;
import com.getcapacitor.PermissionState;
import com.getcapacitor.PluginCall;
import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationServices;

import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.mockito.MockedStatic;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.Shadows;
import org.robolectric.android.controller.ServiceController;

import java.lang.reflect.Field;
import java.util.HashSet;

// FASE 2 -- Started + Bound Foreground Service. Cubre las pruebas A-E
// pedidas: inicio normal, unbind durante grabacion activa, rebind, stop
// oficial, onStartCommand. Aisla Play Services (FusedLocationProviderClient)
// via Mockito.mockStatic() sobre LocationServices -- bajo Robolectric (JVM
// plano, sin dispositivo) no hay una implementacion real de Play Services
// disponible, y esta fase no busca ejercitar esa integracion (ya cubierta
// por el uso real de la app en produccion) sino la logica de lifecycle
// agregada (onStartCommand, guard de onUnbind, stopSelf simetrico en
// removeWatcher, guard de handleOnDestroy en BackgroundGeolocation).
@RunWith(RobolectricTestRunner.class)
public class BackgroundGeolocationServiceLifecycleTest {

    // Mismo patron que BackgroundGeolocationAddWatcherTest (Fase 1.1):
    // getContext()/getPermissionState() delegan en un Bridge real de
    // Capacitor, nunca inicializado fuera del ciclo de vida real de un
    // plugin cargado por la app -- se sobreescriben (ambos publicos, no
    // finales) para inyectar estado controlado.
    private static class BackgroundGeolocationDePrueba extends BackgroundGeolocation {
        @Override
        public PermissionState getPermissionState(String alias) {
            return PermissionState.GRANTED;
        }

        @Override
        public Context getContext() {
            return ApplicationProvider.getApplicationContext();
        }
    }

    private ServiceController<BackgroundGeolocationService> controller;
    private BackgroundGeolocationService service;
    private BackgroundGeolocationService.LocalBinder localBinder;
    private MockedStatic<LocationServices> locationServicesEstatico;
    private FusedLocationProviderClient clienteMock;

    @Before
    public void preparar() {
        crearCanalNotificacion();
        controller = Robolectric.buildService(BackgroundGeolocationService.class);
        service = controller.create().get();
        localBinder = (BackgroundGeolocationService.LocalBinder) service.onBind(new Intent());

        clienteMock = mock(FusedLocationProviderClient.class);
        locationServicesEstatico = mockStatic(LocationServices.class);
        locationServicesEstatico
                .when(() -> LocationServices.getFusedLocationProviderClient(any(Context.class)))
                .thenReturn(clienteMock);
    }

    @After
    public void limpiar() {
        locationServicesEstatico.close();
    }

    private void crearCanalNotificacion() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = (NotificationManager) ApplicationProvider.getApplicationContext()
                    .getSystemService(Context.NOTIFICATION_SERVICE);
            nm.createNotificationChannel(new NotificationChannel(
                    BackgroundGeolocationService.class.getPackage().getName(),
                    "canal de prueba",
                    NotificationManager.IMPORTANCE_DEFAULT
            ));
        }
    }

    private BackgroundGeolocationDePrueba crearPluginConServicioReal() throws Exception {
        BackgroundGeolocationDePrueba plugin = new BackgroundGeolocationDePrueba();
        Field campoService = BackgroundGeolocation.class.getDeclaredField("service");
        campoService.setAccessible(true);
        campoService.set(plugin, localBinder);
        return plugin;
    }

    // backgroundMessage != null para que BackgroundGeolocation.addWatcher()
    // construya una Notification real y llegue a startForeground() -- sin
    // esto (como en BackgroundGeolocationAddWatcherTest, Fase 1.1) esa rama
    // se salta a proposito.
    private PluginCall crearLlamadaAddWatcher(String backgroundMessage) {
        JSObject data = new JSObject();
        data.put("requestPermissions", true);
        if (backgroundMessage != null) {
            data.put("backgroundMessage", backgroundMessage);
            data.put("backgroundTitle", "titulo de prueba");
        }
        return new PluginCall(
                mock(MessageHandler.class), "BackgroundGeolocation", "cb-" + System.nanoTime(), "addWatcher", data
        );
    }

    // Cuenta directamente el HashSet privado de watchers de la instancia del
    // Service creada en @Before (fresca en cada test) -- mas confiable que
    // los contadores estaticos de DiagnosticoNativo para aislar pruebas
    // entre si.
    private int cantidadWatchers() throws Exception {
        Field campo = BackgroundGeolocationService.class.getDeclaredField("watchers");
        campo.setAccessible(true);
        HashSet<?> watchers = (HashSet<?>) campo.get(service);
        return watchers.size();
    }

    private Object leerCampoPrivado(String nombre) throws Exception {
        Field campo = BackgroundGeolocationService.class.getDeclaredField(nombre);
        campo.setAccessible(true);
        return campo.get(service);
    }

    // A. Inicio normal: start service (Intent explicito, sin depender solo
    // del bind), bind, addWatcher, exactamente 1 watcher, foreground activo.
    @Test
    public void inicioNormal_unWatcherYForegroundActivo() throws Exception {
        BackgroundGeolocationDePrueba plugin = crearPluginConServicioReal();

        plugin.addWatcher(crearLlamadaAddWatcher("mensaje de prueba"));

        assertEquals(1, cantidadWatchers());
        assertNotNull("startForeground() debe haberse llamado con una notificacion real",
                Shadows.shadowOf(service).getLastForegroundNotification());

        // Punto 1 de Fase 2: addWatcher() debe iniciar explicitamente el
        // Service (startForegroundService en O+), no depender solo del
        // bind existente. Robolectric no adjunta un componente real a
        // partir de este Intent grabado -- la unica instancia viva sigue
        // siendo `service` (ver cantidadWatchers()==1 arriba, sobre esa
        // misma instancia) -- por lo tanto esto tambien demuestra que NO
        // se crea una segunda instancia del Service.
        Intent servicioIniciado = Shadows
                .shadowOf((Application) ApplicationProvider.getApplicationContext())
                .getNextStartedService();
        assertNotNull("addWatcher() debe iniciar explicitamente el Service", servicioIniciado);
        assertEquals(BackgroundGeolocationService.class.getName(), servicioIniciado.getComponent().getClassName());
    }

    // B. Activity unbind/destruida durante grabacion: el Service sigue
    // vivo, el watcher sigue activo, LocationUpdates no se cancelan, el
    // PendingIntent sigue registrado.
    @Test
    public void unbindDuranteGrabacion_noDestruyeNada() throws Exception {
        BackgroundGeolocationDePrueba plugin = crearPluginConServicioReal();
        plugin.addWatcher(crearLlamadaAddWatcher("mensaje de prueba"));
        Object pendingIntentAntes = leerCampoPrivado("locationPendingIntent");
        assertNotNull(pendingIntentAntes);

        boolean resultadoOnUnbind = service.onUnbind(new Intent());

        assertFalse("el Service no debe autodetenerse mientras hay grabacion activa",
                Shadows.shadowOf(service).isStoppedBySelf());
        assertEquals(1, cantidadWatchers());
        verify(clienteMock, never()).removeLocationUpdates(any(PendingIntent.class));
        assertSame("el PendingIntent no debe recrearse/limpiarse mientras hay grabacion activa",
                pendingIntentAntes, leerCampoPrivado("locationPendingIntent"));
        assertFalse(resultadoOnUnbind);
    }

    // C. Rebind posterior: se conecta a la misma instancia del Service, no
    // crea un segundo watcher, maxWatchersSimultaneos sigue en 1.
    @Test
    public void rebindPosterior_noCreaSegundoWatcher() throws Exception {
        BackgroundGeolocationDePrueba plugin = crearPluginConServicioReal();
        plugin.addWatcher(crearLlamadaAddWatcher("mensaje de prueba"));
        service.onUnbind(new Intent());

        IBinder binderRebind = service.onBind(new Intent());

        assertSame("el rebind debe devolver la misma instancia de Binder (mismo Service)",
                localBinder, binderRebind);
        assertEquals(1, cantidadWatchers());
    }

    // D. Stop oficial: removeWatcher -> LocationUpdates removidos,
    // foreground detenido, stopSelf ejecutado, el Service termina
    // correctamente.
    @Test
    public void stopOficial_removeWatcherDetieneTodoCorrectamente() throws Exception {
        BackgroundGeolocationDePrueba plugin = crearPluginConServicioReal();
        PluginCall llamada = crearLlamadaAddWatcher("mensaje de prueba");
        plugin.addWatcher(llamada);
        String id = llamada.getCallbackId();

        localBinder.removeWatcher(id);

        assertEquals(0, cantidadWatchers());
        verify(clienteMock).removeLocationUpdates(any(PendingIntent.class));
        assertTrue("debe detener el foreground al quedar sin watchers",
                Shadows.shadowOf(service).isForegroundStopped());
        assertTrue("debe autodetenerse (stopSelf) al quedar sin watchers",
                Shadows.shadowOf(service).isStoppedBySelf());
    }

    // E. onStartCommand: devuelve START_NOT_STICKY, no crea watcher
    // automaticamente (el unico camino para crear un watcher sigue siendo
    // addWatcher(), nunca invocado desde aca).
    @Test
    public void onStartCommand_devuelveStartNotStickyYNoCreaWatcher() throws Exception {
        int resultado = service.onStartCommand(new Intent(), 0, 1);

        assertEquals(Service.START_NOT_STICKY, resultado);
        assertEquals(0, cantidadWatchers());
    }
}
