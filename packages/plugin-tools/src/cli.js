#!/usr/bin/env node
import { resolve } from 'node:path';
import { loadPlugin, checkPlugin, buildPlugin } from './plugin.js';

const [command, directory = '.', ...flags] = process.argv.slice(2);
const root = resolve(directory);

try {
  if (command === 'dev' || command === 'review') {
    const { createPreviewServer } = await import('./server.js');
    const app = createPreviewServer(root, { reviewByDefault: command === 'review' });
    const port = Number(process.env.PORT ?? 4567);
    app.server.on('error', error => { console.error(error.message); process.exitCode = 1; });
    app.server.listen(port, '127.0.0.1', () => console.log(`Local plugin ${command === 'review' ? 'review board' : 'preview'}: http://127.0.0.1:${port}${command === 'review' ? '/review' : ''}`));
    const stop = async () => { await app.close(); process.exit(); };
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
  } else if (command === 'review-check') {
    const { runReview } = await import('./review-runner.js');
    const result = await runReview(await loadPlugin(root), flags);
    if (result.failed) process.exitCode = 1;
  } else if (command === 'build') {
    console.log(`Import into TRMNL: ${await buildPlugin(await loadPlugin(root))}`);
  } else if (command === 'check') {
    await checkPlugin(await loadPlugin(root));
    console.log('Settings and all four Liquid views are valid.');
  } else {
    throw new Error('Usage: trmnl-tools <dev|review|review-check|build|check> <plugin-directory>');
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
