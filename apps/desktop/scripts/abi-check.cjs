// Loads better-sqlite3 and sqlite-vec INSIDE Electron (not Node) to prove the rebuilt native
// module matches Electron's ABI. Run: npx electron scripts/abi-check.cjs  (from apps/desktop)
const { app } = require('electron');

app.whenReady().then(() => {
  let code = 0;
  try {
    const Database = require('better-sqlite3');
    const db = new Database(':memory:');
    const v = db.prepare('select sqlite_version() as v').get().v;
    console.log(`OK better-sqlite3 loads in Electron ${process.versions.electron}, SQLite ${v}`);
    try {
      const vec = require('sqlite-vec');
      vec.load(db);
      console.log(`OK sqlite-vec ${db.prepare('select vec_version() as v').get().v}`);
    } catch (e) {
      console.log('WARN sqlite-vec failed to load:', e.message);
      code = 2;
    }
    const fts = db.prepare("select fts5(?1) as x").pluck();
    void fts;
    db.exec("create virtual table t using fts5(a, tokenize=\"unicode61 remove_diacritics 2\")");
    db.prepare("insert into t values (?)").run('résumé café');
    const hit = db.prepare("select count(*) as n from t where t match 'resume cafe'").get().n;
    console.log(hit === 1 ? 'OK FTS5 diacritics folded' : 'FAIL FTS5 diacritics');
    if (hit !== 1) code = 1;
  } catch (e) {
    console.log('FAIL', e.message);
    code = 1;
  }
  app.exit(code);
});
