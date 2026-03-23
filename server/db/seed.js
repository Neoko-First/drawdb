const pool = require("./pool");
const templates = require("./seeds/templates.json");

async function seed() {
  const { rows } = await pool.query("SELECT COUNT(*)::int AS count FROM templates");
  if (rows[0].count > 0) {
    console.log("✓ Seed skipped (templates already present)");
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const t of templates) {
      await client.query(
        `INSERT INTO templates
          (template_id, title, description, database, custom, tables, relationships, notes, subject_areas, enums, types)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (template_id) DO NOTHING`,
        [
          t.templateId,
          t.title,
          t.description,
          t.database,
          t.custom,
          JSON.stringify(t.tables),
          JSON.stringify(t.relationships),
          JSON.stringify(t.notes),
          JSON.stringify(t.subjectAreas),
          JSON.stringify(t.enums || []),
          JSON.stringify(t.types || []),
        ]
      );
    }
    await client.query("COMMIT");
    console.log(`✓ Seed complete (${templates.length} templates inserted)`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

module.exports = seed;
