/**
 * Postgres driver. Selected automatically when DATABASE_URL is set, which is
 * what makes the app deployable to Vercel, Render free, Railway, Neon, Supabase
 * and anywhere else without a persistent disk.
 *
 * Queries elsewhere in the codebase are written once, in SQLite style, with `?`
 * placeholders. This driver rewrites them to Postgres `$n` form.
 */

/**
 * Rewrites `?` placeholders to `$1, $2, ...`, ignoring anything inside a single
 * quoted string literal so a `?` in text is never mistaken for a parameter.
 */
const toPositional = (sql) => {
  let out = "";
  let index = 0;
  let inString = false;

  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i];
    if (char === "'") {
      inString = !inString;
      out += char;
    } else if (char === "?" && !inString) {
      index += 1;
      out += `$${index}`;
    } else {
      out += char;
    }
  }
  return out;
};

const createPostgresDriver = () => {
  const pg = require("pg");

  // node-postgres returns BIGINT as a string to avoid precision loss. Our only
  // bigints are COUNT(*) results, where a Number is what callers expect.
  pg.types.setTypeParser(20, (value) => parseInt(value, 10));

  const connectionString = process.env.DATABASE_URL;
  const needsSsl = !/\b(localhost|127\.0\.0\.1)\b/.test(connectionString) &&
    process.env.PGSSL !== "disable";

  const pool = new pg.Pool({
    connectionString,
    ssl: needsSsl ? { rejectUnauthorized: false } : false,
    // Serverless invocations are short lived, but a pool of one serialises
    // every concurrent query behind a single connection - which turned the
    // WhatsApp handshake into a timeout. A few connections keep restore fast
    // without exhausting the database's slots.
    max: Number(process.env.PGPOOL_MAX || (process.env.VERCEL ? 5 : 10)),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });

  pool.on("error", (error) => console.error("Postgres pool error:", error.message));

  const query = (sql, params = []) => pool.query(toPositional(sql), params);

  const run = async (sql, params = []) => {
    const result = await query(sql, params);
    return { id: undefined, changes: result.rowCount };
  };

  const all = async (sql, params = []) => (await query(sql, params)).rows;

  const get = async (sql, params = []) => (await query(sql, params)).rows[0];

  return {
    dialect: "postgres",
    describe: () => `postgres (${connectionString.replace(/:[^:@/]+@/, ":****@")})`,
    run,
    get,
    all,
    // Postgres has no lastID, so the caller's INSERT is given a RETURNING clause.
    async insert(sql, params = []) {
      const result = await query(`${sql} RETURNING "Id"`, params);
      return { id: result.rows[0]?.Id, changes: result.rowCount };
    },
    async applyPragmas() {
      // Postgres needs no equivalent; foreign keys are always enforced.
    },
    async columnExists(table, column) {
      const row = await get(
        `SELECT 1 AS "Found" FROM information_schema.columns
         WHERE table_name = ? AND column_name = ?`,
        [table, column]
      );
      return Boolean(row);
    },
    close: () => pool.end(),
  };
};

module.exports = createPostgresDriver;
