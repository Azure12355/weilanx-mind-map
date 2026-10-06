// wm.mjs 集成测试:对构建产物执行真实命令(先 npm run build:cli)
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { parse, serialize } from "../src/core/doc";

const WM = path.resolve("skills/weilanx-mind-map/scripts/wm.mjs");
const wm = (...args: string[]) => execFileSync("node", [WM, ...args], { encoding: "utf8" });
const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "wm-")), "m.wmind");

test("cli:新建、按路径添加、设置、大纲", () => {
  const f = tmp();
  wm("new", f, "计划");
  wm("add", f, "--parent", "计划", "A", "B");
  wm("add", f, "--parent", "计划/A", "A1");
  wm("set", f, "计划/A/A1", "--marker", "task-50", "--label", "Q4", "--style", "fill=#ffe8a3");
  const o = wm("outline", f);
  assert.match(o, /- 计划\n {2}- A\n {4}- \[task-50\] A1 {2}#Q4\n {2}- B\n/);
  const text = fs.readFileSync(f, "utf8");
  assert.equal(serialize(parse(text).doc!), text, "写出的格式与插件一致");
  assert.match(text, /"fill": "#FFE8A3"/);
});

test("cli:移动、删除、联系线、概括、文档属性", () => {
  const f = tmp();
  wm("new", f, "R");
  const [a, b] = wm("add", f, "--parent", "R", "A", "B").trim().split("\n");
  wm("move", f, b, "--parent", a);
  wm("add", f, "--parent", "R", "C");
  wm("rel", f, "R/A/B", "R/C", "--text", "依赖");
  wm("doc", f, "--theme", "fresh", "--structure", "logic");
  const d = parse(fs.readFileSync(f, "utf8")).doc!;
  assert.equal(d.root.children![0].children![0].text, "B");
  assert.equal(d.relationships![0].text, "依赖");
  assert.equal(d.theme, "fresh");
  wm("rm", f, "R/A");
  const d2 = parse(fs.readFileSync(f, "utf8")).doc!;
  assert.equal(d2.relationships, undefined);
  assert.deepEqual(d2.root.children!.map((c) => c.text), ["C"]);
});

test("cli:错误返回非零退出码", () => {
  const f = tmp();
  wm("new", f, "R");
  const r = spawnSync("node", [WM, "set", f, "R/不存在", "--text", "x"], { encoding: "utf8" });
  assert.equal(r.status, 1);
  const s = spawnSync("node", [WM, "set", f, "R", "--style", "fill=red"], { encoding: "utf8" });
  assert.equal(s.status, 2);
  fs.writeFileSync(f, "{ bad json");
  const v = spawnSync("node", [WM, "validate", f], { encoding: "utf8" });
  assert.equal(v.status, 1);
  assert.match(v.stdout, /语法错误/);
});

test("cli:Markdown 互转", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wm-"));
  const md = path.join(dir, "大纲.md");
  fs.writeFileSync(md, "# 主题\n\n## 一\n\n- a\n  - b\n\n## 二\n");
  const f = path.join(dir, "out.wmind");
  wm("from-md", md, "-o", f);
  assert.match(wm("outline", f), /- 主题\n {2}- 一\n {4}- a\n {6}- b\n {2}- 二/);
  assert.equal(wm("to-md", f), "# 主题\n\n## 一\n\n- a\n  - b\n\n## 二\n");
});
