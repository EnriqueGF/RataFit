import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useWakeLock } from './useWakeLock';

function mockWakeLock() {
  const release = vi.fn(async () => undefined);
  const request = vi.fn(async () => ({ release, addEventListener: vi.fn() }));
  Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });
  return { request, release };
}

afterEach(() => {
  Reflect.deleteProperty(navigator, 'wakeLock');
});

describe('useWakeLock', () => {
  it('pide mantener la pantalla encendida y la suelta al desactivarse', async () => {
    const { request, release } = mockWakeLock();
    const { rerender } = renderHook(({ on }) => useWakeLock(on), { initialProps: { on: true } });
    await vi.waitFor(() => expect(request).toHaveBeenCalledWith('screen'));
    rerender({ on: false });
    await vi.waitFor(() => expect(release).toHaveBeenCalled());
  });

  it('no pide nada si está desactivado', () => {
    const { request } = mockWakeLock();
    renderHook(() => useWakeLock(false));
    expect(request).not.toHaveBeenCalled();
  });

  it('no falla en navegadores sin la API', () => {
    expect(() => renderHook(() => useWakeLock(true))).not.toThrow();
  });
});
