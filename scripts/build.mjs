// Builds the card: esbuild bundles frontend/src into the file that the integration serves.
//   node scripts/build.mjs           → once (npm run build)
//   node scripts/build.mjs --watch   → again on every change (npm run watch, the development HA)
import * as esbuild from 'esbuild';
import { fileURLToPath } from 'node:url';

export const options = {
  absWorkingDir: fileURLToPath(new URL('..', import.meta.url)),
  entryPoints: ['frontend/src/index.ts'],
  outfile: 'custom_components/chauffage/frontend/chauffage-programme-card.js',
  bundle: true,
  format: 'esm',
  // The code as written: Home Assistant's frontend needs a recent browser anyway
  target: 'esnext',
  logLevel: 'info',
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--watch')) {
    await (await esbuild.context(options)).watch();
  } else {
    await esbuild.build(options);
  }
}
