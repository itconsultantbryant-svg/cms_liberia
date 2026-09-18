/**
 * Light SQLite → Postgres SQL translation for dual-driver mode.
 * Local/dev keeps SQLite; production sets DATABASE_URL (Neon).
 */
function isPostgres() {
  return !!(process.env.DATABASE_URL || process.env.NEON_DATABASE_URL);
}

/**
 * Convert `?` placeholders to Postgres `$1..$n`.
 */
function toPgPlaceholders(sql) {
  let i = 0;
  return String(sql).replace(/\?/g, () => `$${++i}`);
}

/**
 * Translate common SQLite DDL/DML idioms to Postgres.
 */
function translateSql(sql) {
  let s = String(sql);

  s = s.replace(/INTEGER PRIMARY KEY AUTOINCREMENT/gi, 'SERIAL PRIMARY KEY');
  s = s.replace(/\bAUTOINCREMENT\b/gi, '');
  s = s.replace(/\bDATETIME\b/gi, 'TIMESTAMP');
  s = s.replace(/\bREAL\b/gi, 'DOUBLE PRECISION');
  s = s.replace(/\bBLOB\b/gi, 'BYTEA');

  // SQLite collations not available on Postgres
  s = s.replace(/\s+COLLATE\s+NOCASE\b/gi, '');
  s = s.replace(/\s+COLLATE\s+BINARY\b/gi, '');
  s = s.replace(/\s+COLLATE\s+RTRIM\b/gi, '');

  const wasIgnore = /INSERT\s+OR\s+IGNORE\s+INTO/i.test(s);
  s = s.replace(/INSERT\s+OR\s+IGNORE\s+INTO/gi, 'INSERT INTO');
  s = s.replace(/INSERT\s+OR\s+REPLACE\s+INTO/gi, 'INSERT INTO');
  if (wasIgnore && !/ON\s+CONFLICT/i.test(s)) {
    s = s.replace(/;?\s*$/, '') + ' ON CONFLICT DO NOTHING';
  }

  s = s.replace(/\bIFNULL\s*\(/gi, 'COALESCE(');
  s = s.replace(/date\s*\(\s*'now'\s*\)/gi, 'CURRENT_DATE');
  s = s.replace(/datetime\s*\(\s*'now'\s*\)/gi, 'CURRENT_TIMESTAMP');
  // date(column_or_expr) → cast to date (skip already-handled date('now'))
  s = s.replace(/\bdate\s*\(\s*(?!CURRENT_DATE)([^)]+)\s*\)/gi, '(($1)::timestamp)::date');
  s = s.replace(/\bdatetime\s*\(\s*(?!CURRENT_TIMESTAMP)([^)]+)\s*\)/gi, '(($1)::timestamp)');
  // substr for month keys used in finance reports
  s = s.replace(/\bsubstr\s*\(\s*([^,]+)\s*,\s*1\s*,\s*7\s*\)/gi, "to_char(($1)::timestamp, 'YYYY-MM')");

  s = s.replace(/strftime\s*\(\s*'%Y-%m'\s*,\s*([^)]+)\)/gi, "to_char(($1)::timestamp, 'YYYY-MM')");
  s = s.replace(/strftime\s*\(\s*'%Y'\s*,\s*([^)]+)\)/gi, "to_char(($1)::timestamp, 'YYYY')");
  s = s.replace(/strftime\s*\(\s*'%m'\s*,\s*([^)]+)\)/gi, "to_char(($1)::timestamp, 'MM')");
  s = s.replace(/strftime\s*\(\s*'%w'\s*,\s*([^)]+)\)/gi, 'EXTRACT(DOW FROM ($1)::timestamp)::int');
  s = s.replace(
    /strftime\s*\(\s*'%Y-%m-%d'\s*,\s*([^)]+)\)/gi,
    "to_char(($1)::timestamp, 'YYYY-MM-DD')"
  );

  // sqlite_master helpers — more specific patterns first
  s = s.replace(
    /SELECT\s+sql\s+FROM\s+sqlite_master\s+WHERE\s+type\s*=\s*'table'\s+AND\s+name\s*=\s*\?/gi,
    `SELECT NULL::text AS sql FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ?`
  );
  s = s.replace(
    /SELECT\s+sql\s+FROM\s+sqlite_master\s+WHERE\s+type\s*=\s*'table'\s+AND\s+name\s*=\s*'([^']+)'/gi,
    (_m, name) =>
      `SELECT NULL::text AS sql FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '${String(
        name
      ).replace(/'/g, "''")}'`
  );
  s = s.replace(
    /SELECT\s+name\s+FROM\s+sqlite_master\s+WHERE\s+type\s*=\s*'table'\s+AND\s+name\s*=\s*\?/gi,
    `SELECT table_name AS name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ?`
  );
  s = s.replace(
    /FROM\s+sqlite_master\s+WHERE\s+type\s*=\s*'table'/gi,
    `FROM information_schema.tables WHERE table_schema = 'public'`
  );

  return s;
}

function parsePragmaTableInfo(sql) {
  const m = String(sql).match(/PRAGMA\s+table_info\s*\(\s*([A-Za-z0-9_]+)\s*\)/i);
  return m ? m[1] : null;
}

function pragmaTableInfoQuery() {
  return `
    SELECT
      ordinal_position AS cid,
      column_name AS name,
      data_type AS type,
      CASE WHEN is_nullable = 'NO' THEN 1 ELSE 0 END AS notnull,
      column_default AS dflt_value,
      0 AS pk
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = $1
    ORDER BY ordinal_position
  `;
}

module.exports = {
  isPostgres,
  toPgPlaceholders,
  translateSql,
  parsePragmaTableInfo,
  pragmaTableInfoQuery
};
