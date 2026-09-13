# Recovering your data without Cairn

Everything Cairn knows is in one SQLite file. If the app will not start, the file is still yours.

## Where the file is

| OS | Path |
|---|---|
| Windows | `%APPDATA%\Cairn\library.db` |
| macOS | `~/Library/Application Support/Cairn/library.db` |
| Linux | `~/.config/Cairn/library.db` |

Next to it: `library.db-wal` (pending writes — keep it with the .db), `library.db.pre-<n>.bak`
(automatic backups taken before each schema upgrade), `snapshots/` (archived pages, if enabled),
`models/` (downloaded AI models, safe to delete).

## Read it with the sqlite3 command line

```
sqlite3 library.db
.mode csv
.headers on
.output bookmarks.csv
SELECT url, title, summary, note, created_at FROM bookmarks WHERE deleted_at IS NULL ORDER BY created_at DESC;
.output stdout
```

Tags for a bookmark:

```
SELECT b.url, t.label FROM bookmark_tags bt
JOIN bookmarks b ON b.id = bt.bookmark_id
JOIN tags t ON t.id = bt.tag_id
WHERE bt.accepted = 1 AND b.deleted_at IS NULL;
```

Extracted page text lives in `content_versions.text` (one row per fetch; the current one is
`bookmarks.current_version_id`).

## If the file looks corrupt

1. Copy `library.db` and `library.db-wal` somewhere safe first.
2. `sqlite3 library.db "PRAGMA integrity_check;"`
3. If it reports errors: `sqlite3 library.db ".recover" | sqlite3 recovered.db`
4. Or restore the newest `library.db.pre-<n>.bak`.

Cairn's own "Export everything" writes `bookmarks.json` (lossless), a Netscape `bookmarks.html`
(importable in any browser) and an Obsidian-compatible `markdown/` folder; the recipe above is the
fallback when the app itself cannot run.
