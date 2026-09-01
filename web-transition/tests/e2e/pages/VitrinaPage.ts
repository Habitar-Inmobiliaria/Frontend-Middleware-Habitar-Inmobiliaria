import type { Page } from '@playwright/test';
import { vitrinaPath } from '../../fixtures/vitrina-env';

/** Page Object de la vitrina (POM). */
export class VitrinaPageObject {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto(vitrinaPath);
  }

  get heading() {
    return this.page.getByRole('heading', { name: 'Vitrina Inmobiliaria' });
  }

  get tabList() {
    return this.page.getByRole('tablist', { name: 'Secciones de propiedades' });
  }

  tab(name: RegExp | string) {
    return this.page.getByRole('tab', { name });
  }

  get searchInput() {
    return this.page.locator('#vitrina-search-input');
  }

  get searchHint() {
    return this.page.locator('[class*="hint"]');
  }

  get propertyCards() {
    return this.page.locator('article[data-property-code]');
  }

  async waitForLoaded() {
    await this.page.getByLabel('Cargando vitrina').waitFor({ state: 'hidden', timeout: 60_000 });
    await this.heading.waitFor({ state: 'visible', timeout: 60_000 });
    // Evita scan a11y durante la animación de entrada (opacity < 1).
    await this.page.waitForFunction(
      () => {
        const h1 = document.querySelector('h1');
        if (!h1) return false;
        return parseFloat(getComputedStyle(h1).opacity) >= 0.99;
      },
      { timeout: 15_000 },
    );
  }

  async search(query: string) {
    await this.searchInput.fill(query);
  }

  async clearSearch() {
    await this.searchInput.fill('');
  }
}
