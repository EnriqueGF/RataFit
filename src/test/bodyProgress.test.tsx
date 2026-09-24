import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { AppProvider } from '../state/AppContext';
import { createInitialState } from '../state/store';
import { ProgressScreen } from '../components/ProgressScreen';

describe('evolución corporal', () => {
  it('registra peso sin entrenamientos, añade grasa opcional, grafica y permite corregir', async () => {
    const user = userEvent.setup();
    render(<AppProvider initialState={createInitialState()}><ProgressScreen /></AppProvider>);
    const date = screen.getByLabelText('Fecha de medición');
    await user.clear(date);
    await user.type(date, '2026-09-01');
    await user.type(screen.getByLabelText('Peso corporal (kg)'), '80,5');
    await user.click(screen.getByRole('button', { name: 'Guardar medición' }));
    expect(screen.getByText('80,5 kg', { selector: 'strong' })).toBeInTheDocument();
    await user.clear(date);
    await user.type(date, '2026-09-02');
    await user.type(screen.getByLabelText('Peso corporal (kg)'), '79');
    await user.type(screen.getByLabelText(/Grasa corporal/), '20');
    await user.click(screen.getByRole('button', { name: 'Guardar medición' }));
    expect(screen.getByRole('img', { name: /Evolución de Peso/ })).toBeInTheDocument();
    expect(screen.getByText('20 %', { selector: 'strong' })).toBeInTheDocument();
    await user.click(screen.getByText('Historial de mediciones (2)'));
    await user.click(screen.getByRole('button', { name: 'Editar medición 2026-09-02' }));
    await user.clear(screen.getByLabelText('Peso corporal (kg)'));
    await user.type(screen.getByLabelText('Peso corporal (kg)'), '78');
    await user.click(screen.getByRole('button', { name: 'Guardar medición' }));
    expect(screen.getByText('78 kg', { selector: 'strong' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Eliminar medición 2026-09-02' }));
    expect(screen.getByText('Historial de mediciones (1)')).toBeInTheDocument();
  });

  it('convierte libras a kg al guardar', async () => {
    const user = userEvent.setup();
    const state = createInitialState();
    state.settings = { ...state.settings, unit: 'lb' };
    render(<AppProvider initialState={state}><ProgressScreen /></AppProvider>);
    await user.type(screen.getByLabelText('Peso corporal (lb)'), '220.46226218');
    await user.click(screen.getByRole('button', { name: 'Guardar medición' }));
    const saved = JSON.parse(localStorage.getItem('iron-terminal:v1')!);
    expect(saved.state.bodyMeasurements[0].weight).toBeCloseTo(100);
  });
});
