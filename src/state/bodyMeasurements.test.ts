import { describe, expect, it } from 'vitest';
import { createInitialState, deserialize, reducer, serialize } from './store';

describe('mediciones corporales y compatibilidad', () => {
  it('carga una copia antigua conservando todos sus datos', () => {
    const state = reducer(createInitialState(1000), { type: 'profile/skip' });
    state.settings = { ...state.settings, bodyweight: 80 };
    const { bodyMeasurements: _, ...legacy } = state;
    const restored = deserialize(JSON.stringify({ version: 1, state: legacy }), 1000);
    expect(restored).toEqual({ ...state, bodyMeasurements: [] });
    const remote = reducer(state, { type: 'state/replace', state: legacy as typeof state });
    expect(remote).toEqual(restored);
  });

  it('ordena fechas, actualiza sin duplicar y conserva mediciones en las copias', () => {
    let state = createInitialState();
    state = reducer(state, { type: 'body/save', measurement: { date: '2026-09-20', weight: 80, bodyFat: 20 } });
    state = reducer(state, { type: 'body/save', measurement: { date: '2026-09-10', weight: 82 } });
    expect(state.settings.bodyweight).toBe(80);
    state = reducer(state, { type: 'body/save', measurement: { date: '2026-09-20', weight: 79 } });
    expect(state.bodyMeasurements).toEqual([{ date: '2026-09-10', weight: 82 }, { date: '2026-09-20', weight: 79 }]);
    expect(deserialize(serialize(state))).toEqual(state);
    state = reducer(state, { type: 'body/delete', date: '2026-09-20' });
    expect(state.settings.bodyweight).toBe(82);
    state = reducer(state, { type: 'body/delete', date: '2026-09-10' });
    expect(state.bodyMeasurements).toEqual([]);
    expect(state.settings.bodyweight).toBeNull();
  });

  it('rechaza valores inválidos sin afectar al histórico', () => {
    const state = createInitialState();
    for (const measurement of [
      { date: '2026-02-30', weight: 80 }, { date: '2026-09-20', weight: NaN },
      { date: '2026-09-20', weight: -1 }, { date: '2026-09-20', weight: 80, bodyFat: 100 },
    ]) expect(reducer(state, { type: 'body/save', measurement })).toBe(state);
    const raw = JSON.parse(serialize(state));
    raw.state.bodyMeasurements = [null, { date: '2026-09-20', weight: 80 }];
    expect(deserialize(JSON.stringify(raw)).bodyMeasurements).toEqual([{ date: '2026-09-20', weight: 80 }]);
  });
});
