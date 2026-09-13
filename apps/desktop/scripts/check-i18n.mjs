#!/usr/bin/env node
// P0 task 15, enforcement layer 2: FR and EN must carry exactly the same key set in every
// namespace, and no value may be empty. FR is the source of truth; a key present only in FR is
// an untranslated string, a key present only in EN is a leftover. Both fail the build.
//
// Layer 1 is the ESLint rule i18next/no-literal-string (eslint.config.js).
// Run: npm run i18n:check

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const I18N_DIR = resolve(HERE, '..', 'src', 'renderer', 'i18n');
const SOURCE_LOCALE = 'fr';
const TARGET_LOCALES = ['en'];

/** @param {unknown} value @param {string} prefix @param {Map<string,string>} out */
function flatten(value, prefix, out) {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    for (const [k, v] of Object.entries(value)) {
      flatten(v, prefix ? `${prefix}.${k}` : k, out);
    }
    return out;
  }
  out.set(prefix, typeof value === 'string' ? value : JSON.stringify(value));
  return out;
}

/** @param {string} locale */
function readLocale(locale) {
  const dir = join(I18N_DIR, locale);
  let entries;
  try {
    entries = readdirSync(dir).filter((f) => f.endsWith('.json'));
  } catch {
    throw new Error(`missing locale directory: ${dir}`);
  }
  /** @type {Map<string, Map<string,string>>} */
  const namespaces = new Map();
  for (const file of entries) {
    const path = join(dir, file);
    if (!statSync(path).isFile()) continue;
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(path, 'utf8'));
    } catch (e) {
      throw new Error(`${locale}/${file}: invalid JSON — ${e instanceof Error ? e.message : e}`);
    }
    namespaces.set(file.replace(/\.json$/, ''), flatten(parsed, '', new Map()));
  }
  return namespaces;
}

const problems = [];
const source = readLocale(SOURCE_LOCALE);

if (source.size === 0) problems.push(`${SOURCE_LOCALE}: no namespace files found in ${I18N_DIR}`);

// Empty values are a failure in every locale, source included.
for (const [locale, namespaces] of [[SOURCE_LOCALE, source], ...TARGET_LOCALES.map((l) => [l, readLocale(l)])]) {
  for (const [ns, keys] of namespaces) {
    for (const [key, value] of keys) {
      if (value.trim() === '') problems.push(`${locale}/${ns}.json: empty value for "${key}"`);
    }
  }
}

for (const locale of TARGET_LOCALES) {
  const target = readLocale(locale);

  for (const ns of source.keys()) {
    if (!target.has(ns)) problems.push(`${locale}: missing namespace "${ns}.json"`);
  }
  for (const ns of target.keys()) {
    if (!source.has(ns)) problems.push(`${locale}: extra namespace "${ns}.json" (not in ${SOURCE_LOCALE})`);
  }

  for (const [ns, srcKeys] of source) {
    const tgtKeys = target.get(ns);
    if (!tgtKeys) continue;
    for (const key of srcKeys.keys()) {
      if (!tgtKeys.has(key)) problems.push(`${locale}/${ns}.json: missing key "${key}"`);
    }
    for (const key of tgtKeys.keys()) {
      if (!srcKeys.has(key)) problems.push(`${locale}/${ns}.json: extra key "${key}" (not in ${SOURCE_LOCALE})`);
    }
  }
}

const total = [...source.values()].reduce((n, m) => n + m.size, 0);

if (problems.length > 0) {
  console.error(`i18n check FAILED — ${problems.length} problem(s):`);
  for (const p of problems) console.error(`  • ${p}`);
  process.exit(1);
}

console.log(
  `i18n check OK — ${source.size} namespace(s), ${total} key(s), locales: ${[SOURCE_LOCALE, ...TARGET_LOCALES].join(', ')}`,
);
