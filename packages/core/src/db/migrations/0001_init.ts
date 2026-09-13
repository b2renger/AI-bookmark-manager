// Schema v1. FROZEN: once shipped, this string is never edited — corrections land in 0002+.
// Source of truth is plans/TECHNICAL-DESIGN.md §3.1–3.2; kept as a TypeScript string because core
// cannot read files at runtime (firewall A).
//
// Two deviations from §3.1, both deliberate:
//   * `ops.applied` — §3.7 step 3 records a stale op with applied = 0 and §3.8's revert query reads
//     `WHERE applied = 1`, but the DDL block omitted the column. Added here.
//   * the `vec0` virtual table of §3.3 is NOT created here: the sqlite-vec extension may be absent
//     and a migration that throws would wedge the database. db/vec.ts creates it on demand.

/** The six FTS5 triggers. Exported so search/fts.ts can drop and recreate them around a bulk import
 *  without re-stating the SQL (they must stay byte-identical to what the migration installed). */
export const FTS_TRIGGERS_SQL = `
CREATE TRIGGER bm_ai AFTER INSERT ON bookmarks BEGIN
  INSERT INTO bookmarks_fts(rowid,title,summary,note,author,url_text)
  VALUES (new.rowid,new.title,new.summary,new.note,coalesce(new.author,''),
          replace(replace(new.url_norm,'/',' '),'-',' '));
END;
CREATE TRIGGER bm_ad AFTER DELETE ON bookmarks BEGIN
  INSERT INTO bookmarks_fts(bookmarks_fts,rowid,title,summary,note,author,url_text)
  VALUES ('delete',old.rowid,old.title,old.summary,old.note,coalesce(old.author,''),
          replace(replace(old.url_norm,'/',' '),'-',' '));
END;
CREATE TRIGGER bm_au AFTER UPDATE ON bookmarks BEGIN
  INSERT INTO bookmarks_fts(bookmarks_fts,rowid,title,summary,note,author,url_text)
  VALUES ('delete',old.rowid,old.title,old.summary,old.note,coalesce(old.author,''),
          replace(replace(old.url_norm,'/',' '),'-',' '));
  INSERT INTO bookmarks_fts(rowid,title,summary,note,author,url_text)
  VALUES (new.rowid,new.title,new.summary,new.note,coalesce(new.author,''),
          replace(replace(new.url_norm,'/',' '),'-',' '));
END;
CREATE TRIGGER ch_ai AFTER INSERT ON chunks BEGIN
  INSERT INTO chunks_fts(rowid,text,heading_path) VALUES (new.rowid,new.text,new.heading_path);
END;
CREATE TRIGGER ch_ad AFTER DELETE ON chunks BEGIN
  INSERT INTO chunks_fts(chunks_fts,rowid,text,heading_path)
  VALUES ('delete',old.rowid,old.text,old.heading_path);
END;
CREATE TRIGGER ch_au AFTER UPDATE ON chunks BEGIN
  INSERT INTO chunks_fts(chunks_fts,rowid,text,heading_path)
  VALUES ('delete',old.rowid,old.text,old.heading_path);
  INSERT INTO chunks_fts(rowid,text,heading_path) VALUES (new.rowid,new.text,new.heading_path);
END;
`;

/** Names of the triggers in FTS_TRIGGERS_SQL, in creation order. */
export const FTS_TRIGGER_NAMES = ['bm_ai', 'bm_ad', 'bm_au', 'ch_ai', 'ch_ad', 'ch_au'] as const;

/** The unshared library: a real collection with a fixed id, so every row has a collection_id.
 *  A valid UUIDv7 (version nibble 7, variant nibble 8) so it passes db/schema.ts's `Uuid`. */
export const LIBRARY_COLLECTION_ID = '00000000-0000-7000-8000-000000000001';

const TABLES_SQL = `
--------------------------------------------------------------------- collections
CREATE TABLE collections (
  id                TEXT PRIMARY KEY NOT NULL,
  name              TEXT NOT NULL,
  description       TEXT NOT NULL DEFAULT '',
  visibility        TEXT NOT NULL DEFAULT 'private'
                      CHECK (visibility IN ('private','shared','published')),
  epoch             INTEGER NOT NULL DEFAULT 1,
  key_ref           TEXT,
  snapshots_enabled INTEGER NOT NULL DEFAULT 0,
  owner_pubkey      TEXT NOT NULL,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  deleted_at        TEXT
);
INSERT INTO collections (id,name,visibility,owner_pubkey,created_at,updated_at)
VALUES ('${LIBRARY_COLLECTION_ID}','Ma bibliothèque','private','',
        strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'));

--------------------------------------------------------------------- bookmarks
CREATE TABLE bookmarks (
  id                 TEXT PRIMARY KEY NOT NULL,
  collection_id      TEXT NOT NULL REFERENCES collections(id),
  url                TEXT NOT NULL,
  url_norm           TEXT NOT NULL,
  url_hash           TEXT NOT NULL,
  title              TEXT NOT NULL DEFAULT '',
  summary            TEXT NOT NULL DEFAULT '',
  summary_kind       TEXT NOT NULL DEFAULT 'none'
                       CHECK (summary_kind IN ('none','extractive','llm','imported')),
  summary_model_id   TEXT,
  author             TEXT,
  platform           TEXT,
  lang               TEXT,
  thumbnail_url      TEXT,
  note               TEXT NOT NULL DEFAULT '',
  status             TEXT NOT NULL DEFAULT 'new'
                       CHECK (status IN ('new','fetching','ready','partial','failed')),
  starred            INTEGER NOT NULL DEFAULT 0,
  open_count         INTEGER NOT NULL DEFAULT 0,
  last_opened_at     TEXT,
  confidence         INTEGER,
  confidence_reason  TEXT,
  acquisition_method TEXT,
  current_version_id TEXT,
  map_x              REAL,
  map_y              REAL,
  map_run_id         TEXT,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL,
  deleted_at         TEXT
);
CREATE UNIQUE INDEX ix_bm_urlhash   ON bookmarks(collection_id, url_hash) WHERE deleted_at IS NULL;
CREATE INDEX        ix_bm_coll_date ON bookmarks(collection_id, created_at DESC);
CREATE INDEX        ix_bm_status    ON bookmarks(status) WHERE status <> 'ready';
CREATE INDEX        ix_bm_map       ON bookmarks(map_run_id) WHERE map_x IS NOT NULL;

--------------------------------------------------------------- content_versions
CREATE TABLE content_versions (
  id                TEXT PRIMARY KEY NOT NULL,
  bookmark_id       TEXT NOT NULL REFERENCES bookmarks(id) ON DELETE CASCADE,
  fetched_at        TEXT NOT NULL,
  method            TEXT NOT NULL,
  tier              INTEGER NOT NULL,
  http_status       INTEGER,
  final_url         TEXT,
  lang              TEXT,
  title             TEXT,
  text              TEXT,
  text_hash         TEXT,
  html_hash         TEXT,
  snapshot_hash     TEXT,
  byte_len          INTEGER,
  confidence        INTEGER NOT NULL,
  confidence_reason TEXT NOT NULL,
  extractor_version TEXT NOT NULL,
  error             TEXT
);
CREATE INDEX ix_cv_bm ON content_versions(bookmark_id, fetched_at DESC);

--------------------------------------------------------------------- chunks
CREATE TABLE chunks (
  id            TEXT PRIMARY KEY NOT NULL,
  bookmark_id   TEXT NOT NULL REFERENCES bookmarks(id) ON DELETE CASCADE,
  version_id    TEXT NOT NULL REFERENCES content_versions(id) ON DELETE CASCADE,
  ord           INTEGER NOT NULL,
  heading_path  TEXT NOT NULL DEFAULT '',
  char_start    INTEGER NOT NULL,
  char_end      INTEGER NOT NULL,
  token_est     INTEGER NOT NULL,
  page          INTEGER,
  text          TEXT NOT NULL
);
CREATE UNIQUE INDEX ix_chunk_ord ON chunks(version_id, ord);
CREATE INDEX        ix_chunk_bm  ON chunks(bookmark_id);

--------------------------------------------------------------------- embeddings
CREATE TABLE embeddings (
  owner_type  TEXT NOT NULL CHECK (owner_type IN ('bookmark','chunk','tag','theme','query')),
  owner_id    TEXT NOT NULL,
  model_id    TEXT NOT NULL,
  dim         INTEGER NOT NULL,
  vec         BLOB NOT NULL,
  created_at  TEXT NOT NULL,
  PRIMARY KEY (owner_type, owner_id, model_id)
);
CREATE INDEX ix_emb_model ON embeddings(model_id, owner_type);

--------------------------------------------------------------------- tags
CREATE TABLE tags (
  id            TEXT PRIMARY KEY NOT NULL,
  collection_id TEXT NOT NULL REFERENCES collections(id),
  label         TEXT NOT NULL,
  label_norm    TEXT NOT NULL,
  label_fr      TEXT,
  label_en      TEXT,
  color         TEXT,
  usage_count   INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  deleted_at    TEXT
);
CREATE UNIQUE INDEX ix_tag_norm ON tags(collection_id, label_norm) WHERE deleted_at IS NULL;

CREATE TABLE tag_aliases (
  id          TEXT PRIMARY KEY NOT NULL,
  tag_id      TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  alias       TEXT NOT NULL,
  alias_norm  TEXT NOT NULL,
  source      TEXT NOT NULL CHECK (source IN ('user','import','ai')),
  run_id      TEXT,
  created_at  TEXT NOT NULL
);
CREATE UNIQUE INDEX ix_alias_norm ON tag_aliases(alias_norm, tag_id);

CREATE TABLE bookmark_tags (
  bookmark_id TEXT NOT NULL REFERENCES bookmarks(id) ON DELETE CASCADE,
  tag_id      TEXT NOT NULL REFERENCES tags(id)      ON DELETE CASCADE,
  source      TEXT NOT NULL CHECK (source IN ('user','import','ai')),
  accepted    INTEGER NOT NULL DEFAULT 1,
  score       REAL,
  run_id      TEXT,
  created_at  TEXT NOT NULL,
  PRIMARY KEY (bookmark_id, tag_id)
);
CREATE INDEX ix_bt_tag ON bookmark_tags(tag_id) WHERE accepted = 1;

--------------------------------------------------------------------- themes
CREATE TABLE themes (
  id             TEXT PRIMARY KEY NOT NULL,
  collection_id  TEXT NOT NULL REFERENCES collections(id),
  run_id         TEXT NOT NULL,
  resolution     REAL NOT NULL,
  parent_id      TEXT REFERENCES themes(id),
  label_fr       TEXT NOT NULL,
  label_en       TEXT NOT NULL,
  description_fr TEXT NOT NULL DEFAULT '',
  description_en TEXT NOT NULL DEFAULT '',
  emoji          TEXT,
  terms          TEXT NOT NULL DEFAULT '[]',
  centroid       BLOB,
  size           INTEGER NOT NULL DEFAULT 0,
  color_idx      INTEGER,
  label_source   TEXT NOT NULL DEFAULT 'llm' CHECK (label_source IN ('llm','ctfidf','user')),
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  deleted_at     TEXT
);
CREATE INDEX ix_theme_run ON themes(collection_id, run_id, resolution);

CREATE TABLE theme_assignments (
  bookmark_id TEXT NOT NULL REFERENCES bookmarks(id) ON DELETE CASCADE,
  theme_id    TEXT NOT NULL REFERENCES themes(id)    ON DELETE CASCADE,
  resolution  REAL NOT NULL,
  score       REAL NOT NULL,
  margin      REAL NOT NULL,
  source      TEXT NOT NULL CHECK (source IN ('centroid','llm','user')),
  run_id      TEXT NOT NULL,
  PRIMARY KEY (bookmark_id, resolution)
);
CREATE INDEX ix_ta_theme ON theme_assignments(theme_id);

--------------------------------------------------------------------- tree_nodes
CREATE TABLE tree_nodes (
  id            TEXT PRIMARY KEY NOT NULL,
  collection_id TEXT NOT NULL REFERENCES collections(id),
  parent_id     TEXT REFERENCES tree_nodes(id) ON DELETE CASCADE,
  frac_index    TEXT NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('theme','query','pin','folder','bookmark')),
  ref_id        TEXT,
  label_fr      TEXT NOT NULL DEFAULT '',
  label_en      TEXT NOT NULL DEFAULT '',
  emoji         TEXT,
  query         TEXT,
  pinned        INTEGER NOT NULL DEFAULT 0,
  user_edited   INTEGER NOT NULL DEFAULT 0,
  depth         INTEGER NOT NULL DEFAULT 0 CHECK (depth <= 4),
  run_id        TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  deleted_at    TEXT
);
CREATE INDEX ix_tn_parent ON tree_nodes(collection_id, parent_id, frac_index);
CREATE INDEX ix_tn_ref    ON tree_nodes(ref_id);

--------------------------------------------------------------------- members
CREATE TABLE members (
  id            TEXT PRIMARY KEY NOT NULL,
  collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  pubkey        TEXT NOT NULL,
  x25519_pub    TEXT NOT NULL,
  name          TEXT NOT NULL DEFAULT '',
  role          TEXT NOT NULL CHECK (role IN ('owner','writer','reader')),
  epoch_granted INTEGER NOT NULL,
  added_at      TEXT NOT NULL,
  removed_at    TEXT
);
CREATE UNIQUE INDEX ix_member ON members(collection_id, pubkey);

--------------------------------------------------------------- feedback_events
CREATE TABLE feedback_events (
  id          TEXT PRIMARY KEY NOT NULL,
  at          TEXT NOT NULL,
  query_id    TEXT,
  query_text  TEXT,
  bookmark_id TEXT,
  event       TEXT NOT NULL
                CHECK (event IN ('shown','click','dwell','dismiss','open','accept','reject')),
  rank        INTEGER,
  dwell_ms    INTEGER,
  context     TEXT
);
CREATE INDEX ix_fb_bm ON feedback_events(bookmark_id, at DESC);
CREATE INDEX ix_fb_at ON feedback_events(at DESC);

CREATE TABLE search_affinity (
  kind       TEXT NOT NULL CHECK (kind IN ('tag','domain','theme')),
  key        TEXT NOT NULL,
  weight     REAL NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (kind, key)
);

--------------------------------------------------------------------- jobs
CREATE TABLE jobs (
  id           TEXT PRIMARY KEY NOT NULL,
  kind         TEXT NOT NULL,
  payload      TEXT NOT NULL,
  priority     INTEGER NOT NULL DEFAULT 2,
  status       TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','running','done','failed','cancelled','blocked')),
  attempts     INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  not_before   TEXT,
  lease_until  TEXT,
  run_id       TEXT,
  dedupe_key   TEXT,
  last_error   TEXT,
  created_at   TEXT NOT NULL,
  started_at   TEXT,
  finished_at  TEXT
);
CREATE INDEX        ix_job_ready  ON jobs(status, priority, not_before) WHERE status = 'pending';
CREATE UNIQUE INDEX ix_job_dedupe ON jobs(dedupe_key) WHERE status IN ('pending','running');

--------------------------------------------------------------------- runs
CREATE TABLE runs (
  id             TEXT PRIMARY KEY NOT NULL,
  collection_id  TEXT NOT NULL REFERENCES collections(id),
  kind           TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'planned'
                   CHECK (status IN ('planned','running','proposed','partial','accepted',
                                     'rejected','reverted','expired','failed')),
  params         TEXT NOT NULL DEFAULT '{}',
  stats          TEXT NOT NULL DEFAULT '{}',
  provider       TEXT,
  model_id       TEXT,
  cost_eur       REAL,
  reverts_run_id TEXT REFERENCES runs(id),
  started_at     TEXT NOT NULL,
  finished_at    TEXT,
  expires_at     TEXT NOT NULL
);
CREATE INDEX ix_run_status ON runs(status, started_at DESC);

CREATE TABLE run_items (
  id         TEXT PRIMARY KEY NOT NULL,
  run_id     TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  group_key  TEXT,
  entity     TEXT NOT NULL,
  entity_id  TEXT NOT NULL,
  field      TEXT,
  op         TEXT NOT NULL CHECK (op IN ('create','set','delete','move','link','unlink')),
  before     TEXT,
  after      TEXT,
  confidence REAL,
  reason_fr  TEXT,
  reason_en  TEXT,
  decision   TEXT NOT NULL DEFAULT 'pending'
               CHECK (decision IN ('pending','accept','reject')),
  decided_at TEXT,
  op_id      TEXT
);
CREATE INDEX ix_ri_run ON run_items(run_id, decision, group_key);

--------------------------------------------------------------------- ops
CREATE TABLE ops (
  id            TEXT PRIMARY KEY NOT NULL,
  collection_id TEXT NOT NULL,
  entity        TEXT NOT NULL,
  entity_id     TEXT NOT NULL,
  field         TEXT,
  op            TEXT NOT NULL CHECK (op IN ('create','set','delete','move','link','unlink')),
  value         TEXT,
  inverse       TEXT,
  hlc           TEXT NOT NULL,
  actor_pubkey  TEXT NOT NULL,
  origin        TEXT NOT NULL DEFAULT 'local',
  run_id        TEXT,
  applied       INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL
);
CREATE INDEX        ix_ops_entity ON ops(entity, entity_id, field, hlc DESC);
CREATE INDEX        ix_ops_run    ON ops(run_id, hlc DESC) WHERE run_id IS NOT NULL;
CREATE UNIQUE INDEX ix_ops_dedupe ON ops(hlc, entity, entity_id, field);

CREATE TABLE op_frontier (
  entity    TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  field     TEXT NOT NULL,
  hlc       TEXT NOT NULL,
  op_id     TEXT NOT NULL,
  PRIMARY KEY (entity, entity_id, field)
);

--------------------------------------------------------------------- egress_log
CREATE TABLE egress_log (
  id            TEXT PRIMARY KEY NOT NULL,
  at            TEXT NOT NULL,
  host          TEXT NOT NULL,
  purpose       TEXT NOT NULL,
  method        TEXT,
  item_count    INTEGER NOT NULL DEFAULT 1,
  bytes_out     INTEGER NOT NULL DEFAULT 0,
  bytes_in      INTEGER NOT NULL DEFAULT 0,
  collection_id TEXT,
  run_id        TEXT,
  scope         TEXT NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('pending','ok','error','blocked')),
  duration_ms   INTEGER,
  error         TEXT
);
CREATE INDEX ix_egress_at   ON egress_log(at DESC);
CREATE INDEX ix_egress_host ON egress_log(host, at DESC);

--------------------------------------------------------------------- settings
CREATE TABLE settings (
  key        TEXT PRIMARY KEY NOT NULL,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

--------------------------------------------------------------- snapshots + knn
CREATE TABLE snapshots (
  hash       TEXT PRIMARY KEY NOT NULL,
  path       TEXT NOT NULL,
  bytes      INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  last_used  TEXT NOT NULL,
  ref_count  INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE knn_edges (
  src_id   TEXT NOT NULL,
  k_rank   INTEGER NOT NULL,
  dst_id   TEXT NOT NULL,
  sim      REAL NOT NULL,
  model_id TEXT NOT NULL,
  built_at TEXT NOT NULL,
  PRIMARY KEY (src_id, k_rank)
) WITHOUT ROWID;
`;

const FTS_TABLES_SQL = `
CREATE VIRTUAL TABLE bookmarks_fts USING fts5(
  title, summary, note, author, url_text,
  content='bookmarks', content_rowid='rowid',
  tokenize="unicode61 remove_diacritics 2"
);
CREATE VIRTUAL TABLE chunks_fts USING fts5(
  text, heading_path,
  content='chunks', content_rowid='rowid',
  tokenize="unicode61 remove_diacritics 2"
);
`;

export const sql: string = TABLES_SQL + FTS_TABLES_SQL + FTS_TRIGGERS_SQL;
