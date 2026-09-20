import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { createInitialState, reducer } from '../state/store';

const START = 1_700_000_000_000;

/**
 * La pantalla HOY propone el día que toca por calendario, así que el resto de
 * tests podría pasar un domingo y fallar un miércoles. Aquí se fija la fecha a
 * propósito para comprobar que la app se comporta igual cualquier día.
 */
describe('independencia del día de la semana', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.useRealTimers());

  const configured = () => reducer(createInitialState(START), { type: 'profile/skip' });

  // 2026-09-21 fue lunes; se recorre la semana entera desde ahí.
  const days = [
    ['lunes', '2026-09-21', 'DÍA A'],
    ['martes', '2026-09-22', 'DÍA A'],
    ['miércoles', '2026-09-23', 'DÍA B'],
    ['jueves', '2026-09-24', 'DÍA A'],
    ['viernes', '2026-09-25', 'DÍA C'],
    ['sábado', '2026-09-26', 'DÍA A'],
    ['domingo', '2026-09-27', 'DÍA A'],
  ] as const;

  for (const [name, date, expected] of days) {
    it(`un ${name} propone ${expected} y deja elegir otro día`, async () => {
      vi.setSystemTime(new Date(`${date}T12:00:00`));
      const user = userEvent.setup();
      render(<App initialState={configured()} />);

      // El día propuesto es el que toca por calendario.
      expect(screen.getByRole('heading', { name: new RegExp(expected) })).toBeInTheDocument();

      // Y siempre se puede cambiar a mano, sea cual sea el día de hoy.
      const selector = screen.getByRole('group', { name: 'Elegir día' });
      await user.click(within(selector).getByRole('button', { name: /Día c/i }));
      expect(screen.getByRole('heading', { name: /DÍA C/ })).toBeInTheDocument();
    });
  }

  it('el press de banca está disponible eligiendo el DÍA A cualquier día', async () => {
    vi.setSystemTime(new Date('2026-09-23T12:00:00'));
    const user = userEvent.setup();
    render(<App initialState={configured()} />);

    const selector = screen.getByRole('group', { name: 'Elegir día' });
    await user.click(within(selector).getByRole('button', { name: /Día a/i }));
    expect(screen.getByText('Press banca con barra')).toBeInTheDocument();
  });
});
