import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { createInitialState, reducer } from '../state/store';

const START = 1_700_000_000_000;

type User = ReturnType<typeof userEvent.setup>;

const next = (user: User) => user.click(screen.getByRole('button', { name: /Siguiente/ }));
const back = (user: User) => user.click(screen.getByRole('button', { name: /Atrás/ }));

/** Avanza el cuestionario hasta el paso indicado (0-based). */
async function goToStep(user: User, step: number) {
  for (let i = 0; i < step; i += 1) await next(user);
}

beforeEach(() => localStorage.clear());

describe('cuestionario inicial', () => {
  it('se muestra en una instalación nueva, antes que la app normal', () => {
    render(<App initialState={createInitialState(START)} />);
    expect(screen.getByText('CONFIGURACIÓN INICIAL')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Material/ })).toBeInTheDocument();
    // La navegación normal todavía no está disponible.
    expect(screen.queryByRole('navigation', { name: 'Secciones' })).not.toBeInTheDocument();
  });

  it('no se muestra si el cuestionario ya se respondió', () => {
    const configured = reducer(createInitialState(START), { type: 'profile/skip' });
    render(<App initialState={configured} />);
    expect(screen.queryByText('CONFIGURACIÓN INICIAL')).not.toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Secciones' })).toBeInTheDocument();
  });

  it('permite saltarlo y quedarse con la rutina por defecto', async () => {
    const user = userEvent.setup();
    render(<App initialState={createInitialState(START)} />);

    await user.click(screen.getByRole('button', { name: /Usar la rutina por defecto/ }));
    expect(screen.getByRole('navigation', { name: 'Secciones' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /RUTINA/ }));
    expect(screen.getByLabelText('Nombre')).toHaveValue('FULLBODY 3D · PECHO + ESPALDA');
  });

  it('recorre los cinco pasos hacia delante y hacia atrás', async () => {
    const user = userEvent.setup();
    render(<App initialState={createInitialState(START)} />);

    for (const label of ['Ejercicios', 'Objetivo', 'Calendario', 'Resumen']) {
      await next(user);
      expect(screen.getByRole('heading', { name: new RegExp(label) })).toBeInTheDocument();
    }
    await back(user);
    expect(screen.getByRole('heading', { name: /Calendario/ })).toBeInTheDocument();
  });

  it('exige elegir material antes de continuar', async () => {
    const user = userEvent.setup();
    render(<App initialState={createInitialState(START)} />);

    // Se desmarcan todos los materiales preseleccionados.
    for (const label of ['Barra', 'Mancuerna', 'Máquina', 'Polea', 'Multipower', 'Peso corporal']) {
      const chip = screen.getByRole('button', { name: label });
      if (chip.getAttribute('aria-pressed') === 'true') await user.click(chip);
    }
    expect(screen.getByRole('button', { name: /Siguiente/ })).toBeDisabled();
    expect(screen.getByText(/Marca al menos un tipo de material/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Mancuerna' }));
    expect(screen.getByRole('button', { name: /Siguiente/ })).toBeEnabled();
  });

  it('avisa de los grupos que se quedan sin cubrir', async () => {
    const user = userEvent.setup();
    render(<App initialState={createInitialState(START)} />);

    for (const label of ['Barra', 'Máquina', 'Polea', 'Multipower', 'Mancuerna']) {
      const chip = screen.getByRole('button', { name: label });
      if (chip.getAttribute('aria-pressed') === 'true') await user.click(chip);
    }
    // Solo queda peso corporal: no hay con qué entrenar pierna.
    expect(screen.getByText(/Sin material para/)).toHaveTextContent('Cuádriceps');
  });

  it('solo ofrece ejercicios del material seleccionado', async () => {
    const user = userEvent.setup();
    render(<App initialState={createInitialState(START)} />);

    for (const label of ['Barra', 'Máquina', 'Polea', 'Multipower', 'Peso corporal']) {
      const chip = screen.getByRole('button', { name: label });
      if (chip.getAttribute('aria-pressed') === 'true') await user.click(chip);
    }
    await next(user);

    // Con solo mancuernas, el press de banca con barra no aparece.
    expect(screen.getByText('Press banca con mancuernas')).toBeInTheDocument();
    expect(screen.queryByText('Press banca con barra')).not.toBeInTheDocument();
  });

  it('descarta un ejercicio y no aparece en la rutina generada', async () => {
    const user = userEvent.setup();
    render(<App initialState={createInitialState(START)} />);
    await goToStep(user, 1);

    await user.click(screen.getByRole('button', { name: 'Descartar Press banca con barra' }));
    await goToStep(user, 3);

    expect(screen.getByRole('heading', { name: /Resumen/ })).toBeInTheDocument();
    expect(screen.queryByText(/^Press banca con barra —/)).not.toBeInTheDocument();
  });

  it('marcar un ejercicio como deseado lo mete en la rutina', async () => {
    const user = userEvent.setup();
    render(<App initialState={createInitialState(START)} />);
    await goToStep(user, 1);

    await user.click(screen.getByRole('button', { name: 'Quiero hacer Hip thrust' }));
    await goToStep(user, 3);

    expect(screen.getByText(/^Hip thrust —/)).toBeInTheDocument();
  });

  it('querer y descartar el mismo ejercicio son excluyentes', async () => {
    const user = userEvent.setup();
    render(<App initialState={createInitialState(START)} />);
    await goToStep(user, 1);

    const want = screen.getByRole('button', { name: 'Quiero hacer Hip thrust' });
    const skip = screen.getByRole('button', { name: 'Descartar Hip thrust' });

    await user.click(want);
    expect(want).toHaveAttribute('aria-pressed', 'true');
    await user.click(skip);
    expect(skip).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Quiero hacer Hip thrust' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('cambia el número de días y se refleja en el resumen', async () => {
    const user = userEvent.setup();
    render(<App initialState={createInitialState(START)} />);
    await goToStep(user, 3);

    await user.click(screen.getByRole('button', { name: '4 días' }));
    await next(user);

    expect(screen.getByText(/DÍA D/)).toBeInTheDocument();
  });

  it('limita los días de la semana al número de sesiones elegidas', async () => {
    const user = userEvent.setup();
    render(<App initialState={createInitialState(START)} />);
    await goToStep(user, 3);

    await user.click(screen.getByRole('button', { name: '2 días' }));
    // Con dos sesiones y dos días ya marcados, el resto queda bloqueado.
    expect(screen.getByRole('button', { name: 'SÁB' })).toBeDisabled();
  });

  it('cambia las prioridades y lo refleja en el nombre de la rutina', async () => {
    const user = userEvent.setup();
    render(<App initialState={createInitialState(START)} />);
    await goToStep(user, 2);

    const panel = screen.getByText('¿Qué quieres priorizar?').parentElement as HTMLElement;
    await user.click(within(panel).getByRole('button', { name: 'Espalda' }));
    await user.click(within(panel).getByRole('button', { name: 'Cuádriceps' }));

    await goToStep(user, 2);
    await user.click(screen.getByRole('button', { name: /Crear mi rutina/ }));
    await user.click(screen.getByRole('button', { name: /RUTINA/ }));
    expect(screen.getByLabelText('Nombre')).toHaveValue('FULLBODY 3D · PECHO + CUÁDRICEPS');
  });

  it('explica qué implica cada nivel de experiencia', async () => {
    const user = userEvent.setup();
    render(<App initialState={createInitialState(START)} />);
    await goToStep(user, 2);

    await user.click(screen.getByRole('button', { name: /Empiezo ahora/ }));
    expect(screen.getByText(/primero técnica y constancia/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Avanzado/ }));
    expect(screen.getByText(/Más volumen/)).toBeInTheDocument();
  });

  it('crea la rutina y entra en la app', async () => {
    const user = userEvent.setup();
    render(<App initialState={createInitialState(START)} />);
    await goToStep(user, 4);

    await user.click(screen.getByRole('button', { name: /Crear mi rutina/ }));
    expect(screen.getByRole('navigation', { name: 'Secciones' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /DÍA A/ })).toBeInTheDocument();
  });

  it('la rutina creada se puede entrenar directamente', async () => {
    const user = userEvent.setup();
    render(<App initialState={createInitialState(START)} />);
    await goToStep(user, 4);
    await user.click(screen.getByRole('button', { name: /Crear mi rutina/ }));

    await user.click(screen.getAllByRole('button', { name: /Empezar entreno/ })[0]);
    expect(screen.getByText(/DÍA A.*EN MARCHA/)).toBeInTheDocument();
    // Y los ejercicios generados están ahí para registrar series.
    expect(screen.getAllByRole('button', { name: /series/ }).length).toBeGreaterThan(0);
  });

  it('se puede rehacer desde Ajustes conservando el histórico', async () => {
    const user = userEvent.setup();
    // Una sesión ya terminada en el histórico.
    const withHistory = [
      { type: 'profile/skip' as const },
      { type: 'session/start' as const, dayId: 'day-1', now: START },
      {
        type: 'session/logSet' as const,
        exerciseId: 'bench-press',
        set: { weight: 100, reps: 8, rir: 1, technique: 'straight' as const, warmup: false },
        now: START + 1,
      },
      { type: 'session/finish' as const, now: START + 1000 },
    ].reduce(reducer, createInitialState(START));

    render(<App initialState={withHistory} />);
    await user.click(screen.getByRole('button', { name: /AJUSTES/ }));
    await user.click(screen.getByRole('button', { name: /Rehacer el cuestionario/ }));

    expect(screen.getByText('CONFIGURACIÓN INICIAL')).toBeInTheDocument();
    await goToStep(user, 4);
    await user.click(screen.getByRole('button', { name: /Crear mi rutina/ }));

    // El histórico y los récords siguen ahí.
    await user.click(screen.getByRole('button', { name: /PROGRESO/ }));
    expect(screen.getByRole('heading', { name: /Récords personales/ })).toBeInTheDocument();
    expect(screen.getByText(/kg 1RM/)).toBeInTheDocument();
  });

  it('al rehacerlo recuerda las respuestas anteriores', async () => {
    const user = userEvent.setup();
    render(<App initialState={createInitialState(START)} />);

    // Primera vez: se entrena 4 días.
    await goToStep(user, 3);
    await user.click(screen.getByRole('button', { name: '4 días' }));
    await next(user);
    await user.click(screen.getByRole('button', { name: /Crear mi rutina/ }));

    await user.click(screen.getByRole('button', { name: /AJUSTES/ }));
    await user.click(screen.getByRole('button', { name: /Rehacer el cuestionario/ }));
    await goToStep(user, 3);
    expect(screen.getByRole('button', { name: '4 días' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('el perfil sobrevive a recargar la app', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<App initialState={createInitialState(START)} />);
    await user.click(screen.getByRole('button', { name: /Usar la rutina por defecto/ }));
    unmount();

    render(<App />);
    expect(screen.queryByText('CONFIGURACIÓN INICIAL')).not.toBeInTheDocument();
  });
});
