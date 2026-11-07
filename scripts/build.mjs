// Gera www/sync.bundle.js (Firebase + plugins do Capacitor) e copia o FontAwesome para uso offline.
import { build } from 'esbuild';
import { cpSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

await build({
  entryPoints: [join(root, 'src/native-sync.js')],
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['chrome90'],
  outfile: join(root, 'www/sync.bundle.js'),
  legalComments: 'none',
  logLevel: 'info',
});

const fa = join(root, 'node_modules/@fortawesome/fontawesome-free');
if (existsSync(fa)) {
  const out = join(root, 'www/vendor/fontawesome');
  mkdirSync(join(out, 'css'), { recursive: true });
  cpSync(join(fa, 'css/all.min.css'), join(out, 'css/all.min.css'));
  cpSync(join(fa, 'webfonts'), join(out, 'webfonts'), { recursive: true });
  console.log('FontAwesome copiado para uso offline.');
} else {
  console.warn('FontAwesome não encontrado em node_modules; o app usará o CDN.');
}
