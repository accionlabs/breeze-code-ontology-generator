/**
 * Regression test for the Java function extractor's decorator / param capture.
 * Covers method-level decorators (AC4) and nested param decorators + types (AC3).
 * Run: node test/extract-functions-java.test.js
 */
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { extractFunctionsAndCalls } = require("../java/extract-functions-java");

let passed = 0;
function check(name, cond) {
  assert.ok(cond, name);
  passed++;
}

function withTempRepo(name, content, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jfns-test-"));
  const file = path.join(dir, name);
  fs.writeFileSync(file, content);
  try {
    return fn(dir, file);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const byName = (fns, n) => fns.find((f) => f.name === n);
const paramOf = (fn, n) => fn.params.find((p) => p.name === n);

withTempRepo("SampleController.java", `
package com.example;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/users")
public class SampleController {

    @GetMapping("/{id}")
    public User get(@PathVariable Long id) { return null; }

    @PutMapping(value = "/update", produces = "application/json")
    public void update() {}

    @PostMapping("/{id}/items")
    public User create(@PathVariable Long id,
                       @RequestParam("q") String q,
                       @RequestBody UserDto body,
                       HttpServletRequest request,
                       String... tags) { return null; }
}
`, (dir, file) => {
  const fns = extractFunctionsAndCalls(file, dir, {}, false, false);

  // ---- method-level decorators (AC4) ----
  check("fn decorators: captured as [{name,args}] with literal arg unwrapped",
    JSON.stringify(byName(fns, "get").decorators) ===
      JSON.stringify([{ name: "GetMapping", args: ["/{id}"] }]));
  check("fn decorators: named attributes kept as faithful text",
    byName(fns, "update").decorators[0].name === "PutMapping" &&
    byName(fns, "update").decorators[0].args.includes('produces = "application/json"'));
  check("fn decorators: empty array when none",
    Array.isArray(byName(fns, "update").decorators));

  // ---- param decorators + types (AC3) ----
  const create = byName(fns, "create");
  check("param: @PathVariable nested with type",
    paramOf(create, "id").type === "Long" &&
    paramOf(create, "id").decorators[0].name === "PathVariable");
  check("param: @RequestParam positional arg captured",
    paramOf(create, "q").decorators[0].name === "RequestParam" &&
    paramOf(create, "q").decorators[0].args[0] === "q");
  check("param: @RequestBody nested with DTO type",
    paramOf(create, "body").type === "UserDto" &&
    paramOf(create, "body").decorators[0].name === "RequestBody");

  // ---- return type (#1) ----
  check("returnType: declared type captured",
    byName(fns, "get").returnType === "User");
  check("returnType: void captured verbatim",
    byName(fns, "update").returnType === "void");

  // ---- present-only + varargs ----
  check("param: decorators key omitted when none (present-only)",
    !("decorators" in paramOf(create, "request")) &&
    !("decorators" in paramOf(create, "tags")));
  check("param: varargs type marked with trailing ...",
    paramOf(create, "tags").type === "String...");
});

// ----------------------------------------------------------- JAX-RS ---------
withTempRepo("OrderResource.java", `
package com.example;
import javax.ws.rs.*;

@Path("/orders")
public class OrderResource {
    @GET @Path("/{id}")
    public Order find(@PathParam("id") String id,
                      @QueryParam("expand") boolean expand) { return null; }
}
`, (dir, file) => {
  const fns = extractFunctionsAndCalls(file, dir, {}, false, false);
  const find = byName(fns, "find");
  check("jaxrs param: @PathParam nested with arg",
    paramOf(find, "id").decorators[0].name === "PathParam" &&
    paramOf(find, "id").decorators[0].args[0] === "id");
  check("jaxrs param: @QueryParam nested with arg",
    paramOf(find, "expand").decorators[0].name === "QueryParam" &&
    paramOf(find, "expand").type === "boolean");
});

// ------------------------------------------------- return type (#1) --------
withTempRepo("Box.java", `
package com.example;
public class Box<T> {
    public Box(T value) {}
    public <R> List<R> mapAll(R seed) { return null; }
}
`, (dir, file) => {
  const fns = extractFunctionsAndCalls(file, dir, {}, false, false);
  check("returnType: null for constructors",
    byName(fns, "Box").type === "constructor" &&
    byName(fns, "Box").returnType === null);
  check("returnType: generic return type captured verbatim",
    byName(fns, "mapAll").returnType === "List<R>");
});

// ------------------------------------------- outbound api_call (#2) --------
const apiOf = (fn) => (fn.statements || []).filter((s) => s.type === "api_call");

withTempRepo("Clients.java", `
package com.example;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.http.HttpMethod;
public class Clients {
  private final RestTemplate restTemplate = new RestTemplate();
  private final WebClient webClient = WebClient.create();
  public User get() { return restTemplate.getForObject("https://svc/users/1", User.class); }
  public void post(User u) { restTemplate.postForEntity("https://svc/users", u, User.class); }
  public void ex() { restTemplate.exchange("https://svc/x", HttpMethod.DELETE, null, String.class); }
  public Mono<User> wc() { return webClient.get().uri("/api/items/42").retrieve().bodyToMono(User.class); }
  public Object notHttp() { return cache.get("key"); }
}
`, (dir, file) => {
  const fns = extractFunctionsAndCalls(file, dir, {}, false, true);
  const one = (n) => apiOf(byName(fns, n))[0];
  check("api_call: RestTemplate getForObject -> GET + literal endpoint (in a return)",
    one("get") && one("get").method === "GET" && one("get").endpoint === "https://svc/users/1");
  check("api_call: RestTemplate postForEntity -> POST",
    one("post") && one("post").method === "POST" && one("post").endpoint === "https://svc/users");
  check("api_call: RestTemplate exchange reads HttpMethod.X verb",
    one("ex") && one("ex").method === "DELETE");
  check("api_call: WebClient fluent chain -> verb + uri() endpoint (full chain captured)",
    one("wc") && one("wc").method === "GET" && one("wc").endpoint === "/api/items/42");
  check("api_call: no false positive on generic .get()",
    apiOf(byName(fns, "notHttp")).length === 0);
});

withTempRepo("HttpClientDemo.java", `
package com.example;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.URI;
public class HttpClientDemo {
  private final HttpClient client = HttpClient.newHttpClient();
  public String getSync(String url) throws Exception {
    HttpRequest request = HttpRequest.newBuilder().uri(URI.create(url)).GET().build();
    return client.send(request, java.net.http.HttpResponse.BodyHandlers.ofString()).body();
  }
  public void getLiteral() throws Exception {
    HttpRequest r = HttpRequest.newBuilder().uri(URI.create("https://api/health")).GET().build();
    client.send(r, java.net.http.HttpResponse.BodyHandlers.ofString());
  }
}
`, (dir, file) => {
  const fns = extractFunctionsAndCalls(file, dir, {}, false, true);
  const sync = apiOf(byName(fns, "getSync"))[0];
  check("api_call: java.net.http builder -> verb captured, variable URI -> null endpoint",
    sync && sync.method === "GET" && sync.endpoint === null);
  const lit = apiOf(byName(fns, "getLiteral"))[0];
  check("api_call: java.net.http builder -> URI.create literal endpoint",
    lit && lit.method === "GET" && lit.endpoint === "https://api/health");
});

// ------------------------------------------ db_method_call fields (#3) -----
withTempRepo("Dao.java", `
package com.example;
public class Dao {
  private UserRepository repo;
  public User one(Long id) { return repo.findById(id); }
  public User two(Long id) { return this.repo.findOne(id); }
  public List<User> all() { return findAll(); }
}
`, (dir, file) => {
  const fns = extractFunctionsAndCalls(file, dir, {}, false, true);
  const db = (n) => (byName(fns, n).statements || []).find((s) => s.type === "db_method_call");
  check("db_method_call: method + receiver object captured",
    db("one") && db("one").method === "findById" && db("one").object === "repo");
  check("db_method_call: chained receiver kept verbatim",
    db("two") && db("two").method === "findOne" && db("two").object === "this.repo");
  check("db_method_call: object is null for a bare (receiver-less) call",
    db("all") && db("all").method === "findAll" && db("all").object === null);
});

console.log(`\n✅ All ${passed} assertions passed.`);
