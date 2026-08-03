/**
 * Build de Vercel — solo React + index marketing.
 * - Construye la app React (base /react/)
 * - Publica React en .vercel-out/react/
 * - Conserva el index.html raíz (redirect marketing)
 *
 * Uso: node scripts/vercel-build.mjs
 */
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  rmSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const WEB = join(ROOT, 'web-transition');
const OUT = join(ROOT, '.vercel-out');
const REACT_OUT = join(OUT, 'react');

function run(command, args, opts = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: true,
    ...opts,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function copyIfExists(src, dest) {
  if (!existsSync(src)) {
    console.warn(`[vercel-build] omitido (no existe): ${src}`);
    return;
  }
  cpSync(src, dest, { recursive: true });
}

console.log('[vercel-build] limpiando .vercel-out …');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

console.log('[vercel-build] instalando deps + build React (base=/react/) …');
if (process.env.VERCEL) {
  const install = spawnSync('npm', ['ci'], {
    cwd: WEB,
    shell: true,
    stdio: 'inherit',
    env: process.env,
  });
  if (install.status !== 0) {
    console.warn('[vercel-build] npm ci falló; reintentando con npm install …');
    run('npm', ['install'], { cwd: WEB });
  }
} else if (!existsSync(join(WEB, 'node_modules', 'vite'))) {
  run('npm', ['install'], { cwd: WEB });
} else {
  console.log('[vercel-build] node_modules presente (local); se omite install');
}
run('npm', ['run', 'build:vercel'], { cwd: WEB });

const dist = join(WEB, 'dist');
if (!existsSync(dist)) {
  console.error('[vercel-build] no se encontró web-transition/dist');
  process.exit(1);
}

copyIfExists(join(ROOT, 'index.html'), join(OUT, 'index.html'));

console.log('[vercel-build] copiando React → .vercel-out/react/ …');
mkdirSync(REACT_OUT, { recursive: true });
for (const entry of readdirSync(dist)) {
  cpSync(join(dist, entry), join(REACT_OUT, entry), { recursive: true });
}

const listing = readdirSync(OUT)
  .map((name) => {
    const s = statSync(join(OUT, name));
    return `  ${s.isDirectory() ? 'dir ' : 'file'} ${name}`;
  })
  .join('\n');
console.log(`[vercel-build] listo.\n${listing}`);
