import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type Database from 'better-sqlite3';
import { createApp } from './app.js';
import { openDatabase } from './db.js';

const SECRET = 'secreto-de-pruebas-con-mas-de-32-caracteres';

let db: Database.Database;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  db = openDatabase(':memory:');
  // Coste mínimo de bcrypt: con 12 rondas cada test tardaría cientos de ms.
  app = createApp({ db, jwtSecret: SECRET, bcryptRounds: 4 });
});

afterEach(() => db.close());

const creds = { username: 'enrique', password: 'contrasena-larga' };

/** Registra una cuenta y devuelve su token. */
async function register(overrides: Partial<typeof creds> = {}) {
  const res = await request(app).post('/api/auth/register').send({ ...creds, ...overrides });
  expect(res.status).toBe(201);
  return res.body.token as string;
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

describe('salud', () => {
  it('responde al health check', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});

describe('registro', () => {
  it('crea la cuenta y devuelve un token', async () => {
    const res = await request(app).post('/api/auth/register').send(creds);
    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user).toMatchObject({ username: 'enrique' });
    // La contraseña nunca viaja de vuelta, ni siquiera cifrada.
    expect(JSON.stringify(res.body)).not.toContain(creds.password);
  });

  it('guarda la contraseña cifrada, nunca en claro', async () => {
    await register();
    const row = db.prepare('SELECT password_hash FROM users').get() as { password_hash: string };
    expect(row.password_hash).not.toBe(creds.password);
    expect(row.password_hash.startsWith('$2')).toBe(true);
  });

  it('rechaza un usuario repetido', async () => {
    await register();
    const res = await request(app).post('/api/auth/register').send(creds);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/ya está cogido/);
  });

  it('trata el usuario sin distinguir mayúsculas', async () => {
    await register();
    const res = await request(app).post('/api/auth/register').send({ ...creds, username: 'ENRIQUE' });
    expect(res.status).toBe(409);
  });

  it('exige un usuario y una contraseña razonables', async () => {
    const cases = [
      { username: 'ab', password: 'contrasena-larga' },
      { username: 'enrique', password: 'corta' },
      { username: 'con espacio', password: 'contrasena-larga' },
      { username: 'a'.repeat(33), password: 'contrasena-larga' },
    ];
    for (const body of cases) {
      const res = await request(app).post('/api/auth/register').send(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body.error).toBeTruthy();
    }
  });

  it('rechaza cuerpos vacíos o mal formados', async () => {
    expect((await request(app).post('/api/auth/register').send({})).status).toBe(400);
    expect((await request(app).post('/api/auth/register').send({ username: 'x' })).status).toBe(400);
  });
});

describe('login', () => {
  it('devuelve un token con las credenciales correctas', async () => {
    await register();
    const res = await request(app).post('/api/auth/login').send(creds);
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
  });

  it('acepta el usuario en cualquier combinación de mayúsculas', async () => {
    await register();
    const res = await request(app).post('/api/auth/login').send({ ...creds, username: 'EnRiQuE' });
    expect(res.status).toBe(200);
  });

  it('rechaza una contraseña incorrecta', async () => {
    await register();
    const res = await request(app).post('/api/auth/login').send({ ...creds, password: 'otra-cosa-larga' });
    expect(res.status).toBe(401);
  });

  it('da el mismo error si el usuario no existe', async () => {
    const noUser = await request(app).post('/api/auth/login').send(creds);
    await register();
    const badPass = await request(app).post('/api/auth/login').send({ ...creds, password: 'otra-cosa-larga' });
    // Mismo mensaje: no se filtra si el nombre está registrado.
    expect(noUser.status).toBe(401);
    expect(noUser.body.error).toBe(badPass.body.error);
  });
});

describe('sesión', () => {
  it('devuelve el usuario del token', async () => {
    const token = await register();
    const res = await request(app).get('/api/auth/me').set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe('enrique');
  });

  it('rechaza peticiones sin token o con token inventado', async () => {
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
    expect((await request(app).get('/api/auth/me').set(auth('basura'))).status).toBe(401);
    expect((await request(app).get('/api/auth/me').set({ Authorization: 'token-sin-bearer' })).status).toBe(401);
  });

  it('rechaza un token firmado con otro secreto', async () => {
    const otherApp = createApp({ db, jwtSecret: 'otro-secreto-distinto-de-32-caracteres!', bcryptRounds: 4 });
    const res = await request(otherApp).post('/api/auth/register').send({ ...creds, username: 'otro' });
    // El token vale en su app, pero no en la nuestra.
    expect((await request(app).get('/api/auth/me').set(auth(res.body.token))).status).toBe(401);
  });

  it('invalida el token al borrar la cuenta', async () => {
    const token = await register();
    expect((await request(app).delete('/api/auth/me').set(auth(token))).status).toBe(204);
    expect((await request(app).get('/api/auth/me').set(auth(token))).status).toBe(401);
  });
});

describe('sincronización del estado', () => {
  const state = { routine: { id: 'r', days: [] }, history: [] };

  it('una cuenta nueva no tiene estado guardado', async () => {
    const token = await register();
    const res = await request(app).get('/api/state').set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ state: null, revision: 0, updatedAt: null });
  });

  it('guarda y recupera el estado', async () => {
    const token = await register();
    const put = await request(app).put('/api/state').set(auth(token)).send({ state });
    expect(put.status).toBe(200);
    expect(put.body.revision).toBe(1);

    const get = await request(app).get('/api/state').set(auth(token));
    expect(get.body.state).toEqual(state);
    expect(get.body.revision).toBe(1);
  });

  it('sube la revisión en cada guardado', async () => {
    const token = await register();
    await request(app).put('/api/state').set(auth(token)).send({ state });
    const second = await request(app).put('/api/state').set(auth(token)).send({ state });
    expect(second.body.revision).toBe(2);
  });

  it('rechaza guardar sobre una revisión vieja y devuelve lo que hay', async () => {
    const token = await register();
    await request(app).put('/api/state').set(auth(token)).send({ state });
    // Otro dispositivo guarda mientras tanto.
    await request(app).put('/api/state').set(auth(token)).send({ state: { ...state, v: 2 } });

    const stale = await request(app)
      .put('/api/state')
      .set(auth(token))
      .send({ state: { ...state, v: 3 }, baseRevision: 1 });

    expect(stale.status).toBe(409);
    expect(stale.body.revision).toBe(2);
    expect(stale.body.state).toEqual({ ...state, v: 2 });
  });

  it('acepta el guardado si la revisión base coincide', async () => {
    const token = await register();
    const first = await request(app).put('/api/state').set(auth(token)).send({ state });
    const second = await request(app)
      .put('/api/state')
      .set(auth(token))
      .send({ state: { ...state, v: 2 }, baseRevision: first.body.revision });
    expect(second.status).toBe(200);
    expect(second.body.revision).toBe(2);
  });

  it('permite el primer guardado con baseRevision 0', async () => {
    const token = await register();
    const res = await request(app).put('/api/state').set(auth(token)).send({ state, baseRevision: 0 });
    expect(res.status).toBe(200);
  });

  it('rechaza un estado ausente', async () => {
    const token = await register();
    expect((await request(app).put('/api/state').set(auth(token)).send({})).status).toBe(400);
    expect((await request(app).put('/api/state').set(auth(token)).send({ state: null })).status).toBe(400);
  });

  it('exige autenticación', async () => {
    expect((await request(app).get('/api/state')).status).toBe(401);
    expect((await request(app).put('/api/state').send({ state })).status).toBe(401);
  });

  it('mantiene separados los datos de cada usuario', async () => {
    const tokenA = await register();
    const tokenB = await register({ username: 'otra-persona' });

    await request(app).put('/api/state').set(auth(tokenA)).send({ state: { quien: 'A' } });
    await request(app).put('/api/state').set(auth(tokenB)).send({ state: { quien: 'B' } });

    expect((await request(app).get('/api/state').set(auth(tokenA))).body.state).toEqual({ quien: 'A' });
    expect((await request(app).get('/api/state').set(auth(tokenB))).body.state).toEqual({ quien: 'B' });
  });

  it('borra el estado junto con la cuenta', async () => {
    const token = await register();
    await request(app).put('/api/state').set(auth(token)).send({ state });
    await request(app).delete('/api/auth/me').set(auth(token));

    const rows = db.prepare('SELECT COUNT(*) AS n FROM states').get() as { n: number };
    expect(rows.n).toBe(0);
  });

  it('conserva un histórico realista', async () => {
    const token = await register();
    const big = {
      history: Array.from({ length: 200 }, (_, i) => ({
        id: `s${i}`,
        exercises: [{ exerciseId: 'bench-press', loggedSets: [{ weight: 100, reps: 8 }] }],
      })),
    };
    const put = await request(app).put('/api/state').set(auth(token)).send({ state: big });
    expect(put.status).toBe(200);
    const get = await request(app).get('/api/state').set(auth(token));
    expect(get.body.state.history).toHaveLength(200);
  });
});

describe('CORS', () => {
  it('permite las peticiones desde la PWA', async () => {
    const res = await request(app).options('/api/state');
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('*');
    expect(res.headers['access-control-allow-headers']).toMatch(/Authorization/);
  });
});
