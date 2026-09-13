import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { SHAREABLE_ENTITIES } from '../src/ops/types.js';

// "No feature module issues an UPDATE against a shareable table" (plans/TECHNICAL-DESIGN.md §3.7).
// A lint rule can be disabled in a commit nobody reads, so this is a CI-blocking test, per the
// p0-foundation risk register ("the op-log layer feels like ceremony and gets bypassed").

const SRC = join(import.meta.dirname, '..', 'src');
/** The two places allowed to write a shareable table: the mutation layer and the DDL itself. */
const ALLOWED = ['ops', join('db', 'migrations')];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

/** `UPDATE|INSERT INTO|DELETE FROM <shareable>` with a word boundary, so `bookmarks_fts` and
 *  `bookmark_tags` are each matched as themselves and never as a prefix of the other. */
const FORBIDDEN = new RegExp(
  `\\b(?:UPDATE|INSERT\\s+(?:OR\\s+\\w+\\s+)?INTO|DELETE\\s+FROM)\\s+(?:${SHAREABLE_ENTITIES.join('|')})\\b`,
  'gi',
);

/** Every single-, double- and back-quoted string literal in a TypeScript source. */
const STRING_LITERAL = /`(?:[^`\\]|\\.)*`|'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"/g;

describe('no direct mutation of a shareable table', () => {
  const files = walk(SRC).filter((f) => {
    const rel = relative(SRC, f);
    return !ALLOWED.some((a) => rel === a || rel.startsWith(a + '\\') || rel.startsWith(a + '/'));
  });

  it('has files to check and excludes only ops/ and db/migrations/', () => {
    expect(files.length).toBeGreaterThan(5);
    expect(files.some((f) => relative(SRC, f).includes('search'))).toBe(true);
  });

  it('finds no forbidden SQL in any string literal', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      for (const lit of text.match(STRING_LITERAL) ?? []) {
        for (const hit of lit.match(FORBIDDEN) ?? []) {
          offenders.push(`${relative(SRC, file)}: ${hit.replace(/\s+/g, ' ')}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('still catches a planted violation', () => {
    const planted = `const q = "UPDATE bookmarks SET title = ?";`;
    const hits = (planted.match(STRING_LITERAL) ?? []).flatMap((l) => l.match(FORBIDDEN) ?? []);
    expect(hits).toHaveLength(1);
    // …and does not false-positive on the FTS shadow tables
    const ok = 'INSERT INTO bookmarks_fts(bookmarks_fts) VALUES(\'rebuild\')';
    expect(ok.match(FORBIDDEN)).toBe(null);
  });

  it('ops/ really does write them (the rule would be vacuous otherwise)', () => {
    const opsText = walk(join(SRC, 'ops'))
      .map((f) => readFileSync(f, 'utf8'))
      .join('\n');
    expect(opsText).toMatch(/UPDATE \$\{p\.table\}/);
    expect(opsText).toMatch(/DELETE FROM \$\{p\.table\}/);
  });
});
