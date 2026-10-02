import { spawnSync } from 'node:child_process';
import { chmodSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// CI needs validation, but never needs local Git hooks.
if (process.env.CI) process.exit(0);

const root = fileURLToPath(new URL('../../../', import.meta.url));
const git = args => spawnSync('git', args, { cwd: root, encoding: 'utf8' });
const repository = git(['rev-parse', '--show-toplevel']);
// Also allow installation from a source archive without a Git repository.
if (repository.status !== 0 || resolve(repository.stdout.trim()) !== resolve(root)) process.exit(0);

const configured = git(['config', '--get', 'core.hooksPath']);
if (configured.status !== 0 && configured.status !== 1) {
  throw new Error(configured.stderr || 'Unable to read Git hook configuration.');
}
if (configured.status === 0 && configured.stdout.trim() !== '.githooks') {
  console.log('Keeping existing core.hooksPath. See README.md to enable this repo’s hooks.');
  process.exit(0);
}

for (const hook of ['pre-commit', 'pre-push']) chmodSync(resolve(root, '.githooks', hook), 0o755);
const installed = git(['config', '--local', 'core.hooksPath', '.githooks']);
if (installed.status !== 0) throw new Error(installed.stderr || 'Unable to install Git hooks.');
console.log('Git hooks installed: pre-commit checks; pre-push checks, tests, and build.');
