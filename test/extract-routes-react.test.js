/**
 * Regression test for the React Router config-object route extractor.
 * Covers createBrowserRouter / useRoutes / RouteObject[] arrays, nested
 * children, index routes, pathless layout routes, lazy/element/Component
 * handlers, loader+action -> dataLoaders, and the JSX-aware (.tsx) parse path.
 * Run: node test/extract-routes-react.test.js
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "reactroutes-test-"));
  const file = path.join(dir, name);
  fs.writeFileSync(file, content);
  try {
    return fn(file);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const find = (routes, p) => routes.find((r) => r.path === p);

// ------------------------------------ createBrowserRouter + JSX element + lazy ----
withTempFile("router.tsx", `
import { createBrowserRouter } from "react-router-dom";
import Home from "./Home";
import Orders from "./Orders";

const router = createBrowserRouter([
  { path: "/", element: <Home /> },
  {
    path: "orders",
    Component: Orders,
    children: [
      { index: true, element: <OrderList /> },
      { path: ":id", lazy: () => import("./OrderDetail"), loader: loadOrder },
    ],
  },
  { path: "*", element: <NotFound /> },
]);
`, (file) => {
  const routes = extractFileRoutes(file);
  check("react: every route is react-router/VIEW",
    routes.length > 0 && routes.every((r) => r.framework === "react-router" && r.method === "VIEW"));

  const home = find(routes, "/");
  check("react: root path + JSX element handler", home && home.handler === "Home");

  const orders = find(routes, "/orders");
  check("react: nested parent path composed", !!orders);
  check("react: Component handler captured", orders && orders.handler === "Orders");

  const index = find(routes, "/orders");
  check("react: index route resolves to parent path",
    routes.filter((r) => r.path === "/orders").length === 2 &&
    routes.some((r) => r.path === "/orders" && r.handler === "OrderList"));

  const detail = find(routes, "/orders/:id");
  check("react: child path composed onto parent", !!detail);
  check("react: lazy -> kind lazy", detail && detail.kind === "lazy");
  check("react: lazy import resolves to module basename", detail && detail.handler === "OrderDetail");
  check("react: loader captured in dataLoaders", detail && detail.dataLoaders.includes("loadOrder"));

  const wild = find(routes, "/*");
  check("react: wildcard route captured", wild && wild.handler === "NotFound");
});

// ----------------------------------------- pathless layout route + loader/action ----
withTempFile("layout-router.tsx", `
import { createBrowserRouter } from "react-router-dom";

const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      { path: "dashboard", element: <Dashboard />, loader: dashLoader, action: dashAction },
    ],
  },
]);
`, (file) => {
  const routes = extractFileRoutes(file);
  check("react(layout): pathless layout emits no URL of its own",
    !routes.some((r) => r.handler === "RootLayout"));
  const dash = find(routes, "/dashboard");
  check("react(layout): child of pathless layout keeps its own path", !!dash);
  check("react(layout): loader + action both captured in dataLoaders",
    dash && dash.dataLoaders.includes("dashLoader") && dash.dataLoaders.includes("dashAction"));
});

// -------------------------------------------- useRoutes + typed RouteObject[] ----
withTempFile("routes.tsx", `
import { useRoutes, RouteObject } from "react-router-dom";
import Settings from "./Settings";

const config: RouteObject[] = [
  { path: "settings", element: <Settings /> },
];

export function App() {
  return useRoutes([{ path: "about", element: <About /> }]);
}
`, (file) => {
  const routes = extractFileRoutes(file);
  check("react(useRoutes): inline useRoutes array detected", !!find(routes, "/about"));
  check("react(typed): RouteObject[] typed const detected", !!find(routes, "/settings"));
});

// ------------------------------------------------ JSX <Route> element form ----
withTempFile("App.tsx", `
import { Routes, Route } from "react-router-dom";
import Home from "./Home";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="orders" element={<OrdersLayout />}>
        <Route index element={<OrderList />} />
        <Route path=":id" element={<OrderDetail />} loader={loadOrder} />
      </Route>
      <Route path="users" component={Users} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
`, (file) => {
  const routes = extractFileRoutes(file);
  check("react(jsx): every route is react-router/VIEW",
    routes.length > 0 && routes.every((r) => r.framework === "react-router" && r.method === "VIEW"));

  const home = find(routes, "/");
  check("react(jsx): root path + element handler", home && home.handler === "Home");

  const orders = find(routes, "/orders");
  check("react(jsx): nested parent path + element handler", orders && orders.handler === "OrdersLayout");

  check("react(jsx): index route resolves to parent path",
    routes.some((r) => r.path === "/orders" && r.handler === "OrderList"));

  const detail = find(routes, "/orders/:id");
  check("react(jsx): child path composed onto parent", !!detail);
  check("react(jsx): element handler on child", detail && detail.handler === "OrderDetail");
  check("react(jsx): loader attr captured in dataLoaders", detail && detail.dataLoaders.includes("loadOrder"));

  const users = find(routes, "/users");
  check("react(jsx): v5 component attr -> handler", users && users.handler === "Users");

  const wild = find(routes, "/*");
  check("react(jsx): wildcard route captured", wild && wild.handler === "NotFound");
});

// ----------------------------------------- JSX pathless layout + createRoutesFromElements ----
withTempFile("routes-from-elements.tsx", `
import { createBrowserRouter, createRoutesFromElements, Route } from "react-router-dom";

const router = createBrowserRouter(
  createRoutesFromElements(
    <Route element={<RootLayout />}>
      <Route path="dashboard" element={<Dashboard />} />
    </Route>
  )
);
`, (file) => {
  const routes = extractFileRoutes(file);
  check("react(jsx-layout): pathless layout emits no URL of its own",
    !routes.some((r) => r.handler === "RootLayout"));
  check("react(jsx-layout): child of pathless layout keeps its own path",
    !!find(routes, "/dashboard"));
  check("react(jsx-layout): no duplicate routes from createRoutesFromElements",
    routes.filter((r) => r.path === "/dashboard").length === 1);
});

// ---------------------------------------- negative: non-react frontend file -----
withTempFile("vue.js", `
import { createRouter } from 'vue-router';
const routes = [{ path: '/', component: Home }];
createRouter({ routes });
`, (file) => {
  const routes = extractFileRoutes(file);
  check("react: vue file yields no react-router routes",
    routes.every((r) => r.framework !== "react-router"));
});

console.log(`\n✅ All ${passed} assertions passed.`);
