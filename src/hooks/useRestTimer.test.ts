import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { formatSeconds, notifyRestOver, useRestTimer } from './useRestTimer';
import { useTicker } from './useTicker';

describe('formatSeconds', () => {
  it('formatea como M:SS', () => {
    expect(formatSeconds(0)).toBe('0:00');
    expect(formatSeconds(9)).toBe('0:09');
    expect(formatSeconds(90)).toBe('1:30');
    expect(formatSeconds(600)).toBe('10:00');
  });

  it('trata los negativos como cero', () => {
    expect(formatSeconds(-30)).toBe('0:00');
  });
});

describe('useRestTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('arranca parado', () => {
    const { result } = renderHook(() => useRestTimer({ sound: false, vibration: false }));
    expect(result.current.running).toBe(false);
    expect(result.current.done).toBe(false);
    expect(result.current.remaining).toBe(0);
  });

  it('cuenta atrás y marca el final', () => {
    const { result } = renderHook(() => useRestTimer({ sound: false, vibration: false }));

    act(() => result.current.start(60));
    expect(result.current.remaining).toBe(60);
    expect(result.current.running).toBe(true);
    expect(result.current.total).toBe(60);

    act(() => vi.advanceTimersByTime(30_000));
    expect(result.current.remaining).toBe(30);

    act(() => vi.advanceTimersByTime(30_000));
    expect(result.current.remaining).toBe(0);
    expect(result.current.running).toBe(false);
    expect(result.current.done).toBe(true);
  });

  it('se calcula contra el reloj real, así que no se desfasa si el navegador congela los timers', () => {
    const { result } = renderHook(() => useRestTimer({ sound: false, vibration: false }));
    act(() => result.current.start(120));
    // Un único salto grande equivale a la pantalla apagada un rato.
    act(() => vi.advanceTimersByTime(90_000));
    expect(result.current.remaining).toBe(30);
  });

  it('suma y resta tiempo al descanso en curso', () => {
    const { result } = renderHook(() => useRestTimer({ sound: false, vibration: false }));
    act(() => result.current.start(60));

    act(() => result.current.adjust(30));
    act(() => vi.advanceTimersByTime(0));
    expect(result.current.remaining).toBe(90);
    expect(result.current.total).toBe(90);

    act(() => result.current.adjust(-60));
    act(() => vi.advanceTimersByTime(0));
    expect(result.current.remaining).toBe(30);
  });

  it('revive un descanso ya agotado al sumar tiempo', () => {
    const { result } = renderHook(() => useRestTimer({ sound: false, vibration: false }));
    act(() => result.current.start(10));
    // Se agota y pasa un buen rato antes de pulsar "+30s".
    act(() => vi.advanceTimersByTime(60_000));
    expect(result.current.done).toBe(true);

    act(() => result.current.adjust(30));
    act(() => vi.advanceTimersByTime(0));
    expect(result.current.remaining).toBe(30);
    expect(result.current.running).toBe(true);
  });

  it('nunca deja el descanso en tiempo negativo', () => {
    const { result } = renderHook(() => useRestTimer({ sound: false, vibration: false }));
    act(() => result.current.start(30));
    act(() => result.current.adjust(-300));
    act(() => vi.advanceTimersByTime(0));
    expect(result.current.remaining).toBe(0);
  });

  it('ignora ajustes si no hay descanso en marcha', () => {
    const { result } = renderHook(() => useRestTimer({ sound: false, vibration: false }));
    act(() => result.current.adjust(30));
    expect(result.current.running).toBe(false);
    expect(result.current.remaining).toBe(0);
  });

  it('para y limpia el descanso', () => {
    const { result } = renderHook(() => useRestTimer({ sound: false, vibration: false }));
    act(() => result.current.start(60));
    act(() => result.current.stop());
    expect(result.current.running).toBe(false);
    expect(result.current.done).toBe(false);
    expect(result.current.total).toBe(0);
  });

  it('redondea y protege duraciones absurdas', () => {
    const { result } = renderHook(() => useRestTimer({ sound: false, vibration: false }));
    act(() => result.current.start(0));
    expect(result.current.total).toBe(1);
    act(() => result.current.start(-50));
    expect(result.current.total).toBe(1);
  });

  it('vibra una sola vez al terminar', () => {
    const vibrate = vi.fn();
    vi.stubGlobal('navigator', { ...navigator, vibrate });

    const { result } = renderHook(() => useRestTimer({ sound: false, vibration: true }));
    act(() => result.current.start(5));
    act(() => vi.advanceTimersByTime(5_000));
    expect(vibrate).toHaveBeenCalledTimes(1);

    // Seguir avanzando no repite el aviso.
    act(() => vi.advanceTimersByTime(5_000));
    expect(vibrate).toHaveBeenCalledTimes(1);

    vi.unstubAllGlobals();
  });

  it('vuelve a avisar si se añade tiempo tras el aviso', () => {
    const vibrate = vi.fn();
    vi.stubGlobal('navigator', { ...navigator, vibrate });

    const { result } = renderHook(() => useRestTimer({ sound: false, vibration: true }));
    act(() => result.current.start(5));
    act(() => vi.advanceTimersByTime(5_000));
    expect(vibrate).toHaveBeenCalledTimes(1);

    act(() => result.current.adjust(30));
    act(() => vi.advanceTimersByTime(30_000));
    expect(vibrate).toHaveBeenCalledTimes(2);

    vi.unstubAllGlobals();
  });

  it('no vibra si el aviso está desactivado', () => {
    const vibrate = vi.fn();
    vi.stubGlobal('navigator', { ...navigator, vibrate });

    const { result } = renderHook(() => useRestTimer({ sound: false, vibration: false }));
    act(() => result.current.start(2));
    act(() => vi.advanceTimersByTime(2_000));
    expect(vibrate).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });
});

describe('notifyRestOver', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('no propaga el error si vibrate lanza', () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      vibrate: () => {
        throw new Error('bloqueado');
      },
    });
    expect(() => notifyRestOver({ sound: false, vibration: true })).not.toThrow();
  });

  it('no propaga el error si el audio no está disponible', () => {
    vi.stubGlobal('window', { ...window, AudioContext: undefined, webkitAudioContext: undefined });
    expect(() => notifyRestOver({ sound: true, vibration: false })).not.toThrow();
  });

  it('emite un pitido cuando hay AudioContext', () => {
    const start = vi.fn();
    const stop = vi.fn();
    const close = vi.fn();
    // oscillator.connect(gain) devuelve el nodo gain, que a su vez se conecta
    // al destino: el mock tiene que reproducir ese encadenado.
    const gain = {
      gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      connect: vi.fn(),
    };
    const connect = vi.fn(() => gain);
    // `new AudioContext()` necesita un constructor real: una arrow function
    // devolvería el objeto sin ejecutar nada de lo que aquí se comprueba.
    const ctor = vi.fn(function AudioContextMock(this: Record<string, unknown>) {
      this.currentTime = 0;
      this.destination = {};
      this.close = close;
      this.createOscillator = () => ({ type: '', frequency: { value: 0 }, connect, start, stop });
      this.createGain = () => gain;
    });
    vi.stubGlobal('window', { ...window, AudioContext: ctor });

    notifyRestOver({ sound: true, vibration: false });
    expect(ctor).toHaveBeenCalled();
    expect(start).toHaveBeenCalled();
    expect(stop).toHaveBeenCalled();
  });
});

describe('useTicker', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('avanza mientras está activo', () => {
    const { result } = renderHook(() => useTicker(true, 1000));
    const first = result.current;
    act(() => vi.advanceTimersByTime(3_000));
    expect(result.current).toBeGreaterThan(first);
  });

  it('se detiene si no está activo', () => {
    const { result } = renderHook(() => useTicker(false, 1000));
    const first = result.current;
    act(() => vi.advanceTimersByTime(5_000));
    expect(result.current).toBe(first);
  });

  it('reanuda al volver a activarse', () => {
    const { result, rerender } = renderHook(({ active }) => useTicker(active, 1000), {
      initialProps: { active: false },
    });
    const first = result.current;
    act(() => vi.advanceTimersByTime(5_000));
    rerender({ active: true });
    act(() => vi.advanceTimersByTime(1_000));
    expect(result.current).toBeGreaterThan(first);
  });
});
