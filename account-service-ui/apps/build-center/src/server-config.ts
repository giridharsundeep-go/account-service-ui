import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { parseEnv } from 'node:util';

const configPath = join(homedir(), '.config', 'professy', 'build-center.env');
let fileSettings: NodeJS.Dict<string> = {};

try {
  fileSettings = parseEnv(readFileSync(configPath, 'utf8'));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
    console.warn('Build Center could not read its local configuration file.');
  }
}

export function setting(name: string): string | undefined {
  return (process.env[name] ?? fileSettings[name])?.trim() || undefined;
}

export function privateKeyPath(path: string): string {
  if (path.startsWith('~/')) return join(homedir(), path.slice(2));
  return resolve(dirname(configPath), path);
}
