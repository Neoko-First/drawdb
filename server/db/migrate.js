const pool = require("./pool");

async function migrate() {
  // Enable pgcrypto for gen_random_uuid() on PostgreSQL < 13
  await pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS diagrams (
      id               SERIAL PRIMARY KEY,
      diagram_id       UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
      user_id          UUID NULL,
      name             TEXT NOT NULL DEFAULT 'Untitled Diagram',
      database         TEXT NOT NULL DEFAULT 'generic',
      gist_id          TEXT NULL,
      loaded_from_gist_id TEXT NULL,
      last_modified    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      tables           JSONB NOT NULL DEFAULT '[]',
      "references"     JSONB NOT NULL DEFAULT '[]',
      notes            JSONB NOT NULL DEFAULT '[]',
      areas            JSONB NOT NULL DEFAULT '[]',
      enums            JSONB NOT NULL DEFAULT '[]',
      types            JSONB NOT NULL DEFAULT '[]',
      pan              JSONB NOT NULL DEFAULT '{"x":0,"y":0}',
      zoom             FLOAT NOT NULL DEFAULT 1
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS templates (
      id           SERIAL PRIMARY KEY,
      template_id  UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
      user_id      UUID NULL,
      title        TEXT NOT NULL,
      description  TEXT DEFAULT '',
      database     TEXT NOT NULL DEFAULT 'generic',
      custom       INTEGER NOT NULL DEFAULT 0 CHECK (custom IN (0, 1)),
      tables       JSONB NOT NULL DEFAULT '[]',
      relationships JSONB NOT NULL DEFAULT '[]',
      notes        JSONB NOT NULL DEFAULT '[]',
      subject_areas JSONB NOT NULL DEFAULT '[]',
      enums        JSONB NOT NULL DEFAULT '[]',
      types        JSONB NOT NULL DEFAULT '[]'
    )
  `);

  console.log("✓ Migration complete");
}

module.exports = migrate;
