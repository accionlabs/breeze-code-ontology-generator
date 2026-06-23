/**
 * Java syntax-coverage test — Java 7 / 8 / 11 / 17.
 *
 * Regression assertions for every construct the extractor models, so working
 * behaviour can't silently regress. Originally this file also tracked KNOWN GAPS
 * (G1–G9) as executable reminders; G1–G4, G8 and G9 have since been fixed and
 * promoted here. G5 (class fields as a structured array), G6 (sealed/permits) and
 * G7 (throws) are intentionally out of scope — they require new graph fields with
 * no cross-language precedent — so no assertions are kept for them.
 *
 * Run: node test/java-syntax-coverage.test.js   (requires Node 22.x)
 * Note: tree-sitter's native binding segfaults on process teardown under Node 22,
 *       so this file (like the other java tests) may report exit code 134 AFTER
 *       printing its summary. Trust the printed summary, not the exit code.
 */
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { extractClasses } = require("../java/extract-classes-java");
const { extractFunctionsAndCalls, extractImports } = require("../java/extract-functions-java");

let passed = 0;
// Set VERBOSE=1 (env) to print a line per assertion; otherwise just the summary.
const VERBOSE = process.env.VERBOSE === "1" || process.argv.includes("-v");
function check(name, cond) {
  if (!cond) {
    console.error(`  ✗ ${name}`);
    assert.ok(cond, "CAPTURED failed: " + name);
  }
  if (VERBOSE) console.log(`  ✓ ${name}`);
  passed++;
}

// Write `src` as `name` into a temp repo, run both extractors, return results.
function run(name, src, { captureStatements = false, classIndex = {} } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jcov-"));
  const file = path.join(dir, name);
  fs.writeFileSync(file, src);
  try {
    return {
      classes: extractClasses(file, dir, captureStatements),
      fns: extractFunctionsAndCalls(file, dir, classIndex, false, captureStatements),
      imports: extractImports(file, classIndex),
    };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
const cls = (r, n) => r.classes.find((c) => c.name === n);
const fn = (r, n) => r.fns.find((f) => f.name === n);
const callNames = (f) => (f.calls || []).map((c) => c.name);
const stmtTypes = (f) => (f.statements || []).map((s) => s.type);

// =====================================================================
// CAPTURED — TYPE DECLARATIONS
// =====================================================================
{
  const r = run("Types.java", `
package p;
public abstract class Base extends Parent implements I1, I2 {
    public abstract void doIt();
}
interface I1 {}
class Outer {
    class Inner {}
    static class Nested {}
}
`);
  check("class captured with type=class", cls(r, "Base").type === "class");
  check("abstract modifier captured", cls(r, "Base").isAbstract === true);
  check("extends captured", cls(r, "Base").extends === "Parent");
  check("implements (multiple) captured", JSON.stringify(cls(r, "Base").implements) === JSON.stringify(["I1", "I2"]));
  check("interface captured with type=interface", cls(r, "I1").type === "interface");
  check("inner class captured", !!cls(r, "Inner"));
  check("static nested class captured", !!cls(r, "Nested"));
  check("visibility default=package", cls(r, "Outer").visibility === "package");
}

// =====================================================================
// CAPTURED — MEMBERS (constructors, visibility, static/instance, interface methods)
// =====================================================================
{
  const r = run("Members.java", `
package p;
public class Members {
    public Members(String a, int b) {}
    private void hidden() {}
    public static void util() {}
}
interface Calc {
    int base();                                  // abstract
    default int twice() { return base() * 2; }   // Java 8 default method
    static Calc empty() { return null; }         // Java 8 static method
    private int helper() { return 1; }           // Java 9 private interface method
    private static int shelp() { return 2; }     // Java 9 private static
}
`);
  check("constructor params captured", JSON.stringify(cls(r, "Members").constructorParams) === JSON.stringify(["a", "b"]));
  check("private method visibility captured", fn(r, "hidden").visibility === "private");
  check("static method kind captured", fn(r, "util").kind === "static");
  check("interface default method captured (Java 8)", !!fn(r, "twice"));
  check("interface static method captured (Java 8)", fn(r, "empty").kind === "static");
  check("private interface method captured (Java 9)", fn(r, "helper").visibility === "private");
  check("private static interface method captured (Java 9)", fn(r, "shelp").visibility === "private" && fn(r, "shelp").kind === "static");
}

// =====================================================================
// CAPTURED — ANNOTATIONS (class / method / parameter)
// =====================================================================
{
  const r = run("Anno.java", `
package p;
@RestController
@RequestMapping("/api")
public class Anno {
    @GetMapping("/{id}")
    public String get(@PathVariable("id") String id, @RequestBody Dto body) { return null; }
}
`);
  check("class annotations captured", JSON.stringify(cls(r, "Anno").decorators) === JSON.stringify(["@RestController", '@RequestMapping("/api")']));
  check("method annotation name+args captured", JSON.stringify(fn(r, "get").decorators) === JSON.stringify([{ name: "GetMapping", args: ["/{id}"] }]));
  const get = fn(r, "get");
  const idp = get.params.find((p) => p.name === "id");
  check("param annotation captured with arg", idp.decorators[0].name === "PathVariable" && idp.decorators[0].args[0] === "id");
  check("param type captured", get.params.find((p) => p.name === "body").type === "Dto");
}

// =====================================================================
// CAPTURED — JAVA 7 (PROJECT COIN: small language changes)
// All capture at method/call level; they introduce NO new version-specific gap.
// (The latent G5/G7 below are merely *exercised* by the field constants + throws.)
// =====================================================================
{
  const r = run("Coin.java", `
package p;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.StringReader;
import java.util.ArrayList;
import java.util.List;
public class Coin {
    static final int MASK = 0b0000_1111;          // binary + underscore literals
    static final long BIG = 1_000_000L;
    public int route(String cmd) {                // strings in switch
        switch (cmd) { case "a": return 1; case "b": case "c": return 2; default: return 0; }
    }
    public String firstLine(String t) throws IOException {   // try-with-resources (2 resources)
        try (StringReader sr = new StringReader(t); BufferedReader br = new BufferedReader(sr)) {
            return br.readLine();
        }
    }
    public int parseSafe(String v) {              // multi-catch + precise rethrow
        try { return Integer.parseInt(v.trim()); }
        catch (NumberFormatException | NullPointerException e) { return -1; }
    }
    public List<String> diamond() {               // diamond operator
        List<String> xs = new ArrayList<>();
        xs.add("x");
        return xs;
    }
}
`);
  check("Java 7: binary/underscore literals don't break class capture", cls(r, "Coin").methods.length === 4);
  check("Java 7: strings-in-switch method captured", !!fn(r, "route"));
  check("Java 7: try-with-resources body calls captured", callNames(fn(r, "firstLine")).includes("readLine"));
  check("Java 7: multi-catch body calls captured", callNames(fn(r, "parseSafe")).includes("parseInt"));
  check("Java 7: diamond-operator body calls captured", callNames(fn(r, "diamond")).includes("add"));
}

// =====================================================================
// CAPTURED — JAVA 8 / 11 / 17 BODY SYNTAX
// =====================================================================
{
  const r = run("Bodies.java", `
package p;
import java.util.List;
import java.util.function.BiFunction;
public class Bodies {
    public void java8(List<String> xs) {                 // lambdas / streams / method refs
        xs.stream().map(String::toUpperCase).forEach(s -> System.out.println(s));
    }
    public void java10() { var n = compute(); n.toString(); }              // var (Java 10)
    public void java11() { BiFunction<String,String,Integer> f = (var a, var b) -> a.length() + b.length(); f.apply("x","y"); }  // var in lambda (Java 11)
    public int java14(String day) {                       // switch expression (Java 14)
        return switch (day) { case "MON" -> 1; default -> 0; };
    }
    public String java16(Object o) {                      // pattern matching instanceof (Java 16)
        if (o instanceof String s) { return s.trim(); }
        return "";
    }
    private Object compute() { return null; }
}
`);
  check("lambda/stream/method-ref calls captured (Java 8)", ["stream", "map", "forEach", "println"].every((c) => callNames(fn(r, "java8")).includes(c)));
  check("var local does not break call capture (Java 10)", callNames(fn(r, "java10")).includes("toString"));
  check("var-in-lambda does not break call capture (Java 11)", callNames(fn(r, "java11")).includes("apply"));
  check("switch expression method captured (Java 14)", !!fn(r, "java14"));
  check("pattern-matching instanceof captured (Java 16)", callNames(fn(r, "java16")).includes("trim"));
}

// CAPTURED — text block (Java 15) with embedded SQL is detected as a query_statement
{
  const r = run("TextBlock.java", `
package p;
public class TextBlock {
    String q() {
        return """
            SELECT id, name FROM users WHERE active = true
            """;
    }
}
`, { captureStatements: true });
  check("text-block SQL detected as query_statement (Java 15)", stmtTypes(fn(r, "q")).includes("query_statement"));
}

// =====================================================================
// CAPTURED — IMPORTS (stdlib classification + local resolution)
// =====================================================================
{
  const r = run("Imports.java", `
package p;
import java.util.List;
import jakarta.inject.Inject;
import com.acme.Helper;
public class Imports {}
`, { classIndex: { "com.acme.Helper": "src/main/java/com/acme/Helper.java" } });
  check("java.* classified external", r.imports.externalImports.includes("java.util.List"));
  check("jakarta.* classified external (Java EE -> Jakarta)", r.imports.externalImports.includes("jakarta.inject.Inject"));
  check("local import resolved to file via classIndex", r.imports.importFiles.includes("src/main/java/com/acme/Helper.java"));
}

// =====================================================================
// CAPTURED — FORMER GAPS (G1–G4, G8, G9), now fully modelled.
// (G5 class fields, G6 sealed/permits, G7 throws are intentionally NOT
//  captured — they need new graph fields with no cross-language precedent
//  and are out of scope; no assertions are kept for them.)
// =====================================================================

// G1 — enum (Java 5+): modelled as a type node; constants captured; methods owned.
{
  const r = run("Color.java", `package p; public enum Color implements Named { RED, GREEN; public String hex() { return ""; } }`, { captureStatements: true });
  const color = cls(r, "Color");
  check("G1 enum captured as a type node (type:enum)", color && color.type === "enum");
  check("G1 enum implements edge captured", color && color.implements.includes("Named"));
  check("G1 enum constants captured as statements", color && ["RED", "GREEN"].every(n => color.statements.some(s => s.type === "enum_constant" && s.name === n)));
  check("G1 enum method owned by its type", color && color.methods.includes("hex"));
}
// G2 — annotation type @interface (Java 5+): modelled as a type node; elements captured as methods.
{
  const r = run("Audited.java", `package p; public @interface Audited { String value() default ""; int level() default 0; }`);
  const audited = cls(r, "Audited");
  check("G2 @interface captured as a type node (type:annotation)", audited && audited.type === "annotation");
  check("G2 @interface elements captured as methods", audited && ["value", "level"].every(n => audited.methods.includes(n)));
}

// G3 — record (Java 16+): modelled as a type node; components map to constructorParams; implements + methods owned.
{
  const r = run("Point.java", `package p; public record Point(int x, int y) implements Cmp { public int sum() { return x + y; } }`);
  const point = cls(r, "Point");
  check("G3 record captured as a type node (type:record)", point && point.type === "record");
  check("G3 record components captured as constructorParams", point && JSON.stringify(point.constructorParams) === JSON.stringify(["x", "y"]));
  check("G3 record implements edge captured", point && point.implements.includes("Cmp"));
  check("G3 record method owned by its type", point && point.methods.includes("sum"));
}

// G4 — generics: type parameters captured (raw text) on class and method `generics` field.
{
  const r = run("Box.java", `package p; public class Box<T extends Number> { public <R> R map() { return null; } }`);
  const box = cls(r, "Box");
  check("generic class name captured without angle brackets", box.name === "Box");
  check("G4 class type parameters captured in generics", box.generics === "<T extends Number>");
  check("G4 method type parameters captured in generics", fn(r, "map").generics === "<R>");
}

// G8 — module-info.java (Java 9+): module node + requires/exports directives + dependency edges.
{
  const r = run("module-info.java", `module com.example.app { requires java.sql; requires transitive com.acme.api; exports com.example.api; }`, { captureStatements: true });
  const mod = r.classes.find((c) => c.type === "module");
  check("G8 module captured as a type:module node", mod && mod.name === "com.example.app");
  check("G8 requires directives captured", mod && ["java.sql", "com.acme.api"].every(n => mod.statements.some(s => s.type === "requires_module_directive" && s.name === n)));
  check("G8 exports directive captured", mod && mod.statements.some(s => s.type === "exports_module_directive" && s.name === "com.example.api"));
  check("G8 requires surface as dependency edges (externalImports)", ["java.sql", "com.acme.api"].every(n => r.imports.externalImports.includes(n)));
}

// G9 — nested/anonymous-class return leaks into the enclosing method's statements.
{
  const r = run("Leak.java", `
package p;
public class Leak {
    Object outer() {
        Runnable inner = new Runnable() {
            public void run() {
                int z = 0;
                return;            // line 8: belongs to run(), not outer()
            }
        };
        return inner;              // line 11: outer()'s own return
    }
}
`, { captureStatements: true });
  const outer = fn(r, "outer");
  const runFn = fn(r, "run");
  const outerReturns = (outer.statements || []).filter((s) => s.type === "return_statement");
  // outer() owns only its own return (line 11); the nested run()'s return (line 8) must NOT leak in.
  check("G9 nested-class return does not leak into enclosing method", outerReturns.every((s) => s.startLine !== 8));
  check("G9 enclosing method keeps its own return", outerReturns.some((s) => s.startLine === 11));
  check("G9 nested method owns its own return", (runFn.statements || []).some((s) => s.type === "return_statement" && s.startLine === 8));
}

// =====================================================================
// SUMMARY
// =====================================================================
console.log(`\n✅ ${passed} assertions passed (all CAPTURED regression checks).`);
