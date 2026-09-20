import { useEffect, useState } from 'react';

const PLACEHOLDER =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160">
       <rect width="160" height="160" fill="#060c06"/>
       <text x="80" y="84" fill="#3d5a3d" font-family="monospace" font-size="12"
             text-anchor="middle">SIN IMAGEN</text>
     </svg>`,
  );

export interface ExerciseMediaProps {
  /** Fotogramas del movimiento: normalmente inicio y final del recorrido. */
  frames: string[];
  alt: string;
  className?: string;
  /** Milisegundos entre fotogramas; 0 detiene la animación. */
  intervalMs?: number;
  /** false para miniaturas: muestra solo el primer fotograma. */
  animate?: boolean;
}

/**
 * Muestra el movimiento alternando los dos fotogramas del ejercicio, lo que
 * da la misma información que un GIF pesando mucho menos. Si una imagen no
 * carga (sin red y sin caché) se sustituye por un marcador en lugar de dejar
 * un hueco roto.
 */
export function ExerciseMedia({
  frames,
  alt,
  className = 'media',
  intervalMs = 900,
  animate = true,
}: ExerciseMediaProps) {
  const [index, setIndex] = useState(0);
  // Fotogramas que han fallado al cargar. Se guarda en estado, no mutando el
  // DOM: al rotar el índice React volvería a pintar la URL rota y el marcador
  // parpadearía en cada vuelta.
  const [broken, setBroken] = useState<string[]>([]);

  const usable = frames.filter((frame) => !broken.includes(frame));
  const animating = animate && usable.length > 1 && intervalMs > 0;

  useEffect(() => {
    if (!animating) {
      setIndex(0);
      return;
    }
    const id = setInterval(() => setIndex((current) => current + 1), intervalMs);
    return () => clearInterval(id);
  }, [animating, intervalMs]);

  // El índice crece sin límite; se ajusta al número de fotogramas utilizables
  // para que quitar uno roto no deje la vista en blanco.
  const src = usable.length > 0 ? usable[index % usable.length] : PLACEHOLDER;

  return (
    <img
      className={className}
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => {
        setBroken((current) => (current.includes(src) ? current : [...current, src]));
      }}
    />
  );
}
