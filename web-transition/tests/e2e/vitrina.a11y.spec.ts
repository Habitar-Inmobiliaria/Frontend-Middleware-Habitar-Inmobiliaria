import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { VitrinaPageObject } from './pages/VitrinaPage';

test.describe('Vitrina accesibilidad', () => {
  test('sin violaciones críticas ni graves en la vista principal', async ({ page }) => {
    const vitrina = new VitrinaPageObject(page);
    await vitrina.goto();
    await vitrina.waitForLoaded();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();

    const severe = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );

    expect(severe, formatViolations(severe)).toHaveLength(0);
  });
});

function formatViolations(
  violations: { id: string; impact?: string; description: string; helpUrl: string }[],
): string {
  if (violations.length === 0) return '';
  return violations
    .map((v) => `${v.id} (${v.impact}): ${v.description}\n  ${v.helpUrl}`)
    .join('\n');
}
