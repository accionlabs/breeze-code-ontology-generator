#!/usr/bin/env node
const fs = require("fs");
const neo4j = require("neo4j-driver");
const { dbConfig } = require("./config")

if (process.argv.length < 3) {
  console.error("Usage: node importToNeo4j.js <repo_json_path>");
  process.exit(1);
}

const jsonPath = process.argv[2];
const jsonData = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
const files = jsonData;

console.log("files", files.length)


const driver = neo4j.driver(
  dbConfig.dbUrl,
  neo4j.auth.basic(dbConfig.username, dbConfig.password)
);


// ensure unique constraint once (run separately / at app start)
async function ensureConstraint() {
    const session = driver.session({ database: dbConfig.dbName });
  try {
    await session.executeWrite(tx =>
      tx.run(
        `CREATE CONSTRAINT IF NOT EXISTS FOR (f:File) REQUIRE f.path IS UNIQUE`
      )
    );
  } finally {
    await session.close();
  }
}

/**
 * files: [{ path: string, externalImports: [...], importFiles: [string, ...] }, ...]
 * driver, dbConfig available from caller scope
 */
async function importRepo(files) {
  if (!files || files.length === 0) return;

  // Don't close driver here if you reuse it across your app
  const session = driver.session({ database: dbConfig.dbName });

  try {
    await ensureConstraint()
    // 1) Batch create/merge nodes for the files themselves and set externalImports
    //    This creates nodes for the primary files with their metadata.
    await session.executeWrite(tx =>
      tx.run(
        `
        UNWIND $files AS file
        MERGE (f:File {path: file.path})
        SET f.externalImports = file.externalImports
        `,
        { files }
      )
    );

    // 2) Option A: If you want import target nodes created only if referenced,
    //    create relationships by matching/merging import target nodes in a batch.
    //    This will also create target nodes if they don't already exist.
    const relPairs = [];
    for (const file of files) {
      if (!file.importFiles || file.importFiles.length === 0) continue;
      for (const imp of file.importFiles) {
        relPairs.push({ from: file.path, to: imp });
      }
    }

    if (relPairs.length > 0) {
      await session.executeWrite(tx =>
        tx.run(
          `
          UNWIND $pairs AS p
          MERGE (a:File {path: p.from})
          MERGE (b:File {path: p.to})
          MERGE (a)-[:IMPORTS]->(b)
          `,
          { pairs: relPairs }
        )
      );
    }

    console.log("✅ Import complete.");
  } catch (err) {
    console.error("❌ Error importing repo:", err);
    throw err;
  } finally {
    await session.close();
    // DO NOT close driver here if it's reused elsewhere in your app:
    // await driver.close();
  }
}


importRepo(files);
