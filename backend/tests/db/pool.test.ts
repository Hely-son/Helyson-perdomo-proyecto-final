import { createTestPool } from './helpers/test-database';

// Pruebas de aceptación de TK-00.5 · pool del arnés (D-3).

describe('TK-00.5 · pool del arnés', () => {
  test('QA-00.5-17 es un pg.Pool con max > 1 y cada cliente informa medsupply_test', async () => {
    const pool = createTestPool();
    try {
      expect(pool.options.max).toBeGreaterThan(1);
      const clients = await Promise.all([pool.connect(), pool.connect()]);
      try {
        for (const c of clients) {
          const { rows } = await c.query('SELECT current_database() AS name');
          expect(rows[0].name).toBe('medsupply_test');
        }
      } finally {
        clients.forEach((c) => c.release());
      }
    } finally {
      await pool.end();
    }
  });

  test('QA-00.5-18 dos conexiones simultáneas: pids distintos y el advisory lock de una bloquea a la otra', async () => {
    const pool = createTestPool();
    const [a, b] = await Promise.all([pool.connect(), pool.connect()]);
    try {
      const pidA = (await a.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      const pidB = (await b.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      expect(pidA).not.toBe(pidB);
      expect(pool.totalCount).toBeGreaterThanOrEqual(2);

      expect((await a.query('SELECT pg_try_advisory_lock(500500) AS ok')).rows[0].ok).toBe(true);
      expect((await b.query('SELECT pg_try_advisory_lock(500500) AS ok')).rows[0].ok).toBe(false);
      await a.query('SELECT pg_advisory_unlock(500500)');
      expect((await b.query('SELECT pg_try_advisory_lock(500500) AS ok')).rows[0].ok).toBe(true);
      await b.query('SELECT pg_advisory_unlock(500500)');
    } finally {
      a.release();
      b.release();
      await pool.end();
    }
  });
});
