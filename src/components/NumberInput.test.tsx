import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { NumberInput } from './NumberInput';

/** Envoltorio controlado, como lo usan las pantallas reales. */
function Controlled({
  initial = 4,
  min = 1,
  max = 12,
  onCommit,
}: {
  initial?: number;
  min?: number;
  max?: number;
  onCommit?: (value: number) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <NumberInput
      value={value}
      min={min}
      max={max}
      label="Series"
      onCommit={(next) => {
        setValue(next);
        onCommit?.(next);
      }}
    />
  );
}

describe('NumberInput', () => {
  it('permite vaciar el campo y reescribir el valor', async () => {
    const user = userEvent.setup();
    render(<Controlled initial={4} />);
    const input = screen.getByLabelText('Series');

    await user.clear(input);
    // Mientras se escribe el campo puede estar vacío sin reponer el mínimo.
    expect(input).toHaveValue(null);

    await user.type(input, '6');
    expect(input).toHaveValue(6);
  });

  it('recorta al máximo al salir del campo', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(<Controlled initial={4} max={12} onCommit={onCommit} />);
    const input = screen.getByLabelText('Series');

    await user.clear(input);
    await user.type(input, '99');
    await user.tab();

    expect(input).toHaveValue(12);
    expect(onCommit).toHaveBeenLastCalledWith(12);
  });

  it('recorta al mínimo al salir del campo', async () => {
    const user = userEvent.setup();
    render(<Controlled initial={4} min={2} />);
    const input = screen.getByLabelText('Series');

    await user.clear(input);
    await user.type(input, '0');
    await user.tab();
    expect(input).toHaveValue(2);
  });

  it('restaura el valor anterior si se deja vacío', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(<Controlled initial={5} onCommit={onCommit} />);
    const input = screen.getByLabelText('Series');

    await user.clear(input);
    await user.tab();
    expect(input).toHaveValue(5);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('propaga el valor mientras se escribe si ya es válido', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(<Controlled initial={4} onCommit={onCommit} />);
    const input = screen.getByLabelText('Series');

    await user.clear(input);
    await user.type(input, '8');
    expect(onCommit).toHaveBeenCalledWith(8);
  });

  it('refleja los cambios que llegan desde fuera', () => {
    const { rerender } = render(
      <NumberInput value={3} min={1} max={12} label="Series" onCommit={() => {}} />,
    );
    expect(screen.getByLabelText('Series')).toHaveValue(3);

    rerender(<NumberInput value={9} min={1} max={12} label="Series" onCommit={() => {}} />);
    expect(screen.getByLabelText('Series')).toHaveValue(9);
  });
});
