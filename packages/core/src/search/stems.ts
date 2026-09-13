// Query-side FR/EN stem map. SQLite's FTS5 has no Snowball stemmer without a custom build
// (plans/TECHNICAL-DESIGN.md §3.2), so normalisation happens on the query instead: a small explicit
// map for the irregulars and the highest-traffic vocabulary, plus a handful of conservative suffix
// rules for everything else. Keys are already diacritic-folded and lowercased.

export const STEMS: Record<string, string> = {
  // ── FR plurals and irregulars ───────────────────────────────────────────────
  chevaux: 'cheval', journaux: 'journal', travaux: 'travail', yeux: 'oeil',
  animaux: 'animal', generaux: 'general', locaux: 'local', signaux: 'signal',
  reseaux: 'reseau', bureaux: 'bureau', tableaux: 'tableau', niveaux: 'niveau',
  donnees: 'donnee', annees: 'annee', idees: 'idee', pages: 'page',
  livres: 'livre', articles: 'article', videos: 'video', images: 'image',
  outils: 'outil', projets: 'projet', modeles: 'modele', exemples: 'exemple',
  // ── FR derivational pairs ───────────────────────────────────────────────────
  creatifs: 'creatif', creative: 'creatif', creatives: 'creatif',
  generatifs: 'generatif', generative: 'generatif', generatives: 'generatif',
  heureuse: 'heureux', heureuses: 'heureux', nombreuse: 'nombreux', nombreuses: 'nombreux',
  developpements: 'developpement', apprentissages: 'apprentissage',
  traitements: 'traitement', documents: 'document', evenements: 'evenement',
  applications: 'application', informations: 'information', formations: 'formation',
  generations: 'generation', animations: 'animation', publications: 'publication',
  // ── EN plurals and irregulars ───────────────────────────────────────────────
  children: 'child', people: 'person', men: 'man', women: 'woman',
  feet: 'foot', teeth: 'tooth', mice: 'mouse', geese: 'goose',
  indices: 'index', matrices: 'matrix', vertices: 'vertex', analyses: 'analysis',
  theses: 'thesis', criteria: 'criterion', data: 'datum', media: 'medium',
  libraries: 'library', queries: 'query', categories: 'category', entries: 'entry',
  // ── EN -ing / -ed ───────────────────────────────────────────────────────────
  running: 'run', learning: 'learn', writing: 'write', coding: 'code',
  training: 'train', reading: 'read', building: 'build', mapping: 'map',
  clustering: 'cluster', embedding: 'embed', bookmarks: 'bookmark', tagging: 'tag',
};

/** Applied in order when STEMS has no entry. Conservative: never shortens below 4 characters. */
const SUFFIX_RULES: [RegExp, string][] = [
  [/tions$/, 'tion'],
  [/ments$/, 'ment'],
  [/euses$/, 'eux'],
  [/euse$/, 'eux'],
  [/ies$/, 'y'],
  [/ings$/, 'ing'],
  [/ing$/, ''],
  [/(?<![sui])s$/, ''],
];

const MIN_STEM = 4;

/** Fold one already-lowercased, diacritic-free token to its query-side stem. */
export function stem(token: string): string {
  const direct = STEMS[token];
  if (direct !== undefined) return direct;
  if (token.length <= MIN_STEM) return token;
  for (const [re, to] of SUFFIX_RULES) {
    if (!re.test(token)) continue;
    const out = token.replace(re, to);
    if (out.length >= MIN_STEM) return out;
  }
  return token;
}
