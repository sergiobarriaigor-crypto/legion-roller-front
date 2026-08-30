package com.legionroller.app;

import java.util.ArrayList;
import java.util.List;

// Instrumentacion diagnostica (auditoria GPS V2, ver conversacion de diseño)
// -- registra unicamente las transiciones onPause()/onResume() de
// MainActivity (ver esa clase). Deliberadamente llamado "pause/resume de
// MainActivity" y no "foreground/background de la app": esta señal solo
// prueba que la Activity paso por ese punto de su ciclo de vida, NO que el
// proceso completo de Android este suspendido, ni que el WebView haya
// dejado de ejecutar JS -- no hay que sacar de acá una conclusion mas fuerte
// de la que esta señal realmente entrega (ver diagnostico ruta 103, pedido
// explicito de no sobre-interpretar esto).
//
// Clase separada de DiagnosticoNativo (dentro del parche de
// background-geolocation) a propósito: esta es codigo propio de la app, sin
// relacion con la libreria vendored, para no acoplar un archivo owned a una
// clase que vive dentro de node_modules.
final class DiagnosticoNativoBuffer {
    private DiagnosticoNativoBuffer() {}

    private static final Object lock = new Object();
    // Acotado igual que DiagnosticoNativo -- nunca crece sin limite.
    private static final int LIMITE_EVENTOS = 200;
    private static final List<Object[]> eventosPauseResume = new ArrayList<>();

    static void registrarPauseResume(boolean activo, long horaMs) {
        synchronized (lock) {
            if (eventosPauseResume.size() >= LIMITE_EVENTOS) {
                eventosPauseResume.remove(0);
            }
            eventosPauseResume.add(new Object[]{activo, horaMs});
        }
    }

    // Debe llamarse una unica vez al arrancar una grabacion nueva, mismo
    // criterio de timing que DiagnosticoNativo.reset() -- ver
    // DiagnosticoProveedorPlugin.resetDiagnosticoNativo().
    static void reset() {
        synchronized (lock) {
            eventosPauseResume.clear();
        }
    }

    // Copia inmutable -- nunca la lista interna.
    static List<Object[]> snapshot() {
        synchronized (lock) {
            return new ArrayList<>(eventosPauseResume);
        }
    }
}
