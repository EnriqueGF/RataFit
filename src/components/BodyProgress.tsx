import { useState, type FormEvent } from 'react';
import { useApp } from '../state/AppContext';
import { isBodyMeasurement, localDate } from '../domain/bodyMeasurements';
import { Field, Panel } from './ui';

export function BodyProgress() {
  const { state, dispatch } = useApp();
  const { bodyMeasurements: measurements, settings } = state;
  const [date, setDate] = useState(localDate());
  const [weight, setWeight] = useState('');
  const [fat, setFat] = useState('');
  const [message, setMessage] = useState('');
  const factor = settings.unit === 'lb' ? 2.2046226218 : 1;
  const format = (value: number) => value.toLocaleString('es-ES', { maximumFractionDigits: 1 });
  const latest = measurements.at(-1);
  const first = measurements[0];
  const fatMeasurements = measurements.filter(m => m.bodyFat !== undefined);
  const save = (event: FormEvent) => {
    event.preventDefault();
    const measurement = { date, weight: Number(weight.replace(',', '.')) / factor,
      ...(fat.trim() ? { bodyFat: Number(fat.replace(',', '.')) } : {}) };
    if (!isBodyMeasurement(measurement) || date > localDate()) {
      setMessage('Introduce una fecha válida, un peso positivo y, si lo indicas, una grasa entre 0 y 100 %.');
      return;
    }
    dispatch({ type: 'body/save', measurement });
    setMessage('Medición guardada.');
    setWeight('');
    setFat('');
  };

  return <Panel title="Evolución corporal">
    <form onSubmit={save}>
      <Field label="Fecha de medición" htmlFor="measurement-date">
        <input className="input" id="measurement-date" type="date" required max={localDate()} value={date} onChange={e => setDate(e.target.value)} />
      </Field>
      <div className="grid-2" style={{ marginTop: 10 }}>
        <Field label={`Peso corporal (${settings.unit})`} htmlFor="measurement-weight">
          <input className="input" id="measurement-weight" inputMode="decimal" required value={weight} placeholder={settings.bodyweight ? format(settings.bodyweight * factor) : '—'} onChange={e => setWeight(e.target.value)} />
        </Field>
        <Field label="Grasa corporal (%) · opcional" htmlFor="measurement-fat">
          <input className="input" id="measurement-fat" inputMode="decimal" value={fat} placeholder="—" onChange={e => setFat(e.target.value)} />
        </Field>
      </div>
      <p className="muted">Una medición por fecha. Guardar la misma fecha actualiza su peso y grasa.</p>
      <button className="btn btn--primary" type="submit">Guardar medición</button>
      {message && <p role="status">{message}</p>}
    </form>
    {!latest ? <p className="muted">Registra tu primera medición para ver tu evolución.</p> : <>
      <p>Último peso: <strong>{format(latest.weight * factor)} {settings.unit}</strong> · {latest.date}</p>
      {measurements.length > 1 && <p className="muted">Cambio desde {first.date}: {format((latest.weight - first.weight) * factor)} {settings.unit}</p>}
      <Trend label={`Peso (${settings.unit})`} points={measurements.map(m => ({ date: m.date, value: m.weight * factor }))} />
      {fatMeasurements.length > 0 && <>
        <p>Última grasa: <strong>{format(fatMeasurements.at(-1)!.bodyFat!)} %</strong> · {fatMeasurements.at(-1)!.date}</p>
        {fatMeasurements.length > 1 && <p className="muted">Cambio de grasa: {format(fatMeasurements.at(-1)!.bodyFat! - fatMeasurements[0].bodyFat!)} puntos porcentuales</p>}
        <Trend label="Grasa corporal (%)" points={fatMeasurements.map(m => ({ date: m.date, value: m.bodyFat! }))} />
      </>}
      <details style={{ marginTop: 12 }}>
        <summary>Historial de mediciones ({measurements.length})</summary>
        <ul className="list-reset">
          {[...measurements].reverse().map(m => <li key={m.date} style={{ padding: '10px 0' }}>
            <p>{m.date} · {format(m.weight * factor)} {settings.unit}{m.bodyFat !== undefined ? ` · ${format(m.bodyFat)} % grasa` : ''}</p>
            <div className="btn-row">
              <button className="btn btn--sm" onClick={() => {
                setDate(m.date); setWeight(String(Number((m.weight * factor).toFixed(2)))); setFat(m.bodyFat === undefined ? '' : String(m.bodyFat)); setMessage('Edita los valores y guarda la medición.');
              }} aria-label={`Editar medición ${m.date}`}>Editar</button>
              <button className="btn btn--sm" onClick={() => dispatch({ type: 'body/delete', date: m.date })} aria-label={`Eliminar medición ${m.date}`}>Eliminar</button>
            </div>
          </li>)}
        </ul>
      </details>
    </>}
  </Panel>;
}

function Trend({ label, points }: { label: string; points: { date: string; value: number }[] }) {
  if (points.length < 2) return null;
  const values = points.map(p => p.value);
  const min = Math.min(...values), max = Math.max(...values);
  const start = Date.parse(points[0].date), span = Date.parse(points.at(-1)!.date) - start;
  const coords = points.map(p => ({ ...p,
    x: 45 + ((Date.parse(p.date) - start) / (span || 1)) * 290,
    y: max === min ? 70 : 115 - ((p.value - min) / (max - min)) * 90,
  }));
  return <figure style={{ margin: '16px 0' }}>
    <figcaption>{label}</figcaption>
    <svg viewBox="0 0 350 150" role="img" aria-label={`Evolución de ${label} entre ${points[0].date} y ${points.at(-1)!.date}`} style={{ width: '100%', maxHeight: 220 }}>
      <text x="0" y="25" fill="currentColor" fontSize="11">{max.toFixed(1)}</text>
      <text x="0" y="115" fill="currentColor" fontSize="11">{min.toFixed(1)}</text>
      <polyline points={coords.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke="var(--accent)" strokeWidth="2" />
      {coords.map(p => <circle key={p.date} cx={p.x} cy={p.y} r="3" fill="var(--accent)"><title>{p.date}: {p.value.toFixed(1)}</title></circle>)}
      <text x="45" y="145" fill="currentColor" fontSize="10">{points[0].date}</text>
      <text x="335" y="145" textAnchor="end" fill="currentColor" fontSize="10">{points.at(-1)!.date}</text>
    </svg>
  </figure>;
}
