#!/usr/bin/env node
const fs = require("fs");
const neo4j = require("neo4j-driver");
const { dbConfig } = require("./config");

if (process.argv.length < 4) {
  console.error("Usage: node importToNeo4j.js <repo_json_path> <projectUuid>");
  process.exit(1);
}

const jsonPath = process.argv[2];
const projectUuid = process.argv[3];

const jsonData = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
const files = jsonData;

console.log("files", files.length);

const driver = neo4j.driver(
  dbConfig.dbUrl,
  neo4j.auth.basic(dbConfig.username, dbConfig.password)
);

// Ensure unique constraint once (run separately / at app start)
async function ensureConstraint() {
  const session = driver.session({ database: dbConfig.dbName });
  try {
    await session.executeWrite(async tx => {
      await tx.run(`CREATE CONSTRAINT IF NOT EXISTS FOR (f:File) REQUIRE f.path IS UNIQUE;`);
      await tx.run(`CREATE CONSTRAINT IF NOT EXISTS FOR (f:File) REQUIRE f.id IS UNIQUE;`);
    });
  } finally {
    console.log("closing session1");
    await session.close();
  }
}

async function importRepo(files, projectUuid) {
  if (!files || files.length === 0) return;
  files = files.map(f => {
    if(!f.description) f.description = ''
    f.id = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
    return f;
  })

  const session = driver.session({ database: dbConfig.dbName });

  try {
    await ensureConstraint();

    // 1) Merge File nodes with projectUuid
    await session.executeWrite(tx =>
      tx.run(
        `
        UNWIND $files AS file
        MERGE (f:File {path: file.path})
        SET f.externalImports = file.externalImports,
            f.projectUuid = $projectUuid,
            f.name = file.name,
            f.loc = file.loc,
            f.description = file.description,
            f.id = file.id
        `,
        { files, projectUuid }
      )
    );

    // 2) Merge IMPORTS relationships
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
      ON CREATE SET a.projectUuid = $projectUuid
      ON MATCH SET a.projectUuid = coalesce(a.projectUuid, $projectUuid)
    MERGE (b:File {path: p.to})
      ON CREATE SET b.projectUuid = $projectUuid
      ON MATCH SET b.projectUuid = coalesce(b.projectUuid, $projectUuid)
    MERGE (a)-[:IMPORTS]->(b)
    `,
          { pairs: relPairs, projectUuid }
        )
      );
    }

    console.log("✅ Import complete with projectUuid:", projectUuid);
    await updateImportCounts(session);
    await session.executeWrite(async tx => {
      await tx.run(`CALL gds.graph.drop('importsGraph', false) YIELD graphName;`)
      await tx.run(`CALL gds.graph.project(
            'importsGraph',
            'File',                   // node label
            {
              IMPORTS: {
                type: 'IMPORTS',
                orientation: 'UNDIRECTED' // Louvain works best on undirected graphs
              }
            }
          );`)
      await tx.run(`CALL gds.louvain.write('importsGraph', {
        writeProperty: 'clusterId'
        })
        YIELD communityCount, modularity, modularities;`)
      })
      console.log("Clusters ADDed")
  } catch (err) {
    console.error("closing session2");
    console.error("❌ Error importing repo:", err);
    throw err;
  } finally {
    await session.close();
    process.exit(0)
  }
}

async function updateImportCounts(session) {
    // 1. Get all file node IDs and paths
    const result = await session.run(`MATCH (f:File) RETURN id(f) AS id, f.path AS path`);
    const files = result.records.map(r => ({
      id: r.get("id"),
      path: r.get("path"),
    }));

    console.log(`Found ${files.length} files`);

    // 2. Iterate one by one (or in small batches)
    for (const file of files) {
      const query = `
        MATCH (f:File)
        WHERE id(f) = $id
        OPTIONAL MATCH (f)-[:IMPORTS]->(out:File)
        WITH f, COUNT(out) AS importCount
        OPTIONAL MATCH (in:File)-[:IMPORTS]->(f)
        WITH f, importCount, COUNT(in) AS importedByCount
        SET f.importCount = importCount, f.importedByCount = importedByCount
      `;

      await session.run(query, { id: file.id });
      console.log(`Updated: ${file.path}`);
    }

    console.log("All files updated successfully");
  
}


importRepo(files, projectUuid);
