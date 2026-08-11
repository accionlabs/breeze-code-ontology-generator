/**
 * Regression test for the Angular Router route extractor.
 * Covers typed `Routes` arrays, RouterModule.forRoot/forChild, provideRouter,
 * lazy loadChildren/loadComponent, nested children, redirectTo, guards, wildcard.
 * Run: node test/extract-routes-angular.test.js
 */
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { extractFileRoutes } = require("../typescript/extract-routes-typescript");

let passed = 0;
function check(name, cond) {
  assert.ok(cond, name);
  passed++;
}

function withTempFile(name, content, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ngroutes-test-"));
  const file = path.join(dir, name);
  fs.writeFileSync(file, content);
  try {
    return fn(file);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const find = (routes, p) => routes.find((r) => r.path === p);

// ----------------------------------------------------- typed Routes + lazy ----
withTempFile("app-routing.module.ts", `
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { authGuard } from './auth.guard';
import { NotFoundComponent } from './not-found.component';

const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  { path: 'dashboard', loadChildren: () => import('./dashboard.module').then((m) => m.DashboardModule) },
  { path: 'users', canActivate: [authGuard], loadChildren: () => import('./users.module').then((m) => m.UsersModule) },
  { path: 'profile', loadComponent: () => import('./profile.component').then((m) => m.ProfileComponent) },
  { path: '**', component: NotFoundComponent },
];

@NgModule({ imports: [RouterModule.forRoot(routes)], exports: [RouterModule] })
export class AppRoutingModule {}
`, (file) => {
  const routes = extractFileRoutes(file);
  check("angular: all 5 routes found", routes.length === 5);
  check("angular: every route is angular-router/VIEW",
    routes.every((r) => r.framework === "angular-router" && r.method === "VIEW"));

  const redirect = find(routes, "/");
  check("angular: redirectTo -> kind redirect", redirect && redirect.kind === "redirect");
  check("angular: redirect handler captures target", redirect && redirect.handler === "-> dashboard");

  const dash = find(routes, "/dashboard");
  check("angular: loadChildren -> kind lazy", dash && dash.kind === "lazy");
  check("angular: loadChildren resolves module symbol", dash && dash.handler === "DashboardModule");

  const users = find(routes, "/users");
  check("angular: canActivate captured as guard", users && users.guards.includes("authGuard"));
  check("angular: guard sets authRequired", users && users.authRequired === true);

  const profile = find(routes, "/profile");
  check("angular: loadComponent -> kind page", profile && profile.kind === "page");
  check("angular: loadComponent resolves component symbol", profile && profile.handler === "ProfileComponent");

  const wild = find(routes, "/**");
  check("angular: wildcard route captured", wild && wild.handler === "NotFoundComponent");
});

// ------------------------------------------- forChild + nested children -------
withTempFile("products-routing.module.ts", `
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ListComponent } from './list.component';
import { DetailComponent } from './detail.component';

const routes: Routes = [
  {
    path: 'products',
    component: ListComponent,
    children: [
      { path: ':id', component: DetailComponent },
    ],
  },
];

@NgModule({ imports: [RouterModule.forChild(routes)], exports: [RouterModule] })
export class ProductsRoutingModule {}
`, (file) => {
  const routes = extractFileRoutes(file);
  check("angular(child): parent + child found", routes.length === 2);
  const parent = find(routes, "/products");
  check("angular(child): parent component", parent && parent.handler === "ListComponent");
  const child = find(routes, "/products/:id");
  check("angular(child): child path composed onto parent", !!child);
  check("angular(child): child component", child && child.handler === "DetailComponent");
});

// ------------------------------------------------ resolve -> dataLoaders ------
withTempFile("account-routing.module.ts", `
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ProfileComponent } from './profile.component';
import { ProfileResolver } from './profile.resolver';
import { SettingsResolver } from './settings.resolver';

const routes: Routes = [
  { path: 'account', component: ProfileComponent, resolve: { profile: ProfileResolver, settings: SettingsResolver } },
  { path: 'plain', component: ProfileComponent },
];

@NgModule({ imports: [RouterModule.forChild(routes)], exports: [RouterModule] })
export class AccountRoutingModule {}
`, (file) => {
  const routes = extractFileRoutes(file);
  const account = find(routes, "/account");
  check("angular(resolve): both resolvers captured in dataLoaders",
    account && account.dataLoaders.length === 2 &&
    account.dataLoaders.includes("ProfileResolver") &&
    account.dataLoaders.includes("SettingsResolver"));
  const plain = find(routes, "/plain");
  check("angular(resolve): route without resolve has empty dataLoaders",
    plain && Array.isArray(plain.dataLoaders) && plain.dataLoaders.length === 0);
});

// ------------------------------------------- provideRouter inline array -------
withTempFile("app.routes.ts", `
import { Routes } from '@angular/router';
import { provideRouter } from '@angular/router';
import { HomeComponent } from './home.component';

export const appRoutes: Routes = [
  { path: 'home', component: HomeComponent, title: 'Home' },
];

provideRouter(appRoutes);
`, (file) => {
  const routes = extractFileRoutes(file);
  const home = find(routes, "/home");
  check("angular(standalone): typed const (non-'routes' name) detected", !!home);
  check("angular(standalone): title -> decorator", home && home.decorator === "Home");
});

// ---------------------------------------- negative: non-angular file ----------
withTempFile("vue.js", `
import { createRouter } from 'vue-router';
const routes = [{ path: '/', component: Home }];
createRouter({ routes });
`, (file) => {
  const routes = extractFileRoutes(file);
  check("angular: vue file yields no angular-router routes",
    routes.every((r) => r.framework !== "angular-router"));
});

console.log(`\n✅ All ${passed} assertions passed.`);
