# Reglas de testing — Vitrina React (`web-transition`)

## Stack

- **Unitarios:** Vitest + jsdom en `src/**/*.test.ts`
- **E2E:** Playwright (Chromium) en `tests/e2e/`
- **API:** Playwright `request` en `tests/api/`
- **Accesibilidad:** `@axe-core/playwright` — CI bloquea en `critical` y `serious`.
- **Factories:** `tests/factories/` (patrón builder, datos reutilizables)

## Vitrina de prueba

- URL: `https://visualizadorinmuebles.habitarinmobiliaria.co/vitrina/MTk3OTI4MTI3Mzc5`
- Token URL: `MTk3OTI4MTI3Mzc5` (base64 de HubSpot ID `197928127379`)
- Token API: el backend usa el ID plano (`resolveToken` → `197928127379`); ver `tests/fixtures/vitrina-env.ts`
- Variables: ver `web-transition/tests/.env.test.example`

## Convenciones

1. **Page Object Model** para E2E (`tests/e2e/pages/`). No repetir selectores en cada spec.
2. **Selectores estables:** preferir `getByRole`, `#vitrina-search-input`, `data-property-code`, `aria-label`.
3. **Sin waits fijos:** usar `expect`, `waitFor`, estados de Playwright; nunca `waitForTimeout` salvo depuración temporal.
4. **Casos negativos:** token inválido, búsqueda sin resultados, pestañas vacías, errores de red simulados.
5. **Factories** para `VitrinaInmueble`, `HistoricoInmueble` y `PropertyDetail`; no duplicar payloads en specs.
6. **Lógica pura primero:** priorizar tests en `src/utils/` antes de E2E costosos.
7. **No mutar prod en tests:** no ejecutar `aprobar`/`descartar` contra la vitrina de prueba en CI automático.
8. **Filtro tipoNegocio:** usar `matchesTipoNegocio` / `filterInmueblesByTipoNegocio` (campo del listado). No inferir con regex.

## Comandos

```bash
cd web-transition
npm run test:unit          # Vitest
npm run test:api           # Contratos API
npm run test:e2e           # Smoke + a11y en prod (default)
npm run test:all           # Todo
npm run test:install       # Chromium para Playwright
```

## Skills QASkills (Cursor)

Instalar en la máquina del desarrollador (no van al repo):

```bash
npx @qaskills/cli add playwright-e2e
npx @qaskills/cli add vitest-testing
npx @qaskills/cli add test-data-factory
npx @qaskills/cli add axe-accessibility
```

## CI

GitHub Actions ejecuta unit → API → E2E en cada push/PR a `main`. Los E2E usan la vitrina de prueba en producción.
