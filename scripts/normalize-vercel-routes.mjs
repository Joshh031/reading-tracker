import { readFile, writeFile } from 'node:fs/promises';

// Header-only Build Output API rules must continue to the function/static route.
// Nitro 3 currently emits these without continuation, which shadows /api/* on Vercel.
const file = '.vercel/output/config.json';
if (process.env.VERCEL) {
  const config = JSON.parse(await readFile(file, 'utf8'));
  for (const route of config.routes || [])
    if (route.headers && !route.dest && !route.handle) route.continue = true;
  // Route the API namespace explicitly; Vercel does not apply its SPA fallback to it.
  const filesystem = config.routes.findIndex(route => route.handle === 'filesystem');
  if (!config.routes.some(route => route.src === '/api/(.*)' && route.dest === '/__server'))
    config.routes.splice(filesystem < 0 ? 0 : filesystem, 0, {src: '/api/(.*)', dest: '/__server'});
  await writeFile(file, JSON.stringify(config, null, 2) + '\n');
}
