/**
 * Regression test for cross-file Angular lazy-mount path composition.
 * Builds a minimal multi-file Angular repo on disk and asserts that feature
 * routes are prefixed with their lazy-mount path (/admin/overview, /products/:id).
 * Run: node test/angular-route-mounts.test.js
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
    compilerOptions: { baseUrl: "./", paths: { "@features/*": ["src/app/features/*"] } },
  }),
  "src/app/app-routing.module.ts": `
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
const routes: Routes = [
  { path: 'products', loadChildren: () => import('@features/products/products.module').then(m => m.ProductsModule) },
  { path: 'admin', loadChildren: () => import('@features/admin/admin.module').then(m => m.AdminModule) },
];
@NgModule({ imports: [RouterModule.forRoot(routes)] })
export class AppRoutingModule {}
`,
  // products: routing declared in the same module file (depth-0 hop)
  "src/app/features/products/products.module.ts": `
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ListComponent } from './list.component';
import { DetailComponent } from './detail.component';
const routes: Routes = [
  { path: '', component: ListComponent },
  { path: ':id', component: DetailComponent },
];
@NgModule({ imports: [RouterModule.forChild(routes)] })
export class ProductsModule {}
`,
  "src/app/features/products/list.component.ts": `export class ListComponent {}`,
  "src/app/features/products/detail.component.ts": `export class DetailComponent {}`,
  // admin: NgModule imports a separate routing module (depth-1 hop) with children
  "src/app/features/admin/admin.module.ts": `
import { NgModule } from '@angular/core';
import { AdminRoutingModule } from './admin-routing.module';
@NgModule({ imports: [AdminRoutingModule] })
export class AdminModule {}
`,
  "src/app/features/admin/admin-routing.module.ts": `
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { LayoutComponent } from './layout.component';
import { OverviewComponent } from './overview.component';
const routes: Routes = [
  {
    path: '',
    component: LayoutComponent,
    children: [
      { path: 'overview', component: OverviewComponent },
    ],
  },
];
@NgModule({ imports: [RouterModule.forChild(routes)] })
export class AdminRoutingModule {}
`,
  "src/app/features/admin/layout.component.ts": `export class LayoutComponent {}`,
  "src/app/features/admin/overview.component.ts": `export class OverviewComponent {}`,
};

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ngmount-test-"));
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
    return (f ? f.statements : []).filter((s) => s.type === "route" && s.framework === "angular-router");
  };
  const has = (rts, p) => rts.some((r) => r.path === p);

  // products: routes in the module file itself, mounted at /products
  const prod = routesOf("products/products.module.ts");
  check("mount: /products composed (empty child path)", has(prod, "/products"));
  check("mount: /products/:id composed", has(prod, "/products/:id"));

  // admin: routes in a separate routing module reached via the NgModule import
  const admin = routesOf("admin/admin-routing.module.ts");
  check("mount(hop): /admin composed (layout, empty path)", has(admin, "/admin"));
  check("mount(hop): /admin/overview composed (nested child)", has(admin, "/admin/overview"));

  // the lazy parent routes keep their mount path
  const app = routesOf("app-routing.module.ts");
  check("mount: parent lazy /admin present", has(app, "/admin"));
  check("mount: parent lazy /products present", has(app, "/products"));
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log(`\n✅ All ${passed} assertions passed.`);
