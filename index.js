const express = require("express");
const cors =  require("cors");
const neo4j = require("neo4j-driver");
const { dbConfig } = require("./config")

const app = express();
app.use(cors());
app.use(express.json());

// Helper function to recursively convert Neo4j integers
function convertNeo4jValue(value) {
  if (Array.isArray(value)) return value.map(convertNeo4jValue);
  if (value && typeof value === "object") {
    if (neo4j.isInt(value)) return value.toNumber();
    const obj = {};
    for (const k in value) obj[k] = convertNeo4jValue(value[k]);
    return obj;
  }
  return value;
}

const driver = neo4j.driver(
  dbConfig.dbUrl,
  neo4j.auth.basic(dbConfig.username, dbConfig.password)
);

// Generic API: takes { query: "<CYPHER>" } and runs it
app.post("/api/run-query", async (req, res) => {
  const { query, params = {} } = req.body;
  console.log(params)
  if (!query) return res.status(400).json({ error: "Missing query" });

    const session = driver.session({ database: dbConfig.dbName });
  
  try {
    const result = await session.run(query, params);
    // convert Neo4j records to plain JSON
    const data = result.records.map(r => convertNeo4jValue(r.toObject()));
    // console.log("data", data)
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    await session.close();
  }
});

app.listen(4000, () => console.log("API server running on port 4000"));
