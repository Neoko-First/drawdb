const { Router } = require("express");
const pool = require("../db/pool");

const router = Router();

// GET /api/diagrams/latest — must be declared before /:diagramId
router.get("/latest", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM diagrams ORDER BY last_modified DESC LIMIT 1`
    );
    if (rows.length === 0) return res.status(404).json({ error: "No diagrams found" });
    res.json(mapDiagram(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/diagrams?loadedFromGistId=X  or  GET /api/diagrams
router.get("/", async (req, res) => {
  try {
    const { loadedFromGistId, full } = req.query;

    if (loadedFromGistId) {
      const { rows } = await pool.query(
        `SELECT diagram_id FROM diagrams WHERE loaded_from_gist_id = $1 LIMIT 1`,
        [loadedFromGistId]
      );
      if (rows.length === 0) return res.json(null);
      return res.json({ diagramId: rows[0].diagram_id });
    }

    // full=true returns complete rows (used by export)
    const fields = full === "true"
      ? "*"
      : "diagram_id, name, database, last_modified";

    const { rows } = await pool.query(
      `SELECT ${fields} FROM diagrams ORDER BY last_modified DESC`
    );

    res.json(full === "true" ? rows.map(mapDiagram) : rows.map(mapDiagramSummary));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/diagrams/:diagramId
router.get("/:diagramId", async (req, res) => {
  if (!UUID_RE.test(req.params.diagramId))
    return res.status(404).json({ error: "Diagram not found" });
  try {
    const { rows } = await pool.query(
      `SELECT * FROM diagrams WHERE diagram_id = $1`,
      [req.params.diagramId]
    );
    if (rows.length === 0) return res.status(404).json({ error: "Diagram not found" });
    res.json(mapDiagram(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/diagrams
router.post("/", async (req, res) => {
  try {
    const {
      diagramId,
      name,
      database,
      gistId,
      loadedFromGistId,
      tables,
      references,
      notes,
      areas,
      enums,
      types,
      pan,
      zoom,
    } = req.body;

    const { rows } = await pool.query(
      `INSERT INTO diagrams
        (diagram_id, name, database, gist_id, loaded_from_gist_id,
         tables, "references", notes, areas, enums, types, pan, zoom)
       VALUES (COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING diagram_id`,
      [
        diagramId || null,
        name || "Untitled Diagram",
        database || "generic",
        gistId || null,
        loadedFromGistId || null,
        JSON.stringify(tables || []),
        JSON.stringify(references || []),
        JSON.stringify(notes || []),
        JSON.stringify(areas || []),
        JSON.stringify(enums || []),
        JSON.stringify(types || []),
        JSON.stringify(pan || { x: 0, y: 0 }),
        zoom ?? 1,
      ]
    );
    res.status(201).json({ diagramId: rows[0].diagram_id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/diagrams/:diagramId
router.put("/:diagramId", async (req, res) => {
  if (!UUID_RE.test(req.params.diagramId))
    return res.status(404).json({ error: "Diagram not found" });
  try {
    const {
      name,
      database,
      gistId,
      loadedFromGistId,
      tables,
      references,
      notes,
      areas,
      enums,
      types,
      pan,
      zoom,
    } = req.body;

    const { rowCount } = await pool.query(
      `UPDATE diagrams SET
        name = COALESCE($2, name),
        database = COALESCE($3, database),
        gist_id = $4,
        loaded_from_gist_id = $5,
        tables = $6,
        "references" = $7,
        notes = $8,
        areas = $9,
        enums = $10,
        types = $11,
        pan = $12,
        zoom = $13,
        last_modified = NOW()
       WHERE diagram_id = $1`,
      [
        req.params.diagramId,
        name,
        database,
        gistId ?? null,
        loadedFromGistId ?? null,
        JSON.stringify(tables || []),
        JSON.stringify(references || []),
        JSON.stringify(notes || []),
        JSON.stringify(areas || []),
        JSON.stringify(enums || []),
        JSON.stringify(types || []),
        JSON.stringify(pan || { x: 0, y: 0 }),
        zoom ?? 1,
      ]
    );
    if (rowCount === 0) return res.status(404).json({ error: "Diagram not found" });
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/diagrams/:diagramId
router.delete("/:diagramId", async (req, res) => {
  if (!UUID_RE.test(req.params.diagramId))
    return res.status(404).json({ error: "Diagram not found" });
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM diagrams WHERE diagram_id = $1`,
      [req.params.diagramId]
    );
    if (rowCount === 0) return res.status(404).json({ error: "Diagram not found" });
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Map snake_case DB row → camelCase frontend object
function mapDiagram(row) {
  return {
    diagramId: row.diagram_id,
    name: row.name,
    database: row.database,
    gistId: row.gist_id,
    loadedFromGistId: row.loaded_from_gist_id,
    lastModified: row.last_modified,
    tables: row.tables,
    references: row["references"],
    notes: row.notes,
    areas: row.areas,
    enums: row.enums,
    types: row.types,
    pan: row.pan,
    zoom: row.zoom,
  };
}

function mapDiagramSummary(row) {
  return {
    diagramId: row.diagram_id,
    name: row.name,
    database: row.database,
    lastModified: row.last_modified,
  };
}

module.exports = router;
