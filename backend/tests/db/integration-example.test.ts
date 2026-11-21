import { createApp } from '../../src/app';
import { withRealServer, fireConcurrent } from '../helpers/concurrent-http';
import { connectTestDatabase, createTestPool } from './helpers/test-database';

// Ejemplo de integración de TK-00.5 (A8): demuestra el arnés. Sin lógica de negocio ni cliente de BD de la aplicación.

describe('TK-00.5 · ejemplo de integración del arnés', () => {
  test('QA-00.5-22 la conexión del arnés apunta a medsupply_test', async () => {
    const client = await connectTestDatabase();
    try {
      const { rows } = await client.query('SELECT current_database() AS name');
      expect(rows[0].name).toBe('medsupply_test');
    } finally {
      await client.end();
    }
  });

  test('QA-00.5-22 el pool del arnés da dos conexiones simultáneas con pid distinto', async () => {
    const pool = createTestPool();
    try {
      const [a, b] = await Promise.all([pool.connect(), pool.connect()]);
      try {
        const pidA = (await a.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
        const pidB = (await b.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
        expect(pidA).not.toBe(pidB);
      } finally {
        a.release();
        b.release();
      }
    } finally {
      await pool.end();
    }
  });

  describe('limpieza entre tests', () => {
    const count = async (): Promise<number> => {
      const client = await connectTestDatabase();
      try {
        return Number((await client.query('SELECT count(*) AS n FROM customers')).rows[0].n);
      } finally {
        await client.end();
      }
    };

    test('QA-00.5-22 un test deja una fila', async () => {
      expect(await count()).toBe(0);
      const client = await connectTestDatabase();
      try {
        await client.query("INSERT INTO customers (business_name, tax_id, phone) VALUES ('Ejemplo', '1-9', '+56900000000')");
      } finally {
        await client.end();
      }
      expect(await count()).toBe(1);
    });

    test('QA-00.5-22 el siguiente test no ve la fila del anterior', async () => {
      expect(await count()).toBe(0);
    });
  });

  test('QA-00.5-22 petición HTTP real a /api/v1/health con la utilidad', async () => {
    await withRealServer(createApp(), async (server) => {
      const [res] = await fireConcurrent(server, 1, '/api/v1/health');
      expect(res.status).toBe(200);
      expect(JSON.parse(res.body)).toEqual({ status: 'ok' });
    });
  });
});
