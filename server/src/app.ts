import express, { type NextFunction, type Request, type Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import type Database from 'better-sqlite3';
import {
  createUser,
  deleteUser,
  findUserById,
  findUserByUsername,
  getState,
  putState,
} from './db.js';

export interface AppOptions {
  db: Database.Database;
  jwtSecret: string;
  /** Duración del token de sesión. */
  tokenTtl?: string;
  /** Coste del hash; bajarlo en tests hace que no tarden una eternidad. */
  bcryptRounds?: number;
}

/** Tamaño máximo del estado sincronizado: un histórico largo no llega a 1 MB. */
const MAX_STATE_BYTES = 4 * 1024 * 1024;

const credentials = z.object({
  username: z
    .string()
    .trim()
    .min(3, 'El usuario necesita al menos 3 caracteres')
    .max(32, 'El usuario no puede pasar de 32 caracteres')
    .regex(/^[\w.-]+$/u, 'Solo se permiten letras, números, guion, guion bajo y punto'),
  password: z
    .string()
    .min(8, 'La contraseña necesita al menos 8 caracteres')
    .max(200, 'La contraseña no puede pasar de 200 caracteres'),
});

interface AuthedRequest extends Request {
  userId?: number;
}

export function createApp({ db, jwtSecret, tokenTtl = '90d', bcryptRounds = 12 }: AppOptions) {
  const app = express();
  app.use(express.json({ limit: '8mb' }));

  // La PWA se sirve desde otro origen (GitHub Pages o el propio servidor), así
  // que necesita CORS. No se usan cookies: el token viaja en la cabecera.
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  const signOptions: jwt.SignOptions = { expiresIn: tokenTtl as jwt.SignOptions['expiresIn'] };
  const sign = (userId: number) => jwt.sign({ sub: String(userId) }, jwtSecret, signOptions);

  /** Exige un token válido y deja el id del usuario en la petición. */
  const requireAuth = (req: AuthedRequest, res: Response, next: NextFunction) => {
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) {
      res.status(401).json({ error: 'Falta el token de sesión' });
      return;
    }
    try {
      const payload = jwt.verify(token, jwtSecret) as { sub?: string };
      const userId = Number(payload.sub);
      // El token puede seguir siendo válido tras borrar la cuenta.
      if (!Number.isInteger(userId) || !findUserById(db, userId)) {
        res.status(401).json({ error: 'Sesión no válida' });
        return;
      }
      req.userId = userId;
      next();
    } catch {
      res.status(401).json({ error: 'Sesión caducada o no válida' });
    }
  };

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  // ─────────────────────────────── Cuentas ──────────────────────────────────

  app.post('/api/auth/register', (req, res) => {
    const parsed = credentials.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Datos no válidos' });
      return;
    }
    const { username, password } = parsed.data;

    if (findUserByUsername(db, username)) {
      res.status(409).json({ error: 'Ese nombre de usuario ya está cogido' });
      return;
    }

    const user = createUser(db, username, bcrypt.hashSync(password, bcryptRounds));
    res.status(201).json({ token: sign(user.id), user: { id: user.id, username: user.username } });
  });

  app.post('/api/auth/login', (req, res) => {
    const parsed = credentials.safeParse(req.body);
    if (!parsed.success) {
      // No se detalla qué falla: un atacante no debe distinguir entre un
      // usuario que no existe y una contraseña equivocada.
      res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
      return;
    }
    const { username, password } = parsed.data;
    const user = findUserByUsername(db, username);

    // Se compara igualmente contra un hash falso cuando el usuario no existe,
    // para que el tiempo de respuesta no revele si el nombre está registrado.
    const hash = user?.password_hash ?? '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidi';
    const valid = bcrypt.compareSync(password, hash);

    if (!user || !valid) {
      res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
      return;
    }
    res.json({ token: sign(user.id), user: { id: user.id, username: user.username } });
  });

  app.get('/api/auth/me', requireAuth, (req: AuthedRequest, res) => {
    const user = findUserById(db, req.userId!)!;
    res.json({ user: { id: user.id, username: user.username } });
  });

  app.delete('/api/auth/me', requireAuth, (req: AuthedRequest, res) => {
    deleteUser(db, req.userId!);
    res.status(204).end();
  });

  // ────────────────────────────── Sincronía ─────────────────────────────────

  app.get('/api/state', requireAuth, (req: AuthedRequest, res) => {
    const row = getState(db, req.userId!);
    if (!row) {
      // Cuenta recién creada: aún no ha subido nada.
      res.json({ state: null, revision: 0, updatedAt: null });
      return;
    }
    res.json({
      state: JSON.parse(row.payload),
      revision: row.revision,
      updatedAt: row.updated_at,
    });
  });

  app.put('/api/state', requireAuth, (req: AuthedRequest, res) => {
    const body = z
      .object({
        state: z.unknown(),
        /** Revisión sobre la que se editó; sirve para detectar conflictos. */
        baseRevision: z.number().int().nonnegative().optional(),
      })
      .safeParse(req.body);

    if (!body.success || body.data.state === undefined || body.data.state === null) {
      res.status(400).json({ error: 'Falta el estado a guardar' });
      return;
    }

    const payload = JSON.stringify(body.data.state);
    if (Buffer.byteLength(payload, 'utf8') > MAX_STATE_BYTES) {
      res.status(413).json({ error: 'El histórico es demasiado grande para sincronizarlo' });
      return;
    }

    const current = getState(db, req.userId!);
    const base = body.data.baseRevision;
    // Si el cliente editó sobre una revisión vieja, otro dispositivo guardó
    // algo entretanto: se rechaza en vez de pisarlo en silencio.
    if (base !== undefined && current && current.revision !== base) {
      res.status(409).json({
        error: 'Hay cambios más recientes guardados desde otro dispositivo',
        revision: current.revision,
        state: JSON.parse(current.payload),
        updatedAt: current.updated_at,
      });
      return;
    }

    const saved = putState(db, req.userId!, payload);
    res.json({ revision: saved.revision, updatedAt: saved.updated_at });
  });

  // Cualquier error no previsto acaba aquí en vez de tumbar el proceso.
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const message = error instanceof Error ? error.message : 'Error inesperado';
    res.status(500).json({ error: message });
  });

  return app;
}
