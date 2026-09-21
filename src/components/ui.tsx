import { useEffect, type ReactNode } from 'react';

export function Panel({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="panel">
      <header className="panel__head">
        <h2 className="panel__title">{title}</h2>
        {action}
      </header>
      <div className="panel__body">{children}</div>
    </section>
  );
}

export function Field({
  label,
  children,
  htmlFor,
}: {
  label: string;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="field">
      <label className="field__label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
    </div>
  );
}

export function Stat({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className="stat">
      <div className="stat__value">{value}</div>
      <div className="stat__label">{label}</div>
    </div>
  );
}

export function Empty({
  glyph,
  image,
  children,
}: {
  glyph: string;
  image?: string;
  children: ReactNode;
}) {
  return (
    <div className="empty">
      {image ? (
        <img src={image} alt="" className="empty__mascot" aria-hidden="true" />
      ) : (
        <div className="empty__glyph" aria-hidden="true">
          {glyph}
        </div>
      )}
      {children}
    </div>
  );
}

/**
 * Modal a pantalla parcial. Cierra con Escape y bloquea el scroll del fondo
 * mientras está abierto.
 */
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal__head">
          <h2 className="modal__title">{title}</h2>
          <button type="button" className="btn btn--ghost" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </header>
        <div className="modal__body">{children}</div>
      </div>
    </div>
  );
}
