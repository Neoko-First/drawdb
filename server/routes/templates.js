const { Router } = require("express");
const pool = require("../db/pool");

const router = Router();

// GET /api/templates?custom=0|1  or  GET /api/templates
router.get("/", async (req, res) => {
  try {
    const { custom } = req.query;
    let query = `SELECT * FROM templates ORDER BY id ASC`;
    const params = [];

    if (custom !== undefined) {
      query = `SELECT * FROM templates WHERE custom = $1 ORDER BY id ASC`;
      params.push(parseInt(custom, 10));
    }

    const { rows } = await pool.query(query, params);
    res.json(rows.map(mapTemplate));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/templates/:templateId
router.get("/:templateId", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM templates WHERE template_id = $1`,
      [req.params.templateId]
    );
    if (rows.length === 0) return res.status(404).json({ error: "Template not found" });
    res.json(mapTemplate(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/templates
router.post("/", async (req, res) => {
  try {
    const {
      title,
      description,
      database,
      tables,
      relationships,
      notes,
      subjectAreas,
      enums,
      types,
    } = req.body;

    const { rows } = await pool.query(
      `INSERT INTO templates
        (title, description, database, custom, tables, relationships, notes, subject_areas, enums, types)
       VALUES ($1, $2, $3, 1, $4, $5, $6, $7, $8, $9)
       RETURNING template_id`,
      [
        title || "Untitled Template",
        description || "",
        database || "generic",
        JSON.stringify(tables || []),
        JSON.stringify(relationships || []),
        JSON.stringify(notes || []),
        JSON.stringify(subjectAreas || []),
        JSON.stringify(enums || []),
        JSON.stringify(types || []),
      ]
    );
    res.status(201).json({ templateId: rows[0].template_id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/templates/:templateId  (only custom templates)
router.delete("/:templateId", async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM templates WHERE template_id = $1 AND custom = 1`,
      [req.params.templateId]
    );
    if (rowCount === 0)
      return res.status(404).json({ error: "Template not found or not deletable" });
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Map snake_case DB row → camelCase frontend object
function mapTemplate(row) {
  return {
    templateId: row.template_id,
    title: row.title,
    description: row.description,
    database: row.database,
    custom: row.custom,
    tables: row.tables,
    relationships: row.relationships,
    notes: row.notes,
    subjectAreas: row.subject_areas,
    enums: row.enums,
    types: row.types,
  };
}

module.exports = router;
