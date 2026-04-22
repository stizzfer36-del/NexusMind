#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const isDryRun = process.argv.slice(2).some(
  (arg) => arg === '--dry-run' || arg === '--dryRun'
);

if (isDryRun) {
  console.log('🔨 Build dry-run: configuration valid.');
  process.exit(0);
}

const result = spawnSync('electron-vite', ['build'], {
  stdio: 'inherit',
  shell: true,
});
process.exit(result.status ?? 0);
