import { uuidv7 } from '../ids/uuid.js';
import type { OpInput } from '../ops/types.js';
import type { Clock, DbHandle, Random } from '../ports/index.js';

// Tag identity. `tags.label_norm` is UNIQUE per collection, so every find-or-create goes through
// one folding function: NFKC (so ﬁ and fi are one tag), casefold, strip combining marks, collapse
// whitespace. `Photo`, `photo` and `PHOTO ` are therefore the same tag.

export function normalizeTagLabel(label: string): string {
  return label
    .normalize('NFKC')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

interface TagRowLite {
  id: string;
  label_norm: string;
}

/**
 * In-memory mirror of one collection's tags. `ensure` never touches the database: it hands back
 * the tag id and, when the tag is new, the `create` op the caller must append to its batch. That
 * is what keeps a 100k import to one `applyOps` transaction per batch instead of one per tag.
 */
export class TagIndex {
  private readonly byNorm = new Map<string, string>();
  private readonly ids = new Set<string>();

  constructor(
    private readonly collectionId: string,
    private readonly clock: Clock,
    private readonly random: Random,
  ) {}

  /** Primes the index from the `tags` table. Tags are thousands, not millions: one query. */
  static load(db: DbHandle, collectionId: string, clock: Clock, random: Random): TagIndex {
    const index = new TagIndex(collectionId, clock, random);
    const rows = db
      .prepare('SELECT id, label_norm FROM tags WHERE collection_id = ? AND deleted_at IS NULL')
      .all<TagRowLite>(collectionId);
    for (const row of rows) index.remember(row.id, row.label_norm);
    return index;
  }

  remember(id: string, labelNorm: string): void {
    this.byNorm.set(labelNorm, id);
    this.ids.add(id);
  }

  /** Existing tag id for a label, or undefined. */
  findByLabel(label: string): string | undefined {
    return this.byNorm.get(normalizeTagLabel(label));
  }

  /** The UI sends tag ids for "remove" and labels for "add"; this accepts either. */
  resolve(labelOrId: string): string | undefined {
    if (this.ids.has(labelOrId)) return labelOrId;
    return this.findByLabel(labelOrId);
  }

  /** Find-or-create. The returned `create` op is undefined when the tag already existed. */
  ensure(label: string): { id: string; create?: OpInput } {
    const norm = normalizeTagLabel(label);
    const existing = this.byNorm.get(norm);
    if (existing !== undefined) return { id: existing };

    const id = uuidv7(this.clock, this.random);
    this.remember(id, norm);
    return {
      id,
      create: {
        collectionId: this.collectionId,
        entity: 'tags',
        entityId: id,
        op: 'create',
        value: { label: label.trim() || norm, label_norm: norm },
      },
    };
  }
}
