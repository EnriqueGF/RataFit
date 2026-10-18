import { useEffect } from 'react';

/**
 * Mantiene la pantalla encendida mientras `enabled` sea true. Con la pantalla
 * apagada el navegador congela los temporizadores y el aviso de fin de
 * descanso no llega. El sistema suelta el bloqueo al pasar a segundo plano,
 * así que se vuelve a pedir al regresar.
 */
export function useWakeLock(enabled: boolean): void {
  useEffect(() => {
    if (!enabled || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const acquire = async () => {
      if (document.visibilityState !== 'visible' || sentinel) return;
      try {
        const lock = await navigator.wakeLock.request('screen');
        if (cancelled) {
          void lock.release();
          return;
        }
        sentinel = lock;
        lock.addEventListener('release', () => {
          if (sentinel === lock) sentinel = null;
        });
      } catch {
        // Batería baja o sin permiso: la app sigue funcionando sin bloqueo.
      }
    };

    void acquire();
    const onVisibility = () => void acquire();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      void sentinel?.release();
      sentinel = null;
    };
  }, [enabled]);
}
