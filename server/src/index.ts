import { createApp } from './app.js';
import { openDatabase } from './db.js';

const port = Number(process.env.PORT ?? 8080);
const dbFile = process.env.DB_FILE ?? '/data/ratafit.db';
const jwtSecret = process.env.JWT_SECRET ?? '';

// Sin secreto no se arranca: uno por defecto permitiría a cualquiera firmar
// tokens válidos y entrar en cualquier cuenta.
if (jwtSecret.length < 32) {
  console.error(
    'Falta JWT_SECRET (mínimo 32 caracteres). Genera uno con:\n' +
      '  openssl rand -base64 48',
  );
  process.exit(1);
}

const db = openDatabase(dbFile);
const app = createApp({ db, jwtSecret });

const server = app.listen(port, () => {
  console.log(`RataFit API escuchando en el puerto ${port} (datos en ${dbFile})`);
});

// Docker manda SIGTERM al parar: cerrar bien evita dejar la base a medias.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
  });
}
