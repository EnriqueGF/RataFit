import '@testing-library/jest-dom/vitest';
import { beforeAll, vi } from 'vitest';

// La app propone el día de entreno según el día real de la semana, así que sin
// fijar la fecha un test podría pasar un domingo y fallar un miércoles (que es
// justo lo que ocurrió en CI). Se congela en un lunes para que la suite sea
// reproducible; los tests que necesiten otro día usan vi.setSystemTime.
beforeAll(() => {
  vi.setSystemTime(new Date('2026-09-21T10:00:00'));
});
