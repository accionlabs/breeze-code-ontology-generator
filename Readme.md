## 🧩 Overview

The tool operates in **two stages**:

1. **Code Parsing & JSON Generation**  
   Parses a Perl repository and outputs:
   - A **package-to-path mapper JSON** — maps each Perl package to its corresponding file path.  
   - A **file dependency tree JSON** — captures which files import or depend on others.

2. **Graph Migration to Neo4j**  
   Reads the generated dependency tree JSON and imports it into Neo4j, representing the relationships as nodes and `IMPORTS` edges.

---

## ⚙️ Prerequisites

- **Node.js v18+**
- **Neo4j Database** (running locally or remotely)
- Basic understanding of Perl package structure (`.pl` and `.pm` files)

---

## 🗂️ Repository Structure

```
.
├── file-tree-mapper.js         # Script to analyze Perl repo and create JSONs
├── tree-to-graph.js            # Script to migrate dependency JSON into Neo4j
├── package-lock.json
├── README.md
└── output/
    ├── package-path-mapper.json
    └── file-dependency-tree.json
```

---

## 🚀 Usage

### Step 1: Generate the File Tree and Mapper JSONs

Run the following command to analyze a Perl repository:

```bash
node file-tree-mapper.js <path-to-perl-repo> <output-mapper-json-filename> <output-file-tree-json>
```

**Example:**
```bash
node file-tree-mapper.js ./perl-app ./output/package-path-mapper.json ./output/file-dependency-tree.json
```

This will:
- Recursively scan the given Perl repository.
- Extract all `.pl` and `.pm` files.
- Identify `use`, `require`, and `package` statements.
- Generate:
  - `package-path-mapper.json` → maps Perl package names to file paths.
  - `file-dependency-tree.json` → represents import relationships between files.

---

### Step 2: Migrate the Dependency Tree to Neo4j

Once the JSONs are generated, run:

```bash
node tree-to-graph.js <path-to-file-dependency-tree-json>
```

**Example:**
```bash
node tree-to-graph.js ./output/file-dependency-tree.json
```

This script:
- Connects to your Neo4j instance.
- Creates nodes for each Perl file.
- Creates `IMPORTS` relationships based on the dependency tree.
- Enables visualization and graph queries in the Neo4j browser.

---

## 🧠 Example Neo4j Query

Once imported, you can explore the relationships in Neo4j Browser:

```cypher
MATCH (f:File)-[:IMPORTS]->(d:File)
RETURN f, d
```

Or to find files with no dependencies:

```cypher
MATCH (f:File)
WHERE NOT (f)-[:IMPORTS]->()
RETURN f
```

---

## 🧱 Data Model

### Node Labels:
- **File** — represents a Perl file (`.pl` or `.pm`).

### Relationships:
- **[:IMPORTS]** — indicates one file depends on another through `use` or `require`.

---

## ⚠️ Notes

- Ensure the Neo4j connection settings (URI, username, password) are configured correctly inside `tree-to-graph.js`.
- The scripts assume Perl modules follow standard naming conventions (e.g., `Package::SubPackage` maps to `Package/SubPackage.pm`).


