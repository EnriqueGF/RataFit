import { useCallback, useEffect, useRef, useState } from 'react';

export interface RestTimer {
  /** Segundos restantes; 0 si no hay descanso en marcha. */
  remaining: number;
  /** Duración total del descanso actual, para dibujar la barra. */
  total: number;
  running: boolean;
  /** true cuando el descanso ha llegado a cero y aún no se ha cerrado. */
  done: boolean;
  start: (seconds: number) => void;
  stop: () => void;
  /** Suma (o resta, con valores negativos) segundos al descanso en curso. */
  adjust: (seconds: number) => void;
}

export interface RestTimerOptions {
  sound?: boolean;
  vibration?: boolean;
}

/**
 * Cronómetro de descanso entre series. Calcula el tiempo restante contra el
 * reloj real en vez de acumular ticks, para que siga siendo exacto aunque el
 * navegador congele los temporizadores con la pantalla apagada.
 */
export function useRestTimer({ sound = true, vibration = true }: RestTimerOptions = {}): RestTimer {
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [total, setTotal] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const notifiedRef = useRef(false);

  useEffect(() => {
    if (endsAt === null) {
      setRemaining(0);
      return;
    }
    const tick = () => {
      const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0 && !notifiedRef.current) {
        notifiedRef.current = true;
        notifyRestOver({ sound, vibration });
      }
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [endsAt, sound, vibration]);

  const start = useCallback((seconds: number) => {
    const safe = Math.max(1, Math.round(seconds));
    notifiedRef.current = false;
    setTotal(safe);
    setEndsAt(Date.now() + safe * 1000);
  }, []);

  const stop = useCallback(() => {
    notifiedRef.current = false;
    setEndsAt(null);
    setTotal(0);
    setRemaining(0);
  }, []);

  const adjust = useCallback((seconds: number) => {
    setEndsAt((current) => {
      if (current === null) return current;
      const now = Date.now();
      // Si el descanso ya terminó, sumar tiempo cuenta desde ahora: partir del
      // final original dejaría el temporizador en cero y el botón no haría nada.
      const from = Math.max(now, current);
      const next = from + seconds * 1000;
      if (next > now) notifiedRef.current = false;
      return Math.max(now, next);
    });
    setTotal((current) => Math.max(1, current + seconds));
  }, []);

  return {
    remaining,
    total,
    running: endsAt !== null && remaining > 0,
    done: endsAt !== null && remaining === 0,
    start,
    stop,
    adjust,
  };
}

/** Aviso de fin de descanso: pitido corto y vibración, si están disponibles. */
export function notifyRestOver({ sound, vibration }: RestTimerOptions): void {
  if (vibration && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate([120, 60, 120]);
    } catch {
      // Algunos navegadores lanzan si la página no está en primer plano.
    }
  }
  if (!sound) return;
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'square';
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.06, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.35);
    oscillator.onended = () => void ctx.close();
  } catch {
    // Sin permiso de audio todavía: el aviso visual y la vibración bastan.
  }
}

/** Formatea segundos como M:SS. */
export function formatSeconds(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}
