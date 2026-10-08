import { test } from "node:test";
import assert from "node:assert/strict";
import { parse, serialize, validate } from "../src/core/doc";
import * as ops from "../src/core/ops";
import { findByPath, findText, getTopic, indexDoc, outline, resolveRef, splitPath, topicPath } from "../src/core/query";
import { fromMarkdown, markdownLosses, toMarkdown } from "../src/core/markdown";
import { layout, NodeSize } from "../src/core/layout";
import { resolveAll, contrastText } from "../src/core/theme";
import { MindDoc } from "../src/core/types";

const SAMPLE: MindDoc = {
  version: 1,
  root: {
    id: "root01",
    text: "产品规划",
    children: [
      { id: "a00001", text: "用户调研", children: [{ id: "a00002", text: "访谈" }, { id: "a00003", text: "问卷" }, { id: "a00004", text: "数据" }] },
      { id: "b00001", text: "MVP" },
      { id: "c00001", text: "上线" },
    ],
  },
};

function doc(): MindDoc {
  return structuredClone(SAMPLE);
}

// ---------- 解析 / 序列化 ----------

test("序列化:键序固定、省略默认值、往返一致", () => {
  const d: MindDoc = {
    root: { children: [{ text: "b", id: "x00002", collapsed: false, markers: [] }], text: "a", id: "x00001", style: {} },
    theme: "classic",
    version: 1,
    structure: "map",
  } as unknown as MindDoc;
  const s = serialize(d);
  assert.equal(
    s,
    `{
  "version": 1,
  "root": {
    "id": "x00001",
    "text": "a",
    "children": [
      {
        "id": "x00002",
        "text": "b"
      }
    ]
  }
}
`
  );
  const r = parse(s);
  assert.equal(serialize(r.doc!), s);
  assert.equal(r.changed, false);
});

test("序列化:未知字段保留并排在已知字段之后", () => {
  const s = serialize({ version: 1, root: { custom: 1, id: "x00001", text: "a" }, extra: true } as unknown as MindDoc);
  const obj = JSON.parse(s);
  assert.deepEqual(Object.keys(obj), ["version", "root", "extra"]);
  assert.deepEqual(Object.keys(obj.root), ["id", "text", "custom"]);
});

test("解析:缺 id 自动补,重复 id 重新生成,字符串子节点转成节点", () => {
  const r = parse(JSON.stringify({ version: 1, root: { text: "r", children: [{ id: "dup", text: "1" }, { id: "dup", text: "2" }, "三", { text: 4 }] } }));
  const d = r.doc!;
  assert.ok(r.changed);
  assert.ok(d.root.id);
  const kids = d.root.children!;
  assert.equal(kids.length, 4);
  assert.equal(kids[0].id, "dup");
  assert.notEqual(kids[1].id, "dup");
  assert.equal(kids[2].text, "三");
  assert.equal(kids[3].text, "4");
  assert.ok(r.issues.some((i) => i.message.includes("重复")));
});

test("解析:语法错误给出行列号", () => {
  const r = parse('{\n  "version": 1,\n  "root": {,\n}');
  assert.equal(r.doc, null);
  assert.equal(r.error!.line, 3);
});

test("解析:空文件生成最小文档,版本过高只读", () => {
  const e = parse("  \n");
  assert.ok(e.empty);
  assert.equal(e.doc!.root.text, "中心主题");
  const v = parse(JSON.stringify({ version: 9, root: { id: "r", text: "x" } }));
  assert.ok(v.readOnly);
});

test("校验:悬空引用、非法样式、未知标记", () => {
  const d = doc();
  d.relationships = [{ id: "r1", from: "a00001", to: "nope" }];
  d.root.summaries = [{ id: "s1", from: "a00001", to: "zzz" }];
  d.root.children![1].style = { fill: "red", bold: true };
  d.root.children![2].markers = ["priority-1", "weird"];
  const issues = validate(d).map((i) => i.message).join("\n");
  assert.match(issues, /联系线「r1」/);
  assert.match(issues, /概括「s1」/);
  assert.match(issues, /fill/);
  assert.match(issues, /weird/);
});

// ---------- 查询 ----------

test("路径:按文本定位,支持 \\/ 转义,歧义报错", () => {
  const d = doc();
  assert.deepEqual(splitPath("a/b\\/c/"), ["a", "b/c"]);
  assert.equal(findByPath(d, "产品规划/用户调研/问卷")[0].id, "a00003");
  assert.equal(topicPath(d, "a00003"), "产品规划/用户调研/问卷");
  assert.equal(resolveRef(d, "b00001").text, "MVP");
  d.root.children!.push({ id: "dup001", text: "MVP" });
  assert.throws(() => resolveRef(d, "产品规划/MVP"), /匹配到 2 个/);
});

test("大纲:带 id 与深度限制", () => {
  const d = doc();
  const o = outline(d, { ids: true, depth: 1 });
  assert.match(o, /- 产品规划  \{root01\}/);
  assert.match(o, / {2}- 用户调研  \{a00001\}/);
  assert.match(o, /… 3 个子孙节点/);
  assert.doesNotMatch(o, /访谈/);
});

// ---------- 编辑操作 ----------

test("ops:不可变,未改动子树复用原引用", () => {
  const d = doc();
  const before = JSON.stringify(d);
  const d2 = ops.setText(d, "a00002", "访谈 10 人");
  assert.equal(JSON.stringify(d), before);
  assert.equal(getTopic(d2, "a00002")!.text, "访谈 10 人");
  assert.equal(d2.root.children![1], d.root.children![1]);
});

test("ops:增加子节点 / 同级 / 上级", () => {
  let d = doc();
  let r = ops.addChild(d, "b00001", { text: "新" });
  d = r.doc;
  assert.equal(getTopic(d, "b00001")!.children![0].id, r.id);
  r = ops.addSibling(d, "a00002", true, { text: "前" });
  d = r.doc;
  assert.equal(getTopic(d, "a00001")!.children![0].text, "前");
  const p = ops.insertParent(d, "c00001", { text: "上级" })!;
  d = p.doc;
  assert.equal(getTopic(d, p.id)!.children![0].id, "c00001");
  assert.equal(indexDoc(d).get("c00001")!.parent!.id, p.id);
  assert.equal(ops.insertParent(d, "root01"), null);
});

test("ops:删除时收缩概括范围、删除联系线", () => {
  let d = doc();
  d = ops.addRange(d, "summaries", ["a00002", "a00004"], "总结")!.doc;
  d = ops.addRelationship(d, "a00004", "c00001").doc;
  d = ops.remove(d, "a00004");
  const s = getTopic(d, "a00001")!.summaries![0];
  assert.equal(s.from, "a00002");
  assert.equal(s.to, "a00003");
  assert.equal(d.relationships, undefined);
  d = ops.remove(d, ["a00002", "a00003"]);
  assert.equal(getTopic(d, "a00001")!.summaries, undefined);
  assert.equal(getTopic(d, "a00001")!.children, undefined);
  assert.equal(ops.remove(d, "root01").root.id, "root01");
});

test("ops:移动、禁止移进自己的子树、自由主题互转", () => {
  let d = doc();
  d = ops.move(d, "c00001", "a00001", 0);
  assert.equal(getTopic(d, "a00001")!.children![0].id, "c00001");
  assert.throws(() => ops.move(d, "a00001", "a00002"), /子树/);
  d = ops.toFloating(d, "b00001", { x: 300, y: 100 });
  assert.equal(d.floating![0].id, "b00001");
  assert.deepEqual(d.floating![0].position, { x: 300, y: 100 });
  d = ops.move(d, "b00001", "root01");
  assert.equal(d.floating, undefined);
  assert.equal(getTopic(d, "b00001")!.position, undefined);
});

test("ops:批量移动保持顺序", () => {
  let d = doc();
  d = ops.moveMany(d, ["a00004", "a00002"], "b00001");
  assert.deepEqual(getTopic(d, "b00001")!.children!.map((c) => c.id), ["a00002", "a00004"]);
  d = ops.moveMany(d, ["a00002"], "b00001", 2);
  assert.deepEqual(getTopic(d, "b00001")!.children!.map((c) => c.id), ["a00004", "a00002"]);
});

test("ops:样式 / 标记同类互斥 / 标签 / 折叠", () => {
  let d = doc();
  d = ops.setStyle(d, ["a00001", "b00001"], { fill: "#FFE8A3", bold: true });
  d = ops.setStyle(d, "b00001", { fill: undefined, bold: undefined });
  assert.equal(getTopic(d, "b00001")!.style, undefined);
  assert.equal(getTopic(d, "a00001")!.style!.fill, "#FFE8A3");
  d = ops.addMarker(d, "a00001", "priority-1");
  d = ops.addMarker(d, "a00001", "priority-2");
  d = ops.addMarker(d, "a00001", "flag-red");
  assert.deepEqual(getTopic(d, "a00001")!.markers, ["priority-2", "flag-red"]);
  d = ops.toggleMarker(d, "a00001", "flag-red");
  assert.deepEqual(getTopic(d, "a00001")!.markers, ["priority-2"]);
  d = ops.addLabel(d, "a00001", "Q4");
  d = ops.addLabel(d, "a00001", "Q4");
  assert.deepEqual(getTopic(d, "a00001")!.labels, ["Q4"]);
  d = ops.toggleCollapsed(d, "a00001");
  assert.equal(getTopic(d, "a00001")!.collapsed, true);
  d = ops.addChild(d, "a00001").doc;
  assert.equal(getTopic(d, "a00001")!.collapsed, undefined);
});

test("ops:整棵子树展开 / 收起,中心主题本身不收起", () => {
  let d = doc();
  d = ops.addChild(d, "a00002", { text: "深访" }).doc;
  d = ops.setSubtreeCollapsed(d, "root01", true);
  assert.equal(getTopic(d, "root01")!.collapsed, undefined);
  assert.equal(getTopic(d, "a00001")!.collapsed, true);
  assert.equal(getTopic(d, "a00002")!.collapsed, true);
  assert.equal(getTopic(d, "b00001")!.collapsed, undefined);
  d = ops.setSubtreeCollapsed(d, "a00001", false);
  assert.equal(getTopic(d, "a00001")!.collapsed, undefined);
  assert.equal(getTopic(d, "a00002")!.collapsed, undefined);
  d = ops.setSubtreeCollapsed(d, "root01", true);
  d = ops.revealTopic(d, "a00003");
  assert.equal(getTopic(d, "a00001")!.collapsed, undefined);
  assert.equal(getTopic(d, "a00002")!.collapsed, true);
});

test("查找替换:纯文本、大小写、只改命中的节点", () => {
  let d = doc();
  d = ops.setText(d, "b00001", "MVP mvp (v1.*)");
  assert.deepEqual(findText(d, "mvp"), ["b00001"]);
  assert.deepEqual(findText(d, "MVP", true), ["b00001"]);
  assert.deepEqual(findText(d, "调"), ["a00001"]);
  assert.deepEqual(findText(d, ""), []);
  const before = getTopic(d, "c00001");
  d = ops.replaceText(d, ["b00001", "c00001"], "mvp", "$&!");
  assert.equal(getTopic(d, "b00001")!.text, "$&! $&! (v1.*)");
  assert.equal(getTopic(d, "c00001"), before);
  d = ops.replaceText(d, "b00001", "(v1.*)", "v2");
  assert.equal(getTopic(d, "b00001")!.text, "$&! $&! v2");
  d = ops.setText(d, "b00001", "Aa aa");
  d = ops.replaceText(d, "b00001", "aa", "b", true);
  assert.equal(getTopic(d, "b00001")!.text, "Aa b");
});

test("ops:粘贴子树重新生成 id 并修正内部范围", () => {
  let d = doc();
  d = ops.addRange(d, "boundaries", ["a00002", "a00003"])!.doc;
  const src = ops.copyTopics(d, ["a00001", "a00002"]);
  assert.equal(src.length, 1);
  const r = ops.pasteTopics(d, "c00001", src);
  const pasted = getTopic(r.doc, r.ids[0])!;
  assert.notEqual(pasted.id, "a00001");
  const b = pasted.boundaries![0];
  assert.equal(b.from, pasted.children![0].id);
  assert.equal(b.to, pasted.children![1].id);
  assert.equal(new Set(indexDoc(r.doc).keys()).size, indexDoc(r.doc).size);
});

test("ops:缩进 / 反缩进", () => {
  let d = doc();
  d = ops.indent(d, "b00001");
  assert.equal(indexDoc(d).get("b00001")!.parent!.id, "a00001");
  d = ops.outdent(d, "b00001");
  assert.equal(indexDoc(d).get("b00001")!.parent!.id, "root01");
  assert.equal(indexDoc(d).get("b00001")!.index, 1);
});

// ---------- Markdown ----------

test("Markdown:导出再导入,结构、文字、备注、标签、链接不丢", () => {
  let d = doc();
  d = ops.updateTopic(d, "a00002", { note: "第一行\n第二行", labels: ["重要"], link: "https://x.dev" });
  d = ops.addMarker(d, "a00003", "task-100");
  d = ops.setText(d, "b00001", "MVP\n两行");
  const md = toMarkdown(d);
  assert.match(md, /^# 产品规划/);
  assert.match(md, /## 用户调研/);
  assert.match(md, /- \[访谈\]\(https:\/\/x\.dev\) `#重要`/);
  const back = fromMarkdown(md);
  const strip = (x: MindDoc) => JSON.parse(JSON.stringify(x, (k, v) => (k === "id" ? undefined : v)));
  assert.deepEqual(strip(back), strip({ version: 1, root: d.root }));
});

test("Markdown:无标题列表、多级标题、正文成为备注", () => {
  const d = fromMarkdown("- a\n  - b\n    - c\n- d\n", "文件名");
  assert.equal(d.root.text, "文件名");
  assert.equal(d.root.children![0].children![0].children![0].text, "c");
  assert.equal(d.root.children![1].text, "d");
  const h = fromMarkdown("# R\n\n## A\n\n### A1\n\n说明文字\n\n- x\n\n## B\n");
  const a1 = h.root.children![0].children![0];
  assert.equal(a1.text, "A1");
  assert.equal(a1.note, "说明文字");
  assert.equal(a1.children![0].text, "x");
  assert.equal(h.root.children![1].text, "B");
});

test("Markdown:提示会丢失的内容", () => {
  let d = doc();
  d = ops.setStyle(d, "a00001", { bold: true });
  d = ops.addRelationship(d, "a00001", "b00001").doc;
  assert.deepEqual(markdownLosses(d).sort(), ["样式", "联系线"].sort());
});

// ---------- 主题 ----------

test("主题:一级分支彩虹色,子节点继承,节点覆盖优先", () => {
  let d = doc();
  d = ops.setStyle(d, "b00001", { fill: "#123456" });
  const { styles } = resolveAll(d, false);
  const a = styles.get("a00001")!;
  assert.equal(a.kind, "main");
  assert.equal(styles.get("a00002")!.branchColor, a.lineColor);
  assert.equal(styles.get("a00002")!.kind, "sub");
  assert.equal(styles.get("b00001")!.fill, "#123456");
  assert.equal(styles.get("b00001")!.textColor, "#FFFFFF");
  assert.equal(contrastText("#FFE8A3"), "#1F2329");
});

// ---------- 布局 ----------

function sizes(d: MindDoc): Map<string, NodeSize> {
  const m = new Map<string, NodeSize>();
  for (const id of indexDoc(d).keys()) m.set(id, { w: 100, h: 40 });
  return m;
}

test("布局 map:中心在原点,一级分支左右平衡,子节点不重叠", () => {
  const d = doc();
  const r = layout(d, sizes(d));
  const root = r.nodes.get("root01")!;
  assert.equal(root.x + root.w / 2, 0);
  assert.equal(root.y + root.h / 2, 0);
  assert.ok(r.nodes.get("a00001")!.x > 0); // 右
  assert.ok(r.nodes.get("b00001")!.x > 0); // 右(3 个分支,右 2 左 1)
  assert.ok(r.nodes.get("c00001")!.x < 0); // 左
  const kids = ["a00002", "a00003", "a00004"].map((id) => r.nodes.get(id)!);
  for (let i = 1; i < kids.length; i++) assert.ok(kids[i].y >= kids[i - 1].y + kids[i - 1].h);
  assert.equal(r.edges.length, 6);
  assert.ok(r.edges.filter((e) => e.fromRoot).length === 3);
});

test("布局:折叠的节点不排子节点", () => {
  const d = ops.setCollapsed(doc(), "a00001", true);
  const r = layout(d, sizes(d));
  assert.equal(r.nodes.has("a00002"), false);
});

test("布局 org / tree / logic 方向正确", () => {
  for (const st of ["org", "tree", "logic"] as const) {
    const d = ops.setDocProp(doc(), "structure", st);
    const r = layout(d, sizes(d));
    const root = r.nodes.get("root01")!;
    const a = r.nodes.get("a00001")!;
    if (st === "org") assert.ok(a.y > root.y + root.h);
    if (st === "logic") assert.ok(a.x >= root.x + root.w);
    if (st === "tree") {
      assert.ok(a.y > root.y + root.h);
      assert.ok(a.x > root.x);
    }
  }
});

test("布局:分支级结构覆盖", () => {
  const d = ops.updateTopic(doc(), "a00001", { structure: "org" });
  const r = layout(d, sizes(d));
  const a = r.nodes.get("a00001")!;
  const kid = r.nodes.get("a00002")!;
  assert.ok(kid.y > a.y + a.h);
});

test("布局:概括主题与外框", () => {
  let d = doc();
  const s = ops.addRange(d, "summaries", ["a00002", "a00004"], "总结")!;
  d = s.doc;
  const b = ops.addRange(d, "boundaries", ["a00002", "a00003"], "框")!;
  d = b.doc;
  const sz = sizes(d);
  sz.set(s.id, { w: 60, h: 30 });
  const r = layout(d, sz);
  const sum = r.nodes.get(s.id)!;
  const kid = r.nodes.get("a00002")!;
  assert.equal(sum.kind, "summary");
  assert.ok(sum.x > kid.x + kid.w);
  const box = r.boundaries.find((x) => x.id === b.id)!;
  assert.ok(box.x < kid.x && box.y < kid.y);
  const k3 = r.nodes.get("a00003")!;
  assert.ok(box.y + box.h > k3.y + k3.h);
  // 外框和范围外的兄弟节点不重叠
  const k4 = r.nodes.get("a00004")!;
  assert.ok(box.y + box.h <= k4.y);
});

test("布局:自由主题按 position 放置", () => {
  const d = ops.addFloating(doc(), { x: 400, y: -300 }, { text: "f" });
  const r = layout(d.doc, sizes(d.doc));
  const f = r.nodes.get(d.id)!;
  assert.equal(f.x, 400);
  assert.equal(f.y, -300);
  assert.ok(f.floatingRoot);
});

test("布局:同一范围的多个概括依次向外排开", () => {
  let d = doc();
  const s1 = ops.addRange(d, "summaries", ["a00002", "a00004"], "一")!;
  const s2 = ops.addRange(s1.doc, "summaries", ["a00002", "a00004"], "二")!;
  d = s2.doc;
  const sz = sizes(d);
  sz.set(s1.id, { w: 60, h: 30 });
  sz.set(s2.id, { w: 60, h: 30 });
  const r = layout(d, sz);
  const a = r.nodes.get(s1.id)!;
  const b = r.nodes.get(s2.id)!;
  assert.ok(b.x >= a.x + a.w);
});
