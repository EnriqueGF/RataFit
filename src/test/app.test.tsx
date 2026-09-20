import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { createInitialState, reducer, type AppState } from '../state/store';
import type { LoggedSet } from '../domain/types';

const START = 1_700_000_000_000;

/**
 * Estado de partida para los tests de pantalla: con el cuestionario inicial ya
 * respondido, para que la app arranque directamente en la navegación normal.
 */
function configured(): AppState {
  return reducer(createInitialState(START), { type: 'profile/skip' });
}

function stateWith(...actions: Parameters<typeof reducer>[1][]): AppState {
  return actions.reduce(reducer, configured());
}

function renderApp(initialState: AppState = configured()) {
  return { user: userEvent.setup(), ...render(<App initialState={initialState} />) };
}

const logged = (o: Partial<LoggedSet> = {}): Omit<LoggedSet, 'id' | 'completedAt'> => ({
  reps: 8,
  weight: 60,
  rir: 2,
  technique: 'straight',
  warmup: false,
  ...o,
});

/** Cambia de pestaña por su etiqueta accesible ("Ir a Entreno"). */
const goTo = async (user: ReturnType<typeof userEvent.setup>, label: string) =>
  user.click(screen.getByRole('button', { name: new RegExp(`^Ir a ${label}$`, 'i') }));

beforeEach(() => {
  localStorage.clear();
});

/**
 * Selecciona un día concreto antes de empezar. Sin esto, el día propuesto
 * depende del día real de la semana y el test fallaría un miércoles pero no
 * un domingo.
 */
async function pickDay(user: ReturnType<typeof userEvent.setup>, label: string) {
  const selector = screen.getByRole('group', { name: 'Elegir día' });
  await user.click(within(selector).getByRole('button', { name: new RegExp(label, 'i') }));
}


describe('estructura general', () => {
  it('muestra la marca y las cinco pestañas', () => {
    renderApp();
    expect(screen.getByRole('heading', { name: 'RataFit' })).toBeInTheDocument();
    for (const tab of ['Hoy', 'Entreno', 'Rutina', 'Progreso', 'Ajustes']) {
      expect(screen.getByRole('button', { name: `Ir a ${tab}` })).toBeInTheDocument();
    }
  });

  it('arranca en HOY y permite navegar entre pestañas', async () => {
    const { user } = renderApp();
    expect(screen.getByRole('button', { name: 'Ir a Hoy' })).toHaveAttribute('aria-current', 'page');

    await goTo(user, 'RUTINA');
    expect(screen.getByRole('button', { name: 'Ir a Rutina' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByLabelText('Nombre')).toHaveValue('FULLBODY 3D · PECHO + ESPALDA');

    await goTo(user, 'AJUSTES');
    expect(screen.getByLabelText('Unidad de peso')).toBeInTheDocument();
  });

  it('indica la semana del mesociclo cuando no hay sesión activa', () => {
    renderApp();
    expect(screen.getByText(/SEM 1\/5/)).toBeInTheDocument();
  });
});

describe('pantalla HOY', () => {
  it('muestra el día seleccionado y deja cambiar de día', async () => {
    const { user } = renderApp();
    const selector = screen.getByRole('group', { name: 'Elegir día' });
    expect(within(selector).getAllByRole('button')).toHaveLength(3);

    // El día de partida lo decide el calendario, así que se comprueba que hay
    // uno cualquiera y que al elegir otro el título lo sigue.
    expect(screen.getByRole('heading', { name: /DÍA [ABC]/ })).toBeInTheDocument();
    expect(screen.getByText(/\d+ ejercicios · \d+ series · ~\d+ min/)).toBeInTheDocument();

    await user.click(within(selector).getByRole('button', { name: /Día b/i }));
    expect(screen.getByRole('heading', { name: /DÍA B/ })).toBeInTheDocument();

    await user.click(within(selector).getByRole('button', { name: /Día c/i }));
    expect(screen.getByRole('heading', { name: /DÍA C/ })).toBeInTheDocument();
  });

  it('enseña los ejercicios del día antes de empezar', async () => {
    const { user } = renderApp();
    await pickDay(user, 'Día a');
    expect(screen.getByText('Press banca con barra')).toBeInTheDocument();
    // Con sus series y RIR, como en la ficha previa a la sesión.
    expect(screen.getAllByText(/\d+×\d+–\d+ · RIR \d/).length).toBeGreaterThan(3);
  });

  it('muestra la fase del mesociclo y deja avanzar de semana', async () => {
    const { user } = renderApp();
    const meso = screen.getByRole('heading', { name: 'Mesociclo' }).closest('.panel') as HTMLElement;
    expect(within(meso).getByText('ACUMULACIÓN')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Avanzar de semana/ }));
    expect(screen.getAllByText(/Semana 2\/5/).length).toBeGreaterThan(0);
  });

  it('avisa durante la semana de descarga', async () => {
    const { user } = renderApp(stateWith({ type: 'mesocycle/set', week: 5 }));
    const meso = screen.getByRole('heading', { name: 'Mesociclo' }).closest('.panel') as HTMLElement;
    expect(within(meso).getByText('DESCARGA')).toBeInTheDocument();
    expect(screen.getByText(/Semana de descarga/)).toBeInTheDocument();
    // Al avanzar desde la descarga se reinicia el mesociclo.
    await user.click(screen.getByRole('button', { name: /Avanzar de semana/ }));
    expect(screen.getAllByText(/Semana 1\/5/).length).toBeGreaterThan(0);
  });

  it('muestra el volumen semanal planificado con pecho y espalda destacados', () => {
    renderApp();
    expect(screen.getByRole('heading', { name: /Volumen semanal planificado/ })).toBeInTheDocument();
    const panel = screen.getByRole('heading', { name: /Volumen semanal planificado/ }).closest('.panel') as HTMLElement;
    expect(within(panel).getByText('Pecho')).toBeInTheDocument();
    expect(within(panel).getByText('Espalda')).toBeInTheDocument();
  });

  it('empieza el entreno y salta a la pestaña ENTRENO', async () => {
    const { user } = renderApp();
    await pickDay(user, 'Día a');
    await user.click(screen.getByRole('button', { name: /Empezar entreno/ }));
    expect(screen.getByRole('button', { name: 'Ir a Entreno' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText(/DÍA A.*EN MARCHA/)).toBeInTheDocument();
  });
});

describe('estructura de la pantalla HOY', () => {
  it('pone la acción principal en una barra fija, no una por día', () => {
    renderApp();
    const cta = screen.getByRole('button', { name: /Empezar entreno/ });
    expect(cta).toHaveClass('btn--primary');
    // Un único botón de arranque, dentro de la barra fija.
    expect(screen.getAllByRole('button', { name: /Empezar entreno/ })).toHaveLength(1);
    expect(cta.closest('.cta-bar')).not.toBeNull();
  });

  it('marca el día activo en el selector', async () => {
    const { user } = renderApp();
    const selector = screen.getByRole('group', { name: 'Elegir día' });
    const buttons = within(selector).getAllByRole('button');

    // Sea cual sea el día que proponga el calendario, hay exactamente uno activo.
    const pressed = () => buttons.filter((b) => b.getAttribute('aria-pressed') === 'true');
    expect(pressed()).toHaveLength(1);

    // Y al elegir otro, la marca se mueve a ese.
    const other = buttons.find((b) => b.getAttribute('aria-pressed') === 'false')!;
    await user.click(other);
    expect(other).toHaveAttribute('aria-pressed', 'true');
    expect(pressed()).toHaveLength(1);
  });

  it('destaca los grupos prioritarios en la lista de ejercicios', async () => {
    const { user } = renderApp();
    await pickDay(user, 'Día a');
    // El press de banca es pecho, que viene priorizado por defecto.
    const card = screen.getByText('Press banca con barra').closest('.exercise');
    expect(card).toHaveClass('exercise--priority');
    // La sentadilla (cuádriceps) no lo está.
    expect(screen.getByText('Sentadilla trasera').closest('.exercise')).not.toHaveClass(
      'exercise--priority',
    );
  });
});

describe('sesión de entrenamiento', () => {
  const started = () => stateWith({ type: 'session/start', dayId: 'day-1', now: START });

  it('sin sesión activa invita a arrancar una', async () => {
    const { user } = renderApp();
    await goTo(user, 'ENTRENO');
    expect(screen.getByText(/No hay ningún entrenamiento en curso/)).toBeInTheDocument();
  });

  it('muestra el cronómetro y los ejercicios del día', async () => {
    const { user } = renderApp(started());
    await goTo(user, 'ENTRENO');
    expect(screen.getByText(/DÍA A.*EN MARCHA/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Press banca con barra/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Remo con barra/ })).toBeInTheDocument();
  });

  it('pausa y reanuda la sesión', async () => {
    const { user } = renderApp(started());
    await goTo(user, 'ENTRENO');

    await user.click(screen.getByRole('button', { name: /Pausar/ }));
    expect(screen.getByText(/DÍA A.*EN PAUSA/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Reanudar/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Reanudar/ }));
    expect(screen.getByText(/DÍA A.*EN MARCHA/)).toBeInTheDocument();
  });

  it('despliega un ejercicio y enseña GIF, consignas y tabla de series', async () => {
    const { user } = renderApp(started());
    await goTo(user, 'ENTRENO');
    await user.click(screen.getByRole('button', { name: /Press banca con barra/ }));

    expect(screen.getByAltText('Demostración de Press banca con barra')).toBeInTheDocument();
    expect(screen.getByText(/Escápulas retraídas/)).toBeInTheDocument();
    expect(screen.getByLabelText('Repeticiones de la siguiente serie')).toBeInTheDocument();
  });

  it('registra una serie y la muestra en la tabla', async () => {
    const { user } = renderApp(started());
    await goTo(user, 'ENTRENO');
    await user.click(screen.getByRole('button', { name: /Press banca con barra/ }));

    const weight = screen.getByLabelText('Peso de la siguiente serie');
    await user.clear(weight);
    await user.type(weight, '80');
    const reps = screen.getByLabelText('Repeticiones de la siguiente serie');
    await user.clear(reps);
    await user.type(reps, '10');
    await user.click(screen.getByRole('button', { name: /OK/ }));

    expect(screen.getByLabelText('Peso de la serie 1')).toHaveValue(80);
    expect(screen.getByLabelText('Repeticiones de la serie 1')).toHaveValue(10);
  });

  it('edita y borra una serie ya registrada', async () => {
    const { user } = renderApp(
      stateWith(
        { type: 'session/start', dayId: 'day-1', now: START },
        { type: 'session/logSet', exerciseId: 'bench-press', set: logged(), now: START + 1 },
      ),
    );
    await goTo(user, 'ENTRENO');
    await user.click(screen.getByRole('button', { name: /Press banca con barra/ }));

    const reps = screen.getByLabelText('Repeticiones de la serie 1');
    await user.clear(reps);
    await user.type(reps, '12');
    expect(screen.getByLabelText('Repeticiones de la serie 1')).toHaveValue(12);

    await user.click(screen.getByRole('button', { name: 'Borrar serie 1' }));
    expect(screen.queryByLabelText('Repeticiones de la serie 1')).not.toBeInTheDocument();
  });

  it('cuenta las series efectivas y el tonelaje en la cabecera', async () => {
    const { user } = renderApp(
      stateWith(
        { type: 'session/start', dayId: 'day-1', now: START },
        {
          type: 'session/logSet',
          exerciseId: 'bench-press',
          set: logged({ weight: 100, reps: 10 }),
          now: START + 1,
        },
      ),
    );
    await goTo(user, 'ENTRENO');
    const panel = screen.getByText('Kg totales').closest('.stat-grid') as HTMLElement;
    expect(within(panel).getByText('Kg totales').previousSibling).toHaveTextContent(/1.?000/);
    expect(within(panel).getByText('Series').previousSibling).toHaveTextContent('1');
  });

  it('marca y recupera un ejercicio saltado', async () => {
    const { user } = renderApp(started());
    await goTo(user, 'ENTRENO');
    await user.click(screen.getByRole('button', { name: /Press banca con barra/ }));

    await user.click(screen.getByRole('button', { name: /Saltar/ }));
    expect(screen.getByRole('button', { name: /Recuperar/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Recuperar/ }));
    expect(screen.getByRole('button', { name: /Saltar/ })).toBeInTheDocument();
  });

  it('guarda notas de la sesión', async () => {
    const { user } = renderApp(started());
    await goTo(user, 'ENTRENO');
    const notes = screen.getByPlaceholderText(/Descanso, energía/);
    await user.type(notes, 'Buen día');
    expect(notes).toHaveValue('Buen día');
  });

  it('pide confirmación antes de terminar y archiva la sesión', async () => {
    const { user } = renderApp(
      stateWith(
        { type: 'session/start', dayId: 'day-1', now: START },
        { type: 'session/logSet', exerciseId: 'bench-press', set: logged(), now: START + 1 },
      ),
    );
    await goTo(user, 'ENTRENO');

    await user.click(screen.getByRole('button', { name: /Terminar/ }));
    expect(screen.getByText(/Vas a cerrar la sesión con 1 series/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Confirmar/ }));
    expect(screen.getByText(/No hay ningún entrenamiento en curso/)).toBeInTheDocument();

    await goTo(user, 'PROGRESO');
    expect(screen.getByRole('heading', { name: /Récords personales/ })).toBeInTheDocument();
  });

  it('avisa de que una sesión vacía se descartará', async () => {
    const { user } = renderApp(started());
    await goTo(user, 'ENTRENO');
    await user.click(screen.getByRole('button', { name: /Terminar/ }));
    expect(screen.getByText(/se descartará/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Seguir entrenando/ }));
    expect(screen.queryByText(/se descartará/)).not.toBeInTheDocument();
  });

  it('descarta la sesión sin guardarla', async () => {
    const { user } = renderApp(started());
    await goTo(user, 'ENTRENO');
    await user.click(screen.getByRole('button', { name: /Descartar sesión/ }));
    expect(screen.getByText(/No hay ningún entrenamiento en curso/)).toBeInTheDocument();
  });
});

describe('selector de ejercicios', () => {
  it('filtra por grupo muscular y sustituye el ejercicio', async () => {
    const { user } = renderApp(stateWith({ type: 'session/start', dayId: 'day-1', now: START }));
    await goTo(user, 'ENTRENO');
    await user.click(screen.getByRole('button', { name: /Press banca con barra/ }));
    await user.click(screen.getByRole('button', { name: /Cambiar/ }));

    const dialog = screen.getByRole('dialog', { name: 'Cambiar ejercicio' });
    // Arranca filtrado por el grupo del ejercicio actual (pecho).
    expect(within(dialog).getByRole('button', { name: 'Pecho' })).toHaveAttribute('aria-pressed', 'true');
    // Las alternativas del ejercicio se marcan como tales.
    expect(within(dialog).getAllByText(/ALTERNATIVA/).length).toBeGreaterThan(0);

    await user.click(within(dialog).getByRole('button', { name: /Press banca con mancuernas/ }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Press banca con mancuernas/ })).toBeInTheDocument();
  });

  it('busca por nombre y cierra con Escape', async () => {
    const { user } = renderApp(stateWith({ type: 'session/start', dayId: 'day-1', now: START }));
    await goTo(user, 'ENTRENO');
    await user.click(screen.getByRole('button', { name: /Añadir ejercicio suelto/ }));

    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText('Buscar ejercicio'), 'hip');
    expect(within(dialog).getByRole('button', { name: /Hip thrust/ })).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: /Curl martillo/ })).not.toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('deshabilita los ejercicios que ya están en la sesión', async () => {
    const { user } = renderApp(stateWith({ type: 'session/start', dayId: 'day-1', now: START }));
    await goTo(user, 'ENTRENO');
    await user.click(screen.getByRole('button', { name: /Añadir ejercicio suelto/ }));

    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Pecho' }));
    expect(within(dialog).getByRole('button', { name: /Press banca con barra.*YA INCLUIDO/ })).toBeDisabled();
  });

  it('añade un ejercicio suelto a la sesión', async () => {
    const { user } = renderApp(stateWith({ type: 'session/start', dayId: 'day-1', now: START }));
    await goTo(user, 'ENTRENO');
    await user.click(screen.getByRole('button', { name: /Añadir ejercicio suelto/ }));

    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText('Buscar ejercicio'), 'búlgara');
    await user.click(within(dialog).getByRole('button', { name: /Sentadilla búlgara/ }));
    expect(screen.getByRole('button', { name: /Sentadilla búlgara/ })).toBeInTheDocument();
  });

  it('avisa si ningún ejercicio coincide', async () => {
    const { user } = renderApp(stateWith({ type: 'session/start', dayId: 'day-1', now: START }));
    await goTo(user, 'ENTRENO');
    await user.click(screen.getByRole('button', { name: /Añadir ejercicio suelto/ }));
    await user.type(screen.getByLabelText('Buscar ejercicio'), 'zzzz');
    expect(screen.getByText(/Ningún ejercicio coincide/)).toBeInTheDocument();
  });
});

describe('editor de rutina', () => {
  it('renombra la rutina y un día', async () => {
    const { user } = renderApp();
    await goTo(user, 'RUTINA');

    const name = screen.getByLabelText('Nombre');
    await user.clear(name);
    await user.type(name, 'MI PLAN');
    expect(name).toHaveValue('MI PLAN');

    const dayName = screen.getByLabelText(/Nombre del día DÍA A/);
    await user.clear(dayName);
    await user.type(dayName, 'LUNES');
    expect(screen.getByLabelText(/Nombre del día LUNES/)).toBeInTheDocument();
  });

  it('cambia el día de la semana y libera el que estaba ocupado', async () => {
    const { user } = renderApp();
    await goTo(user, 'RUTINA');

    // El primer bloque de chips corresponde al DÍA A (asignado a lunes).
    const dayPanels = screen.getAllByText('Día de la semana').map((el) => el.parentElement as HTMLElement);
    const miercolesDiaA = within(dayPanels[0]).getByRole('button', { name: 'MIÉ' });
    await user.click(miercolesDiaA);
    expect(miercolesDiaA).toHaveAttribute('aria-pressed', 'true');
    // El DÍA B, que tenía miércoles, queda libre.
    expect(within(dayPanels[1]).getByRole('button', { name: 'Libre' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('edita series, repeticiones, RIR, descanso y técnica de un ejercicio', async () => {
    const { user } = renderApp();
    await goTo(user, 'RUTINA');
    await user.click(screen.getByRole('button', { name: 'Editar Press banca con barra' }));

    const sets = screen.getByLabelText('Series de Press banca con barra');
    await user.clear(sets);
    await user.type(sets, '6');
    expect(sets).toHaveValue(6);

    const rir = screen.getByLabelText('RIR de Press banca con barra');
    await user.clear(rir);
    await user.type(rir, '1');
    expect(rir).toHaveValue(1);

    const technique = screen.getByLabelText('Técnica de Press banca con barra');
    await user.selectOptions(technique, 'myo-reps');
    expect(technique).toHaveValue('myo-reps');
    expect(screen.getByText(/Serie de activación al fallo/)).toBeInTheDocument();
  });

  it('reordena y elimina ejercicios', async () => {
    const { user } = renderApp();
    await goTo(user, 'RUTINA');
    await user.click(screen.getByRole('button', { name: 'Editar Remo con barra' }));

    await user.click(screen.getByRole('button', { name: /Subir/ }));
    const names = screen
      .getAllByText(/^(Press banca con barra|Remo con barra)$/)
      .map((n) => n.textContent);
    expect(names[0]).toBe('Remo con barra');

    await user.click(screen.getByRole('button', { name: 'Editar Press banca con barra' }));
    await user.click(screen.getByRole('button', { name: 'Quitar' }));
    expect(screen.queryByText('Press banca con barra')).not.toBeInTheDocument();
  });

  it('añade un ejercicio al día desde el selector', async () => {
    const { user } = renderApp();
    await goTo(user, 'RUTINA');
    await user.click(screen.getAllByRole('button', { name: /Añadir ejercicio/ })[0]);

    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText('Buscar ejercicio'), 'búlgara');
    await user.click(within(dialog).getByRole('button', { name: /Sentadilla búlgara/ }));
    expect(screen.getByText('Sentadilla búlgara')).toBeInTheDocument();
  });

  it('crea y elimina días', async () => {
    const { user } = renderApp();
    await goTo(user, 'RUTINA');

    await user.click(screen.getByRole('button', { name: /Nuevo día/ }));
    expect(screen.getByLabelText(/Nombre del día DÍA 4/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Eliminar DÍA 4' }));
    expect(screen.queryByLabelText(/Nombre del día DÍA 4/)).not.toBeInTheDocument();
  });

  it('cambia los grupos prioritarios', async () => {
    const { user } = renderApp();
    await goTo(user, 'RUTINA');

    const panel = screen.getByText('Grupos prioritarios').parentElement as HTMLElement;
    const chest = within(panel).getByRole('button', { name: 'Pecho' });
    expect(chest).toHaveAttribute('aria-pressed', 'true');
    await user.click(chest);
    expect(chest).toHaveAttribute('aria-pressed', 'false');
  });

  it('restaura la plantilla solo tras confirmar', async () => {
    const { user } = renderApp(stateWith({ type: 'routine/rename', name: 'CAMBIADA' }));
    await goTo(user, 'RUTINA');
    expect(screen.getByLabelText('Nombre')).toHaveValue('CAMBIADA');

    await user.click(screen.getByRole('button', { name: /Restaurar plantilla/ }));
    await user.click(screen.getByRole('button', { name: /Cancelar/ }));
    expect(screen.getByLabelText('Nombre')).toHaveValue('CAMBIADA');

    await user.click(screen.getByRole('button', { name: /Restaurar plantilla/ }));
    await user.click(screen.getByRole('button', { name: /Sí, restaurar/ }));
    expect(screen.getByLabelText('Nombre')).toHaveValue('FULLBODY 3D · PECHO + ESPALDA');
  });
});

describe('pantalla de progreso', () => {
  const withHistory = () =>
    stateWith(
      { type: 'session/start', dayId: 'day-1', now: START },
      {
        type: 'session/logSet',
        exerciseId: 'bench-press',
        set: logged({ weight: 100, reps: 8, rir: 1 }),
        now: START + 10,
      },
      { type: 'session/finish', now: START + 3_600_000 },
    );

  it('invita a entrenar si no hay histórico', async () => {
    const { user } = renderApp();
    await goTo(user, 'PROGRESO');
    expect(screen.getByText(/Todavía no hay entrenamientos registrados/)).toBeInTheDocument();
  });

  it('resume el acumulado, el volumen y los récords', async () => {
    const { user } = renderApp(withHistory());
    await goTo(user, 'PROGRESO');

    const totals = screen.getByRole('heading', { name: 'Acumulado' }).closest('.panel') as HTMLElement;
    expect(within(totals).getByText('Sesiones').previousSibling).toHaveTextContent('1');
    expect(within(totals).getByText('Series').previousSibling).toHaveTextContent('1');

    expect(screen.getByRole('heading', { name: /Volumen de los últimos 7 días/ })).toBeInTheDocument();
    expect(screen.getByText(/kg 1RM/)).toBeInTheDocument();
  });

  it('despliega el detalle de una sesión del historial', async () => {
    const { user } = renderApp(withHistory());
    await goTo(user, 'PROGRESO');

    const history = screen.getByRole('heading', { name: 'Historial' }).closest('.panel') as HTMLElement;
    await user.click(within(history).getByRole('button', { name: /DÍA A/ }));
    expect(within(history).getByText('100×8@1')).toBeInTheDocument();
  });

  it('avisa de un estancamiento tras tres sesiones sin progreso', async () => {
    let state = configured();
    for (let i = 0; i < 3; i += 1) {
      state = [
        { type: 'session/start' as const, dayId: 'day-1', now: START + i * 1000 },
        {
          type: 'session/logSet' as const,
          exerciseId: 'bench-press',
          set: logged({ weight: 100, reps: 8, rir: 2 }),
          now: START + i * 1000 + 1,
        },
        { type: 'session/finish' as const, now: START + i * 1000 + 2 },
      ].reduce(reducer, state);
    }
    const { user } = renderApp(state);
    await goTo(user, 'PROGRESO');
    expect(screen.getByRole('heading', { name: 'Atención' })).toBeInTheDocument();
    expect(screen.getByText(/Tres sesiones seguidas sin mejorar/)).toBeInTheDocument();
  });
});

describe('ajustes', () => {
  it('cambia unidad, peso corporal y avisos', async () => {
    const { user } = renderApp();
    await goTo(user, 'AJUSTES');

    await user.selectOptions(screen.getByLabelText('Unidad de peso'), 'lb');
    expect(screen.getByLabelText('Unidad de peso')).toHaveValue('lb');

    const bodyweight = screen.getByLabelText('Peso corporal (kg)');
    await user.type(bodyweight, '78');
    expect(bodyweight).toHaveValue(78);

    const sound = screen.getByRole('button', { name: /Sonido/ });
    expect(sound).toHaveAttribute('aria-pressed', 'true');
    await user.click(sound);
    expect(screen.getByRole('button', { name: /Sonido/ })).toHaveAttribute('aria-pressed', 'false');
  });

  it('ajusta la semana y la duración del mesociclo', async () => {
    const { user } = renderApp();
    await goTo(user, 'AJUSTES');

    const length = screen.getByLabelText('Duración (semanas)');
    await user.clear(length);
    await user.type(length, '8');
    await user.tab();
    expect(length).toHaveValue(8);
    expect(screen.getByText(/SEM 1\/8/)).toBeInTheDocument();
  });

  it('borra todos los datos tras confirmar', async () => {
    const { user } = renderApp(stateWith({ type: 'routine/rename', name: 'BORRAME' }));
    await goTo(user, 'AJUSTES');

    await user.click(screen.getByRole('button', { name: /Borrar todos los datos/ }));
    await user.click(screen.getByRole('button', { name: /Cancelar/ }));
    await goTo(user, 'RUTINA');
    expect(screen.getByLabelText('Nombre')).toHaveValue('BORRAME');

    await goTo(user, 'AJUSTES');
    await user.click(screen.getByRole('button', { name: /Borrar todos los datos/ }));
    await user.click(screen.getByRole('button', { name: /Sí, borrar todo/ }));
    // Sin datos vuelve el cuestionario inicial, como en una instalación nueva.
    expect(screen.getByText('CONFIGURACIÓN INICIAL')).toBeInTheDocument();
  });

  it('exporta una copia de seguridad', async () => {
    const createObjectURL = vi.fn(() => 'blob:copia');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });

    const { user } = renderApp();
    await goTo(user, 'AJUSTES');
    await user.click(screen.getByRole('button', { name: /Exportar copia/ }));

    expect(createObjectURL).toHaveBeenCalled();
    expect(screen.getByText('Copia de seguridad descargada.')).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it('importa una copia y reemplaza el estado', async () => {
    const { user } = renderApp();
    await goTo(user, 'AJUSTES');

    const imported = reducer(configured(), { type: 'routine/rename', name: 'IMPORTADA' });
    const file = new File([JSON.stringify({ version: 1, state: imported })], 'copia.json', {
      type: 'application/json',
    });
    await user.upload(screen.getByLabelText('Importar copia de seguridad'), file);

    expect(await screen.findByText('Datos importados correctamente.')).toBeInTheDocument();
    await goTo(user, 'RUTINA');
    expect(screen.getByLabelText('Nombre')).toHaveValue('IMPORTADA');
  });

  it('explica cómo calcula la app', async () => {
    const { user } = renderApp();
    await goTo(user, 'AJUSTES');
    expect(screen.getByText(/fórmula de Epley/)).toBeInTheDocument();
    expect(screen.getByText(/doble progresión/i)).toBeInTheDocument();
  });
});

describe('persistencia entre recargas', () => {
  it('recupera la sesión en curso al volver a montar la app', async () => {
    const { user, unmount } = renderApp();
    await pickDay(user, 'Día a');
    await user.click(screen.getByRole('button', { name: /Empezar entreno/ }));
    expect(screen.getByText(/DÍA A.*EN MARCHA/)).toBeInTheDocument();
    unmount();

    // Sin initialState explícito, la app lee de localStorage. La sesión vuelve
    // en pausa, para no contar como entreno el rato que la app estuvo cerrada.
    const remounted = userEvent.setup();
    render(<App />);
    expect(screen.getByText(/⏸/)).toBeInTheDocument();
    await goTo(remounted, 'ENTRENO');
    expect(screen.getByText(/DÍA A.*EN PAUSA/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Press banca con barra/ })).toBeInTheDocument();
    // Y se puede continuar donde se dejó.
    await remounted.click(screen.getByRole('button', { name: /Reanudar/ }));
    expect(screen.getByText(/DÍA A.*EN MARCHA/)).toBeInTheDocument();
  });
});
