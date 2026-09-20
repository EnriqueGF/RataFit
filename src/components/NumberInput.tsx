import { useEffect, useState } from 'react';

export interface NumberInputProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  label: string;
  id?: string;
  className?: string;
  /** true para pesos: acepta decimales en vez de redondear a entero. */
  decimals?: boolean;
  onCommit: (value: number) => void;
}

/**
 * Campo numérico que tolera estados intermedios. Un input controlado que
 * recorta en cada pulsación impide borrar el contenido para reescribirlo
 * (al vaciar "4" se repondría el mínimo y el siguiente dígito se concatenaría),
 * así que aquí se guarda el texto tal cual y solo se valida al salir del campo.
 */
export function NumberInput({
  value,
  min,
  max,
  step,
  label,
  id,
  className = 'input input--number',
  decimals = false,
  onCommit,
}: NumberInputProps) {
  const [draft, setDraft] = useState(String(value));

  // Si el valor cambia desde fuera (importar datos, resetear), se refleja.
  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const normalize = (n: number) => {
    const clamped = Math.min(max, Math.max(min, n));
    return decimals ? Math.round(clamped * 100) / 100 : Math.round(clamped);
  };

  return (
    <input
      id={id}
      className={className}
      type="number"
      inputMode={decimals ? 'decimal' : 'numeric'}
      min={min}
      max={max}
      step={step}
      value={draft}
      aria-label={label}
      onChange={(event) => {
        const raw = event.target.value;
        setDraft(raw);
        // Se propaga en caliente solo si ya es un valor válido dentro del rango,
        // de modo que la vista previa se actualiza mientras se escribe.
        const parsed = Number(raw);
        if (raw !== '' && Number.isFinite(parsed) && parsed >= min && parsed <= max) {
          onCommit(normalize(parsed));
        }
      }}
      onBlur={(event) => {
        const raw = event.target.value;
        const parsed = Number(raw);
        if (raw.trim() === '' || !Number.isFinite(parsed)) {
          setDraft(String(value));
          return;
        }
        const normalized = normalize(parsed);
        setDraft(String(normalized));
        if (normalized !== value) onCommit(normalized);
      }}
    />
  );
}
