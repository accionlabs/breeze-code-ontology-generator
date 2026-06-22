/**
 * Regression test for cross-file React Router mount path composition.
 * Builds a minimal multi-file React repo on disk and asserts that child route
 * arrays imported and mounted under a parent path are prefixed accordingly
 * (/admin/overview, /admin/users, /reports/sales via a path alias + spread).
 * Run: node test/react-route-mounts.test.js
 */
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { analyzeTypeScriptRepo } = require("../typescript/file-tree-mapper-typescript");

let passed = 0;
function check(name, cond) {
  assert.ok(cond, name);
  passed++;
}

const FILES = {
  "tsconfig.json": JSON.stringify({
    compilerOptions: { baseUrl: "./", paths: { "@features/*": ["src/features/*"] } },
  }),
  // Root router mounts two child arrays: one relative import, one path alias.
  "src/router.tsx": `
import { createBrowserRouter, RouteObject } from "react-router-dom";
import { adminRoutes } from "./features/admin/routes";
import { reportRoutes } from "@features/reports/routes";
import Home from "./Home";

const router = createBrowserRouter([
  { path: "/", element: <Home /> },
  { path: "admin", element: <AdminLayout />, children: adminRoutes },
  { path: "reports", children: [...reportRoutes] },
]);
`,
  // admin child array (relative import), itself nesting via inline children.
  "src/features/admin/routes.tsx": `
import { RouteObject } from "react-router-dom";

export const adminRoutes: RouteObject[] = [
  { index: true, element: <AdminOverview /> },
  { path: "users", element: <AdminUsers /> },
];
`,
  // reports child array, mounted via a path alias and a spread.
  "src/features/reports/routes.tsx": `
import { RouteObject } from "react-router-dom";

export const reportRoutes: RouteObject[] = [
  { path: "sales", element: <SalesReport /> },
];
`,
  "src/Home.tsx": `export default function Home() { return null; }`,
};

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "reactmount-test-"));
try {
  for (const [rel, content] of Object.entries(FILES)) {
    const abs = path.join(dir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }

  const data = analyzeTypeScriptRepo(dir, { captureStatements: true });
  const arr = Array.isArray(data) ? data : (data.files || []);
  const routesOf = (suffix) => {
    const f = arr.find((x) => x.path.endsWith(suffix));
    return (f ? f.statements : []).filter((s) => s.type === "route" && s.framework === "react-router");
  };
  const has = (rts, p) => rts.some((r) => r.path === p);

  // admin child array mounted at /admin (relative import, children: identifier)
  const admin = routesOf("features/admin/routes.tsx");
  check("mount: admin index route -> /admin", has(admin, "/admin"));
  check("mount: admin child path composed -> /admin/users", has(admin, "/admin/users"));

  // reports child array mounted at /reports via path alias + spread
  const reports = routesOf("features/reports/routes.tsx");
  check("mount(alias+spread): /reports/sales composed", has(reports, "/reports/sales"));

  // the parent router keeps its own mount-point routes
  const root = routesOf("router.tsx");
  check("mount: parent /admin present", has(root, "/admin"));
  check("mount: parent /reports present", has(root, "/reports"));
  check("mount: parent root / present", has(root, "/"));

  // no prefix bleed: child arrays are NOT left at their bare in-file paths
  check("mount: admin/users not left unprefixed", !has(admin, "/users"));
  check("mount(alias): reports/sales not left unprefixed", !has(reports, "/sales"));
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log(`\n✅ All ${passed} assertions passed.`);
