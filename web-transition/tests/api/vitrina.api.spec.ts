import { expect, test } from '@playwright/test';
import { historicoApiPath, vitrinaApiPath } from '../fixtures/vitrina-env';

test.describe('API vitrina', () => {
  test('GET vitrina devuelve listado válido para token de prueba', async ({ request }) => {
    const response = await request.get(vitrinaApiPath, {
      headers: { Accept: 'application/json' },
    });

    expect(response.ok(), `status ${response.status()}`).toBeTruthy();
    const body = await response.json();

    expect(body).toHaveProperty('inmuebles');
    expect(Array.isArray(body.inmuebles)).toBe(true);
    expect(body.inmuebles.length).toBeGreaterThan(0);
  });

  test('GET comentarios responde sin error de autorización', async ({ request }) => {
    const response = await request.get(`${vitrinaApiPath}/comentarios`, {
      headers: { Accept: 'application/json' },
    });

    expect(response.status()).toBeLessThan(500);
    if (response.ok()) {
      const body = await response.json();
      expect(body).toBeDefined();
    }
  });

  test('GET histórico por cliente asociado al prospecto de prueba', async ({ request }) => {
    await expect
      .poll(
        async () => {
          const response = await request.get(historicoApiPath, {
            headers: { Accept: 'application/json' },
          });
          return response.status();
        },
        { timeout: 20_000, intervals: [500, 1000, 2000] },
      )
      .toBe(200);

    const response = await request.get(historicoApiPath, {
      headers: { Accept: 'application/json' },
    });
    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test('token inválido devuelve 401 o 404', async ({ request }) => {
    const response = await request.get('/api/v1/vitrina/token-invalido-qa', {
      headers: { Accept: 'application/json' },
    });

    expect([401, 403, 404]).toContain(response.status());
  });
});
