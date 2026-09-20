import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { createInitialState, reducer, type AppState } from '../state/store';
import { ExerciseMedia } from '../components/ExerciseMedia';

const START = 1_700_000_000_000;

/** Estado con el cuestionario inicial ya respondido. */
function configured(): AppState {
  return reducer(createInitialState(START), { type: 'profile/skip' });
}

function stateWith(...actions: Parameters<typeof reducer>[1][]): AppState {
  return actions.reduce(reducer, configured());
}

/** Cambia de pestaña por su etiqueta accesible ("Ir a Entreno"). */
const goTo = async (user: ReturnType<typeof userEvent.setup>, label: string) =>
  user.click(screen.getByRole('button', { name: new RegExp(`^Ir a ${label}$`, 'i') }));

beforeEach(() => localStorage.clear());

describe('cronómetro de descanso en la sesión', () => {
  it('arranca solo al registrar una serie efectiva y se puede alargar o cerrar', async () => {
    const user = userEvent.setup();
    render(<App initialState={stateWith({ type: 'session/start', dayId: 'day-1', now: START })} />);
    await goTo(user, 'ENTRENO');
    await user.click(screen.getByRole('button', { name: /Press banca con barra/ }));

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /OK/ }));

    const bar = screen.getByRole('status');
    expect(bar).toBeInTheDocument();

    await user.click(within(bar).getByRole('button', { name: /\+30s/ }));
    await user.click(within(bar).getByRole('button', { name: '✕' }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('permite lanzar el descanso a mano desde el ejercicio', async () => {
    const user = userEvent.setup();
    render(<App initialState={stateWith({ type: 'session/start', dayId: 'day-1', now: START })} />);
    await goTo(user, 'ENTRENO');
    await user.click(screen.getByRole('button', { name: /Press banca con barra/ }));

    await user.click(screen.getByRole('button', { name: /Descanso 3:00/ }));
    expect(screen.getByRole('status')).toHaveTextContent('3:00');
  });

  it('no arranca el descanso si el ajuste está desactivado', async () => {
    const user = userEvent.setup();
    render(
      <App
        initialState={stateWith(
          { type: 'settings/update', patch: { autoStartRest: false } },
          { type: 'session/start', dayId: 'day-1', now: START },
        )}
      />,
    );
    await goTo(user, 'ENTRENO');
    await user.click(screen.getByRole('button', { name: /Press banca con barra/ }));
    await user.click(screen.getByRole('button', { name: /OK/ }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

describe('flujo completo de un entrenamiento', () => {
  it('entrena, progresa la carga y lo refleja en la siguiente sesión', async () => {
    const user = userEvent.setup();
    render(<App initialState={configured()} />);

    // 1ª sesión: completar el tope del rango en el press banca.
    await user.click(screen.getByRole('button', { name: /Empezar entreno/ }));
    await user.click(screen.getByRole('button', { name: /Press banca con barra/ }));

    const weight = screen.getByLabelText('Peso de la siguiente serie');
    await user.clear(weight);
    await user.type(weight, '100');
    const reps = screen.getByLabelText('Repeticiones de la siguiente serie');
    await user.clear(reps);
    await user.type(reps, '10');
    await user.click(screen.getByRole('button', { name: /OK/ }));

    await user.click(screen.getByRole('button', { name: /Terminar/ }));
    await user.click(screen.getByRole('button', { name: /Confirmar/ }));

    // 2ª sesión del mismo día: la app propone más peso.
    await goTo(user, 'HOY');
    await user.click(screen.getByRole('button', { name: /Empezar entreno/ }));
    await user.click(screen.getByRole('button', { name: /Press banca con barra/ }));

    // Ahora que conoce el peso de trabajo, la app antepone las aproximaciones:
    // la primera es el 40 % de los 102,5 kg propuestos.
    expect(screen.getByLabelText('Peso de la siguiente serie')).toHaveValue(40);
    expect(screen.getByText(/aproximación/)).toBeInTheDocument();

    // Al despachar las tres aproximaciones aparece la serie efectiva con la
    // carga progresada.
    for (const expected of [40, 62.5, 82.5]) {
      expect(screen.getByLabelText('Peso de la siguiente serie')).toHaveValue(expected);
      await user.click(screen.getByRole('button', { name: /OK/ }));
    }
    expect(screen.getByLabelText('Peso de la siguiente serie')).toHaveValue(102.5);
    expect(screen.queryByText(/aproximación/)).not.toBeInTheDocument();
  });

  it('las series de la sesión anterior alimentan las marcas personales', async () => {
    const user = userEvent.setup();
    render(
      <App
        initialState={stateWith(
          { type: 'session/start', dayId: 'day-1', now: START },
          {
            type: 'session/logSet',
            exerciseId: 'bench-press',
            set: { weight: 100, reps: 5, rir: 0, technique: 'straight', warmup: false },
            now: START + 1,
          },
          { type: 'session/finish', now: START + 1000 },
        )}
      />,
    );
    await goTo(user, 'PROGRESO');
    // Epley con 5 reps: 100 * (1 + 5/30) ≈ 117
    expect(screen.getByText('117 kg 1RM')).toBeInTheDocument();
  });
});

describe('superseries', () => {
  it('indica con qué ejercicio se empareja y cómo ejecutarla', async () => {
    const user = userEvent.setup();
    render(<App initialState={stateWith({ type: 'session/start', dayId: 'day-1', now: START })} />);
    await goTo(user, 'ENTRENO');

    // En el DÍA A, laterales y tríceps comparten el grupo A1.
    const header = screen.getByRole('button', { name: /Elevaciones laterales/ });
    expect(header).toHaveTextContent('SUPERSERIE');

    await user.click(header);
    expect(screen.getByText(/Superserie con/)).toHaveTextContent(
      'Extensión de tríceps en polea',
    );
  });

  it('no marca como superserie un ejercicio suelto', async () => {
    const user = userEvent.setup();
    render(<App initialState={stateWith({ type: 'session/start', dayId: 'day-1', now: START })} />);
    await goTo(user, 'ENTRENO');

    const header = screen.getByRole('button', { name: /Press banca con barra/ });
    expect(header).not.toHaveTextContent('SUPERSERIE');
    await user.click(header);
    expect(screen.queryByText(/Superserie con/)).not.toBeInTheDocument();
  });
});

describe('ExerciseMedia', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const FRAMES = ['https://example.test/0.jpg', 'https://example.test/1.jpg'];

  it('muestra un marcador si la imagen no carga', () => {
    render(<ExerciseMedia frames={['https://example.invalid/roto.jpg']} alt="Prueba" />);
    const img = screen.getByAltText('Prueba') as HTMLImageElement;
    act(() => {
      fireEvent.error(img);
    });
    expect(img.src).toContain('data:image/svg+xml');
    expect(decodeURIComponent(img.src)).toContain('SIN IMAGEN');
  });

  it('no entra en bucle si el marcador también fallara', () => {
    render(<ExerciseMedia frames={['https://example.invalid/roto.jpg']} alt="Prueba" />);
    const img = screen.getByAltText('Prueba') as HTMLImageElement;
    act(() => {
      fireEvent.error(img);
    });
    const first = img.src;
    act(() => {
      fireEvent.error(img);
    });
    expect(img.src).toBe(first);
  });

  it('sigue animando con el fotograma bueno si solo falla uno', () => {
    vi.useFakeTimers();
    render(<ExerciseMedia frames={FRAMES} alt="Demo" intervalMs={500} />);
    const img = screen.getByAltText('Demo') as HTMLImageElement;

    // Falla el primer fotograma: la vista pasa al segundo y no vuelve al roto.
    act(() => {
      fireEvent.error(img);
    });
    expect(img.src).toBe(FRAMES[1]);
    act(() => vi.advanceTimersByTime(1500));
    expect(img.src).toBe(FRAMES[1]);
    vi.useRealTimers();
  });

  it('usa el marcador si el ejercicio no tiene imágenes', () => {
    render(<ExerciseMedia frames={[]} alt="Vacío" />);
    expect((screen.getByAltText('Vacío') as HTMLImageElement).src).toContain('data:image/svg+xml');
  });

  it('carga las imágenes de forma diferida', () => {
    render(<ExerciseMedia frames={FRAMES} alt="Demo" />);
    expect(screen.getByAltText('Demo')).toHaveAttribute('loading', 'lazy');
  });

  it('alterna los fotogramas para mostrar el movimiento', () => {
    vi.useFakeTimers();
    render(<ExerciseMedia frames={FRAMES} alt="Demo" intervalMs={500} />);
    const img = screen.getByAltText('Demo') as HTMLImageElement;
    expect(img.src).toBe(FRAMES[0]);
    act(() => vi.advanceTimersByTime(500));
    expect(img.src).toBe(FRAMES[1]);
    act(() => vi.advanceTimersByTime(500));
    expect(img.src).toBe(FRAMES[0]);
    vi.useRealTimers();
  });

  it('se queda en el primer fotograma si no debe animarse', () => {
    vi.useFakeTimers();
    render(<ExerciseMedia frames={FRAMES} alt="Miniatura" animate={false} />);
    const img = screen.getByAltText('Miniatura') as HTMLImageElement;
    act(() => vi.advanceTimersByTime(5000));
    expect(img.src).toBe(FRAMES[0]);
    vi.useRealTimers();
  });
});

describe('accesibilidad básica', () => {
  it('el modal se anuncia como diálogo y se cierra con el botón', async () => {
    const user = userEvent.setup();
    render(<App initialState={stateWith({ type: 'session/start', dayId: 'day-1', now: START })} />);
    await goTo(user, 'ENTRENO');
    await user.click(screen.getByRole('button', { name: /Añadir ejercicio suelto/ }));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    await user.click(within(dialog).getByRole('button', { name: 'Cerrar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('el modal bloquea el scroll del fondo mientras está abierto', async () => {
    const user = userEvent.setup();
    render(<App initialState={stateWith({ type: 'session/start', dayId: 'day-1', now: START })} />);
    await goTo(user, 'ENTRENO');

    await user.click(screen.getByRole('button', { name: /Añadir ejercicio suelto/ }));
    expect(document.body.style.overflow).toBe('hidden');
    await user.keyboard('{Escape}');
    expect(document.body.style.overflow).not.toBe('hidden');
  });

  it('la pestaña activa se marca con aria-current', async () => {
    const user = userEvent.setup();
    render(<App initialState={configured()} />);
    await goTo(user, 'PROGRESO');
    const nav = screen.getByRole('navigation', { name: 'Secciones' });
    const current = within(nav)
      .getAllByRole('button')
      .filter((b) => b.getAttribute('aria-current') === 'page');
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent(/Progreso/i);
  });
});

describe('título del documento', () => {
  it('refleja el estado del cronómetro', async () => {
    const user = userEvent.setup();
    render(<App initialState={stateWith({ type: 'session/start', dayId: 'day-1', now: START })} />);
    await goTo(user, 'ENTRENO');
    expect(document.title).toContain('▶');

    await user.click(screen.getByRole('button', { name: /Pausar/ }));
    expect(document.title).toContain('⏸');

    await user.click(screen.getByRole('button', { name: /Descartar sesión/ }));
    expect(document.title).toBe('RataFit');
  });
});
