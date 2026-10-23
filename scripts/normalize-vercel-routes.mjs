import { readFile, writeFile } from 'node:fs/promises';

// Header-only Build Output API rules must continue to the function/static route.
// Nitro 3 currently emits these without continuation, which shadows /api/* on Vercel.
const file = '.vercel/output/config.json';
if (process.env.VERCEL) {
  const config = JSON.parse(await readFile(file, 'utf8'));
  for (const route of config.routes || [])
    if (route.headers && !route.dest && !route.handle) route.continue = true;
  await writeFile(file, JSON.stringify(config, null, 2) + '\n');
}
