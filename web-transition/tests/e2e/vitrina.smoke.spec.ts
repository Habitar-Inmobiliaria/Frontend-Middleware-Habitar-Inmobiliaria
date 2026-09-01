import { expect, test } from '@playwright/test';
import { HUBSPOT_USER_ID, VITRINA_URL_TOKEN } from '../fixtures/vitrina-env';
import { VitrinaPageObject } from './pages/VitrinaPage';

test.describe('Vitrina smoke', () => {
  test('carga la vitrina de prueba y muestra pestañas', async ({ page }) => {
    const vitrina = new VitrinaPageObject(page);
    await vitrina.goto();
    await vitrina.waitForLoaded();

    await expect(vitrina.heading).toBeVisible();
    await expect(vitrina.tabList).toBeVisible();
    await expect(vitrina.tab(/Sin revisar/i)).toBeVisible();
    await expect(vitrina.tab(/Me interesa/i)).toBeVisible();
    await expect(vitrina.tab(/Histórico/i)).toBeVisible();
  });

  test('búsqueda sin coincidencias y recuperación al limpiar', async ({ page }) => {
    const vitrina = new VitrinaPageObject(page);
    await vitrina.goto();
    await vitrina.waitForLoaded();

    const initialCount = await vitrina.propertyCards.count();
    expect(initialCount).toBeGreaterThan(0);

    await vitrina.search('zzzz-sin-coincidencias-qa');
    await expect(page.getByText('Sin coincidencias', { exact: true })).toBeVisible();
    await expect(vitrina.propertyCards).toHaveCount(0);
    await expect(page.getByText('Sin resultados', { exact: true })).toBeVisible();

    await vitrina.clearSearch();
    await expect(vitrina.propertyCards).toHaveCount(initialCount);
  });

  test('cambia a pestaña Histórico', async ({ page }) => {
    const vitrina = new VitrinaPageObject(page);
    await vitrina.goto();
    await vitrina.waitForLoaded();

    await vitrina.tab(/Histórico/i).click();
    await expect(vitrina.tab(/Histórico/i)).toHaveAttribute('aria-selected', 'true');
  });

  test('metadata de vitrina de prueba', () => {
    expect(VITRINA_URL_TOKEN).toBeTruthy();
    expect(HUBSPOT_USER_ID).toBe('197928127379');
  });
});
