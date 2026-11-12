// Bundles the functions (and the contracts package) into lib/index.js.
// Runtime deps (firebase-admin, firebase-functions, zod) stay external and are
// installed by Cloud Build from package.json, so the deployed source is self-contained.
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
await build({
  entryPoints: ['src/index.ts'],
  outfile: 'lib/index.js',
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  sourcemap: true,
  external: Object.keys(pkg.dependencies),
  logLevel: 'info',
});
// Deploy manifest without workspace-only devDependencies.
mkdirSync('lib', { recursive: true });
writeFileSync(
  'lib/package.json',
  JSON.stringify({ type: 'module', main: 'index.js', engines: pkg.engines, dependencies: pkg.dependencies }, null, 2),
);

// firebase-tools loads the bundle locally to discover the functions, so the runtime deps
// must sit next to it. node_modules itself is not uploaded (see firebase.json "ignore").
if (process.argv.includes('--with-deps')) {
  const { execFileSync } = await import('node:child_process');
  const { existsSync } = await import('node:fs');
  execFileSync('npm', ['install', '--omit=dev', '--no-audit', '--no-fund', '--no-package-lock'], { cwd: 'lib', stdio: 'inherit' });
  if (!existsSync('lib/node_modules/.bin/firebase-functions')) throw new Error('firebase-functions was not installed into lib/');
  console.log('✓ runtime dependencies installed in lib/');
}
