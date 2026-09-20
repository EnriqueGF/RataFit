import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SetLogger } from './SetLogger';
import { EXERCISE_BY_ID } from '../data/exercises';
import type { AdvancedTechnique, LoggedSet, SetPrescription } from '../domain/types';

const bench = EXERCISE_BY_ID['bench-press'];

const prescription = (overrides: Partial<SetPrescription> = {}): SetPrescription => ({
  index: 0,
  targetReps: [6, 10],
  targetRir: 2,
  suggestedWeight: 100,
  technique: 'straight',
  restSeconds: 180,
  warmup: false,
  ...overrides,
});

const loggedSet = (overrides: Partial<LoggedSet> = {}): LoggedSet => ({
  id: 'set-1',
  reps: 8,
  weight: 100,
  rir: 2,
  completedAt: 1,
  technique: 'straight',
  warmup: false,
  ...overrides,
});

function setup(props: Partial<React.ComponentProps<typeof SetLogger>> = {}) {
  const onLog = vi.fn();
  const onEdit = vi.fn();
  const onDelete = vi.fn();
  const user = userEvent.setup();
  render(
    <SetLogger
      exercise={bench}
      prescriptions={[prescription()]}
      loggedSets={[]}
      unit="kg"
      onLog={onLog}
      onEdit={onEdit}
      onDelete={onDelete}
      {...props}
    />,
  );
  return { user, onLog, onEdit, onDelete };
}

describe('SetLogger', () => {
  it('precarga la siguiente serie con el peso y las repeticiones prescritas', () => {
    setup();
    expect(screen.getByLabelText('Peso de la siguiente serie')).toHaveValue(100);
    expect(screen.getByLabelText('Repeticiones de la siguiente serie')).toHaveValue(6);
    expect(screen.getByLabelText('RIR de la siguiente serie')).toHaveValue(2);
  });

  it('muestra el objetivo de la serie', () => {
    setup();
    expect(screen.getByText(/6-10 reps @ RIR 2/)).toBeInTheDocument();
  });

  it('registra la serie con los valores introducidos', async () => {
    const { user, onLog } = setup();
    const weight = screen.getByLabelText('Peso de la siguiente serie');
    await user.clear(weight);
    await user.type(weight, '92.5');
    await user.click(screen.getByRole('button', { name: /OK/ }));

    expect(onLog).toHaveBeenCalledWith({
      weight: 92.5,
      reps: 6,
      rir: 2,
      technique: 'straight',
      warmup: false,
    });
  });

  it('no registra nada si no hay repeticiones válidas', async () => {
    const { user, onLog } = setup();
    const reps = screen.getByLabelText('Repeticiones de la siguiente serie');
    await user.clear(reps);
    await user.click(screen.getByRole('button', { name: /OK/ }));
    expect(onLog).not.toHaveBeenCalled();
  });

  it('acepta peso corporal (0 kg) siempre que haya repeticiones', async () => {
    const { user, onLog } = setup();
    const weight = screen.getByLabelText('Peso de la siguiente serie');
    await user.clear(weight);
    await user.type(weight, '0');
    await user.click(screen.getByRole('button', { name: /OK/ }));
    expect(onLog).toHaveBeenCalledWith(expect.objectContaining({ weight: 0, reps: 6 }));
  });

  it('arrastra la marca de aproximación y la técnica de la prescripción', async () => {
    const { user, onLog } = setup({
      prescriptions: [prescription({ warmup: true, technique: 'straight' })],
    });
    await user.click(screen.getByRole('button', { name: /OK/ }));
    expect(onLog).toHaveBeenCalledWith(expect.objectContaining({ warmup: true }));
  });

  it('numera las aproximaciones con C y las efectivas con su orden', () => {
    setup({
      prescriptions: [prescription({ warmup: true }), prescription({ index: 1 })],
      loggedSets: [loggedSet({ id: 'w', warmup: true }), loggedSet({ id: 's1' })],
    });
    const rows = screen.getAllByRole('row');
    // Cabecera + dos series registradas.
    expect(rows).toHaveLength(3);
    expect(rows[1]).toHaveTextContent('C');
    expect(rows[2]).toHaveTextContent('1');
  });

  it('calcula el 1RM estimado de cada serie efectiva', () => {
    setup({ loggedSets: [loggedSet({ weight: 100, reps: 8, rir: 2 })] });
    // Epley con 10 reps efectivas: 100 * (1 + 10/30) ≈ 133
    expect(screen.getByRole('cell', { name: '133' })).toBeInTheDocument();
  });

  it('no calcula 1RM para las aproximaciones', () => {
    setup({ loggedSets: [loggedSet({ warmup: true })] });
    expect(screen.getByRole('cell', { name: '—' })).toBeInTheDocument();
  });

  it('propaga la edición de una serie ya registrada', async () => {
    const { user, onEdit } = setup({ loggedSets: [loggedSet()] });
    const reps = screen.getByLabelText('Repeticiones de la serie 1');
    await user.clear(reps);
    await user.type(reps, '9');
    expect(onEdit).toHaveBeenCalledWith('set-1', { reps: 9 });
  });

  it('permite vaciar y reescribir las reps de una serie sin registrar un 0', async () => {
    const { user, onEdit } = setup({ loggedSets: [loggedSet({ reps: 8 })] });
    const reps = screen.getByLabelText('Repeticiones de la serie 1');
    await user.clear(reps);
    // Vaciar el campo no debe guardar 0 repeticiones.
    expect(onEdit).not.toHaveBeenCalledWith('set-1', { reps: 0 });
    await user.type(reps, '12');
    expect(onEdit).toHaveBeenLastCalledWith('set-1', { reps: 12 });
  });

  it('acepta pesos con decimales al editar', async () => {
    const { user, onEdit } = setup({ loggedSets: [loggedSet({ weight: 100 })] });
    const weight = screen.getByLabelText('Peso de la serie 1');
    await user.clear(weight);
    await user.type(weight, '92.5');
    expect(onEdit).toHaveBeenLastCalledWith('set-1', { weight: 92.5 });
  });

  it('propaga el borrado de una serie', async () => {
    const { user, onDelete } = setup({ loggedSets: [loggedSet()] });
    await user.click(screen.getByRole('button', { name: 'Borrar serie 1' }));
    expect(onDelete).toHaveBeenCalledWith('set-1');
  });

  it('explica la técnica avanzada de la serie en curso', () => {
    setup({ prescriptions: [prescription({ technique: 'myo-reps' })] });
    expect(screen.getByText(/Myo-reps/)).toBeInTheDocument();
    expect(screen.getByText(/mini-series de 3-5 reps/)).toBeInTheDocument();
  });

  it('no muestra ayuda de técnica en una aproximación', () => {
    setup({ prescriptions: [prescription({ warmup: true, technique: 'drop-set' })] });
    expect(screen.queryByText(/baja el peso un 20-30/)).not.toBeInTheDocument();
  });

  it('resume el ejercicio al completar todas las series', () => {
    setup({
      prescriptions: [prescription()],
      loggedSets: [loggedSet({ id: 'a' }), loggedSet({ id: 'b', warmup: true })],
    });
    expect(screen.getByText(/Ejercicio completado: 1 series efectivas/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Peso de la siguiente serie')).not.toBeInTheDocument();
  });

  it('permite añadir una serie extra copiando la última', async () => {
    const { user, onLog } = setup({
      prescriptions: [prescription()],
      loggedSets: [loggedSet({ weight: 95, reps: 7 })],
    });
    await user.click(screen.getByRole('button', { name: /Serie extra/ }));
    expect(onLog).toHaveBeenCalledWith({
      weight: 95,
      reps: 7,
      rir: 0,
      technique: 'straight',
      warmup: false,
    });
  });

  it('usa valores por defecto para la serie extra si no hay ninguna previa', async () => {
    const { user, onLog } = setup({ prescriptions: [], loggedSets: [] });
    await user.click(screen.getByRole('button', { name: /Serie extra/ }));
    expect(onLog).toHaveBeenCalledWith(expect.objectContaining({ weight: 0, reps: 8 }));
  });

  it('cae en el peso de la serie anterior si la prescripción no sugiere ninguno', () => {
    setup({
      prescriptions: [prescription(), prescription({ index: 1, suggestedWeight: null })],
      loggedSets: [loggedSet({ weight: 87.5 })],
    });
    expect(screen.getByLabelText('Peso de la siguiente serie')).toHaveValue(87.5);
  });

  it('muestra la unidad configurada en la cabecera', () => {
    const { unmount } = render(
      <SetLogger
        exercise={bench}
        prescriptions={[prescription()]}
        loggedSets={[]}
        unit="lb"
        onLog={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByRole('columnheader', { name: 'LB' })).toBeInTheDocument();
    unmount();
  });

  it('marca el back-off con menos peso que la serie principal', () => {
    setup({
      prescriptions: [
        prescription({ technique: 'top-backoff' as AdvancedTechnique }),
        prescription({ index: 1, suggestedWeight: 90 }),
      ],
      loggedSets: [loggedSet()],
    });
    expect(screen.getByLabelText('Peso de la siguiente serie')).toHaveValue(90);
  });
});
