import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(import.meta.dirname, '..', 'fixtures', 'import');

export function fixture(name: string): string {
  return readFileSync(join(DIR, name), 'utf8');
}
