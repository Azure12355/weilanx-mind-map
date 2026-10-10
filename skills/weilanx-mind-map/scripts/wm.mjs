#!/usr/bin/env node

// src/cli/wm.ts
import * as fs from "fs";
import * as path from "path";

// src/core/id.ts
var CHARS = "0123456789abcdefghijklmnopqrstuvwxyz";
function genId(used) {
  for (; ; ) {
    let id = "";
    for (let i = 0; i < 6; i++) id += CHARS[Math.floor(Math.random() * 36)];
    if (!used.has(id)) {
      used.add(id);
      return id;
    }
  }
}

// src/core/markers.ts
var PRIORITY_COLORS = ["#E5484D", "#F76B15", "#F5B400", "#30A46C", "#0090FF", "#6E56CF", "#8E8C99", "#8E8C99", "#8E8C99"];
var COLORS = {
  red: "#E5484D",
  orange: "#F76B15",
  yellow: "#F5B400",
  green: "#30A46C",
  blue: "#0090FF",
  purple: "#8E4EC6"
};
var MARKER_CATEGORIES = [
  {
    id: "priority",
    zh: "\u4F18\u5148\u7EA7",
    en: "Priority",
    markers: PRIORITY_COLORS.map((color, i) => ({ id: `priority-${i + 1}`, category: "priority", color, glyph: String(i + 1) }))
  },
  {
    id: "task",
    zh: "\u4EFB\u52A1\u8FDB\u5EA6",
    en: "Task",
    markers: [0, 25, 50, 75, 100].map((p) => ({ id: `task-${p}`, category: "task", color: "#30A46C", glyph: p === 100 ? "\u2713" : "", progress: p }))
  },
  {
    id: "flag",
    zh: "\u65D7\u5E1C",
    en: "Flag",
    markers: Object.entries(COLORS).map(([k, color]) => ({ id: `flag-${k}`, category: "flag", color, glyph: "\u2691" }))
  },
  {
    id: "star",
    zh: "\u661F\u661F",
    en: "Star",
    markers: Object.entries(COLORS).map(([k, color]) => ({ id: `star-${k}`, category: "star", color, glyph: "\u2605" }))
  },
  {
    id: "smiley",
    zh: "\u8868\u60C5",
    en: "Smiley",
    markers: [
      ["happy", "\u263A"],
      ["laugh", "\u{1F604}"],
      ["sad", "\u2639"],
      ["angry", "\u{1F620}"],
      ["surprised", "\u{1F62E}"]
    ].map(([k, glyph]) => ({ id: `smiley-${k}`, category: "smiley", color: "#F5B400", glyph }))
  },
  {
    id: "symbol",
    zh: "\u7B26\u53F7",
    en: "Symbol",
    markers: [
      ["question", "?", "#0090FF"],
      ["exclamation", "!", "#E5484D"],
      ["check", "\u2713", "#30A46C"],
      ["cross", "\u2715", "#E5484D"],
      ["idea", "\u{1F4A1}", "#F5B400"]
    ].map(([k, glyph, color]) => ({ id: `symbol-${k}`, category: "symbol", color, glyph }))
  }
];
var BY_ID = /* @__PURE__ */ new Map();
for (const c of MARKER_CATEGORIES) for (const m of c.markers) BY_ID.set(m.id, m);
function markerDef(id) {
  return BY_ID.get(id);
}
function markerCategory(id) {
  const i = id.lastIndexOf("-");
  return i > 0 ? id.slice(0, i) : id;
}
var ALL_MARKER_IDS = [...BY_ID.keys()];

// src/core/types.ts
var STRUCTURES = ["map", "logic", "org", "tree"];
var SHAPES = ["rect", "rounded", "capsule", "ellipse", "underline", "none"];
var LOOKS = ["standard", "hand"];
var FILL_STYLES = ["hachure", "cross-hatch", "solid", "dots", "dashed", "zigzag", "none"];
var TEXT_ALIGNS = ["left", "center", "right"];
var LINE_STYLES = ["curve", "straight", "elbow"];
var FORMAT_VERSION = 1;
var DEFAULT_THEME = "classic";
var DEFAULT_STRUCTURE = "map";
var DEFAULT_LOOK = "standard";
var DEFAULT_FILL_STYLE = "hachure";

// src/core/doc.ts
function newDoc(rootText = "\u4E2D\u5FC3\u4E3B\u9898") {
  return { version: FORMAT_VERSION, root: { id: genId(/* @__PURE__ */ new Set()), text: rootText } };
}
function parse(text) {
  if (!text.trim()) {
    return { doc: newDoc(), issues: [], changed: false, readOnly: false, empty: true };
  }
  let raw;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    return { doc: null, error: locateError(text, err.message), issues: [], changed: false, readOnly: false, empty: false };
  }
  const issues = [];
  const state = { taken: /* @__PURE__ */ new Set(), avoid: /* @__PURE__ */ new Set(), changed: false, issues };
  if (!isObj(raw)) {
    issues.push({ level: "error", message: "\u6587\u4EF6\u9876\u5C42\u4E0D\u662F JSON \u5BF9\u8C61,\u5DF2\u6309\u7A7A\u6587\u6863\u6253\u5F00" });
    return { doc: newDoc(), issues, changed: true, readOnly: false, empty: false };
  }
  const doc = normalizeDoc(raw, state);
  issues.push(...validate(doc));
  const readOnly = doc.version > FORMAT_VERSION;
  if (readOnly) {
    issues.unshift({ level: "error", message: `\u6587\u4EF6\u683C\u5F0F\u7248\u672C ${doc.version} \u9AD8\u4E8E\u63D2\u4EF6\u652F\u6301\u7684\u7248\u672C ${FORMAT_VERSION},\u5DF2\u53EA\u8BFB\u6253\u5F00,\u8BF7\u5347\u7EA7\u63D2\u4EF6` });
  }
  return { doc, issues, changed: state.changed, readOnly, empty: false };
}
function locateError(text, message) {
  const lc = /line (\d+) column (\d+)/.exec(message);
  if (lc) return { message, line: Number(lc[1]), column: Number(lc[2]) };
  const pos = /position (\d+)/.exec(message);
  let offset = pos ? Number(pos[1]) : text.length;
  offset = Math.min(offset, text.length);
  const before = text.slice(0, offset).split("\n");
  return { message, line: before.length, column: before[before.length - 1].length + 1 };
}
function isObj(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function takeId(v, st, what) {
  if (typeof v === "string" && v.trim() && !st.taken.has(v)) {
    st.taken.add(v);
    st.avoid.add(v);
    return v;
  }
  st.changed = true;
  const id = genId(st.avoid);
  st.taken.add(id);
  if (typeof v === "string" && v.trim()) {
    st.issues.push({ level: "warn", message: `${what}\u7684 id\u300C${v}\u300D\u91CD\u590D,\u5DF2\u91CD\u65B0\u751F\u6210\u4E3A\u300C${id}\u300D`, id });
  }
  return id;
}
function collectIds(raw, out) {
  if (Array.isArray(raw)) {
    for (const x of raw) collectIds(x, out);
  } else if (isObj(raw)) {
    for (const [k, v] of Object.entries(raw)) {
      if (k === "id" && typeof v === "string") out.add(v);
      else if (typeof v === "object") collectIds(v, out);
    }
  }
}
function normalizeDoc(raw, ctx) {
  collectIds(raw, ctx.avoid);
  const out = { ...raw };
  if (typeof raw.version !== "number") {
    out.version = FORMAT_VERSION;
    ctx.changed = true;
  }
  if (raw.theme !== void 0 && typeof raw.theme !== "string") {
    delete out.theme;
    ctx.changed = true;
  }
  if (raw.look !== void 0 && !LOOKS.includes(raw.look)) {
    ctx.issues.push({ level: "warn", message: `\u672A\u77E5\u753B\u6CD5\u300C${String(raw.look)}\u300D,\u6309 ${DEFAULT_LOOK} \u663E\u793A` });
  }
  if (raw.fillStyle !== void 0 && !FILL_STYLES.includes(raw.fillStyle)) {
    ctx.issues.push({ level: "warn", message: `\u672A\u77E5\u586B\u5145\u6837\u5F0F\u300C${String(raw.fillStyle)}\u300D,\u6309 ${DEFAULT_FILL_STYLE} \u663E\u793A` });
  }
  if (raw.structure !== void 0 && !STRUCTURES.includes(raw.structure)) {
    ctx.issues.push({ level: "warn", message: `\u672A\u77E5\u7ED3\u6784\u300C${String(raw.structure)}\u300D,\u6309 ${DEFAULT_STRUCTURE} \u663E\u793A` });
  }
  if (isObj(raw.root)) {
    out.root = normalizeTopic(raw.root, ctx);
  } else {
    out.root = { id: takeId(void 0, ctx, "\u4E2D\u5FC3\u4E3B\u9898"), text: typeof raw.root === "string" ? raw.root : "\u4E2D\u5FC3\u4E3B\u9898" };
    ctx.changed = true;
    if (raw.root !== void 0) ctx.issues.push({ level: "warn", message: "root \u4E0D\u662F\u5BF9\u8C61,\u5DF2\u91CD\u5EFA\u4E2D\u5FC3\u4E3B\u9898" });
  }
  if (raw.floating !== void 0) {
    const list = Array.isArray(raw.floating) ? raw.floating : [];
    out.floating = [];
    list.forEach((f, i) => {
      const t = toTopicObj(f, ctx);
      if (!t) return;
      const topic = normalizeTopic(t, ctx);
      if (!isPoint(topic.position)) {
        topic.position = { x: 320, y: 160 + i * 90 };
        ctx.changed = true;
      }
      out.floating.push(topic);
    });
  }
  if (raw.relationships !== void 0) {
    const list = Array.isArray(raw.relationships) ? raw.relationships : [];
    out.relationships = [];
    for (const r of list) {
      if (!isObj(r)) {
        ctx.changed = true;
        continue;
      }
      const rel = { ...r };
      rel.id = takeId(r.id, ctx, "\u8054\u7CFB\u7EBF");
      rel.from = String(r.from ?? "");
      rel.to = String(r.to ?? "");
      if (r.text !== void 0 && typeof r.text !== "string") rel.text = String(r.text);
      out.relationships.push(rel);
    }
  }
  return out;
}
function toTopicObj(v, st) {
  if (isObj(v)) return v;
  if (typeof v === "string" || typeof v === "number") {
    st.changed = true;
    return { text: String(v) };
  }
  st.changed = true;
  return null;
}
function isPoint(p) {
  return isObj(p) && typeof p.x === "number" && typeof p.y === "number";
}
function normalizeTopic(raw, st) {
  const t = { ...raw };
  t.id = takeId(raw.id, st, "\u8282\u70B9");
  if (typeof raw.text !== "string") {
    t.text = raw.text === void 0 || raw.text === null ? "" : String(raw.text);
    st.changed = true;
  }
  if (raw.collapsed !== void 0 && raw.collapsed !== true) {
    delete t.collapsed;
    if (raw.collapsed !== false) st.changed = true;
  }
  for (const key of ["markers", "labels"]) {
    const v = raw[key];
    if (v === void 0) continue;
    if (!Array.isArray(v)) {
      t[key] = typeof v === "string" ? [v] : [];
      st.changed = true;
    } else if (v.some((x) => typeof x !== "string")) {
      t[key] = v.filter((x) => typeof x === "string" || typeof x === "number").map(String);
      st.changed = true;
    }
  }
  for (const key of ["note", "link"]) {
    const v = raw[key];
    if (v !== void 0 && typeof v !== "string") {
      t[key] = v === null ? void 0 : String(v);
      st.changed = true;
    }
  }
  if (raw.style !== void 0 && !isObj(raw.style)) {
    delete t.style;
    st.changed = true;
  }
  if (raw.children !== void 0) {
    const list = Array.isArray(raw.children) ? raw.children : [];
    const children = [];
    for (const c of list) {
      const obj = toTopicObj(c, st);
      if (obj) children.push(normalizeTopic(obj, st));
    }
    t.children = children;
    if (!Array.isArray(raw.children)) st.changed = true;
  }
  for (const key of ["summaries", "boundaries"]) {
    const v = raw[key];
    if (v === void 0) continue;
    const list = Array.isArray(v) ? v : [];
    t[key] = list.filter(isObj).map((r) => {
      const range = { ...r };
      range.id = takeId(r.id, st, key === "summaries" ? "\u6982\u62EC" : "\u5916\u6846");
      range.from = String(r.from ?? "");
      range.to = String(r.to ?? range.from);
      if (r.text !== void 0 && typeof r.text !== "string") range.text = String(r.text);
      return range;
    });
    if (list.length !== t[key].length || !Array.isArray(v)) st.changed = true;
  }
  return t;
}
var HEX = /^#[0-9a-fA-F]{6}$/;
function badStyleKeys(style, forRelationship = false) {
  if (!style) return [];
  const bad = [];
  for (const [k, v] of Object.entries(style)) {
    if (!styleValueOk(k, v, forRelationship)) bad.push(k);
  }
  return bad;
}
function styleValueOk(key, v, forRelationship = false) {
  switch (key) {
    case "fill":
    case "border":
      return v === "none" || typeof v === "string" && HEX.test(v);
    case "textColor":
    case "lineColor":
      return typeof v === "string" && HEX.test(v);
    case "borderWidth":
      return typeof v === "number" && v >= 0 && v <= 6;
    case "fontSize":
      return typeof v === "number" && v >= 10 && v <= 48;
    case "lineWidth":
      return typeof v === "number" && v >= 1 && v <= 8;
    case "shape":
      return SHAPES.includes(v);
    case "bold":
    case "italic":
    case "strike":
      return typeof v === "boolean";
    case "lineStyle":
      return LINE_STYLES.includes(v) || forRelationship && (v === "dashed" || v === "solid");
    case "fillStyle":
      return FILL_STYLES.includes(v);
    case "textAlign":
      return TEXT_ALIGNS.includes(v);
    default:
      return true;
  }
}
function validate(doc) {
  const issues = [];
  const ids = /* @__PURE__ */ new Set();
  const visit = (t) => {
    ids.add(t.id);
    const bad = badStyleKeys(t.style);
    if (bad.length) issues.push({ level: "warn", message: `\u8282\u70B9\u300C${short(t.text)}\u300D\u7684\u6837\u5F0F\u503C\u975E\u6CD5:${bad.join(", ")},\u5DF2\u6309\u4E3B\u9898\u9ED8\u8BA4\u663E\u793A`, id: t.id });
    for (const m of t.markers ?? []) {
      if (!markerDef(m)) issues.push({ level: "warn", message: `\u8282\u70B9\u300C${short(t.text)}\u300D\u6709\u672A\u77E5\u6807\u8BB0\u300C${m}\u300D`, id: t.id });
    }
    if (t.structure !== void 0 && !STRUCTURES.includes(t.structure)) {
      issues.push({ level: "warn", message: `\u8282\u70B9\u300C${short(t.text)}\u300D\u7684\u7ED3\u6784\u300C${String(t.structure)}\u300D\u672A\u77E5,\u5DF2\u5FFD\u7565`, id: t.id });
    }
    const childIds = new Set((t.children ?? []).map((c) => c.id));
    for (const key of ["summaries", "boundaries"]) {
      for (const r of t[key] ?? []) {
        ids.add(r.id);
        if (!childIds.has(r.from) || !childIds.has(r.to)) {
          const what = key === "summaries" ? "\u6982\u62EC" : "\u5916\u6846";
          issues.push({ level: "warn", message: `\u8282\u70B9\u300C${short(t.text)}\u300D\u7684${what}\u300C${r.id}\u300D\u5F15\u7528\u7684\u5B50\u8282\u70B9\u4E0D\u5B58\u5728,\u6682\u4E0D\u663E\u793A`, id: r.id });
        }
      }
    }
    for (const c of t.children ?? []) visit(c);
  };
  visit(doc.root);
  for (const f of doc.floating ?? []) visit(f);
  for (const r of doc.relationships ?? []) {
    if (!ids.has(r.from) || !ids.has(r.to)) {
      issues.push({ level: "warn", message: `\u8054\u7CFB\u7EBF\u300C${r.id}\u300D\u7684\u7AEF\u70B9\u4E0D\u5B58\u5728(${r.from} \u2192 ${r.to}),\u6682\u4E0D\u663E\u793A`, id: r.id });
    }
    const bad = badStyleKeys(r.style, true);
    if (bad.length) issues.push({ level: "warn", message: `\u8054\u7CFB\u7EBF\u300C${r.id}\u300D\u7684\u6837\u5F0F\u503C\u975E\u6CD5:${bad.join(", ")}`, id: r.id });
  }
  return issues;
}
function short(s) {
  const one2 = s.replace(/\n/g, " ");
  return one2.length > 20 ? one2.slice(0, 20) + "\u2026" : one2;
}
var DOC_KEYS = ["$schema", "version", "theme", "look", "fillStyle", "structure", "root", "relationships", "floating"];
var TOPIC_KEYS = ["id", "text", "collapsed", "structure", "position", "style", "markers", "labels", "note", "link", "summaries", "boundaries", "children"];
var REF_KEYS = ["id", "from", "to", "text", "controls", "style"];
var STYLE_KEYS = ["shape", "fill", "border", "borderWidth", "textColor", "fontSize", "bold", "italic", "strike", "lineColor", "lineWidth", "lineStyle", "fillStyle", "textAlign"];
function isEmpty(v) {
  if (v === void 0 || v === null) return true;
  if (Array.isArray(v)) return v.length === 0;
  if (isObj(v)) return Object.keys(v).length === 0;
  return false;
}
function ordered(obj, keys, map) {
  const out = {};
  const put = (k) => {
    const v = map(k, obj[k]);
    if (v !== void 0) out[k] = v;
  };
  for (const k of keys) if (k in obj) put(k);
  for (const k of Object.keys(obj)) if (!keys.includes(k)) put(k);
  return out;
}
function serStyle(s) {
  if (!isObj(s)) return void 0;
  const o = ordered(s, STYLE_KEYS, (_k, v) => v === void 0 || v === null ? void 0 : v);
  return isEmpty(o) ? void 0 : o;
}
function serRef(r) {
  return ordered(r, REF_KEYS, (k, v) => {
    if (k === "style") return serStyle(v);
    if (k === "text" && v === "") return void 0;
    return isEmpty(v) ? void 0 : v;
  });
}
function serTopic(t) {
  return ordered(t, TOPIC_KEYS, (k, v) => {
    switch (k) {
      case "text":
        return typeof v === "string" ? v : "";
      case "collapsed":
        return v === true ? true : void 0;
      case "note":
      case "link":
        return v === "" ? void 0 : isEmpty(v) ? void 0 : v;
      case "style":
        return serStyle(v);
      case "summaries":
      case "boundaries":
        return isEmpty(v) ? void 0 : v.map((r) => serRef(r));
      case "children":
        return isEmpty(v) ? void 0 : v.map(serTopic);
      default:
        return isEmpty(v) ? void 0 : v;
    }
  });
}
function serialize(doc) {
  const out = ordered(doc, DOC_KEYS, (k, v) => {
    switch (k) {
      case "version":
        return typeof v === "number" ? v : FORMAT_VERSION;
      case "theme":
        return v === DEFAULT_THEME || isEmpty(v) ? void 0 : v;
      case "look":
        return v === DEFAULT_LOOK || isEmpty(v) ? void 0 : v;
      case "fillStyle":
        return v === DEFAULT_FILL_STYLE || isEmpty(v) ? void 0 : v;
      case "structure":
        return v === DEFAULT_STRUCTURE || isEmpty(v) ? void 0 : v;
      case "root":
        return serTopic(v);
      case "relationships":
        return isEmpty(v) ? void 0 : v.map((r) => serRef(r));
      case "floating":
        return isEmpty(v) ? void 0 : v.map(serTopic);
      default:
        return isEmpty(v) ? void 0 : v;
    }
  });
  if (!("version" in out)) {
    const { $schema, ...rest } = out;
    return JSON.stringify({ ...$schema !== void 0 ? { $schema } : {}, version: FORMAT_VERSION, ...rest }, null, 2) + "\n";
  }
  return JSON.stringify(out, null, 2) + "\n";
}

// src/core/query.ts
var cache = /* @__PURE__ */ new WeakMap();
function indexDoc(doc) {
  let map = cache.get(doc);
  if (map) return map;
  map = /* @__PURE__ */ new Map();
  const m = map;
  const visit = (t, parent, index, depth, tree, path2) => {
    m.set(t.id, { topic: t, parent, index, depth, loc: { tree, path: path2 } });
    (t.children ?? []).forEach((c, i) => visit(c, t, i, depth + 1, tree, [...path2, i]));
  };
  visit(doc.root, null, -1, 0, -1, []);
  (doc.floating ?? []).forEach((f, i) => visit(f, null, -1, 0, i, []));
  cache.set(doc, map);
  return map;
}
function getTopic(doc, id) {
  return indexDoc(doc).get(id)?.topic;
}
function isInSubtree(doc, ancestorId, id) {
  let e = indexDoc(doc).get(id);
  while (e) {
    if (e.topic.id === ancestorId) return true;
    e = e.parent ? indexDoc(doc).get(e.parent.id) : void 0;
  }
  return false;
}
function walk(t, fn, depth = 0) {
  fn(t, depth);
  for (const c of t.children ?? []) walk(c, fn, depth + 1);
}
function subtreeIds(t) {
  const s = /* @__PURE__ */ new Set();
  walk(t, (x) => s.add(x.id));
  return s;
}
function allIds(doc) {
  const s = /* @__PURE__ */ new Set();
  const visit = (t) => {
    walk(t, (x) => {
      s.add(x.id);
      for (const r of x.summaries ?? []) s.add(r.id);
      for (const r of x.boundaries ?? []) s.add(r.id);
    });
  };
  visit(doc.root);
  for (const f of doc.floating ?? []) visit(f);
  for (const r of doc.relationships ?? []) s.add(r.id);
  return s;
}
function splitPath(path2) {
  const parts = [];
  let cur = "";
  for (let i = 0; i < path2.length; i++) {
    const ch = path2[i];
    if (ch === "\\" && path2[i + 1] === "/") {
      cur += "/";
      i++;
    } else if (ch === "/") {
      parts.push(cur);
      cur = "";
    } else cur += ch;
  }
  parts.push(cur);
  return parts.map((p) => p.trim()).filter((p) => p !== "");
}
function escapeSeg(text) {
  return text.replace(/\n/g, " ").replace(/\//g, "\\/");
}
function topicPath(doc, id) {
  const parts = [];
  let e = indexDoc(doc).get(id);
  while (e) {
    parts.unshift(escapeSeg(e.topic.text));
    e = e.parent ? indexDoc(doc).get(e.parent.id) : void 0;
  }
  return parts.join("/");
}
function findByPath(doc, path2) {
  const segs = splitPath(path2);
  if (!segs.length) return [];
  const norm = (s) => s.replace(/\s+/g, " ").trim();
  let level = [doc.root, ...doc.floating ?? []].filter((t) => norm(t.text) === segs[0]);
  for (const seg of segs.slice(1)) {
    level = level.flatMap((t) => (t.children ?? []).filter((c) => norm(c.text) === seg));
  }
  return level;
}
var RefError = class extends Error {
  constructor(message, candidates = []) {
    super(message);
    this.candidates = candidates;
  }
};
function resolveRef(doc, ref2) {
  const byId = getTopic(doc, ref2);
  if (byId) return byId;
  const hits = findByPath(doc, ref2);
  if (hits.length === 1) return hits[0];
  if (!hits.length) throw new RefError(`\u627E\u4E0D\u5230\u8282\u70B9\u300C${ref2}\u300D(\u65E2\u4E0D\u662F id,\u4E5F\u4E0D\u662F\u4ECE\u4E2D\u5FC3\u4E3B\u9898\u5F00\u59CB\u7684\u8DEF\u5F84)`);
  throw new RefError(
    `\u8DEF\u5F84\u300C${ref2}\u300D\u5339\u914D\u5230 ${hits.length} \u4E2A\u8282\u70B9,\u8BF7\u6539\u7528 id`,
    hits.map((h) => `${h.id}  ${topicPath(doc, h.id)}`)
  );
}
function search(doc, keyword) {
  const k = keyword.toLowerCase();
  const out = [];
  const visit = (t) => walk(t, (x) => {
    const hay = [x.text, x.note ?? "", ...x.labels ?? []].join("\n").toLowerCase();
    if (hay.includes(k)) out.push(x);
  });
  visit(doc.root);
  for (const f of doc.floating ?? []) visit(f);
  return out;
}
function decorate(t, ids) {
  let line = t.text.replace(/\n/g, " / ");
  const marks = (t.markers ?? []).map((m) => `[${m}]`).join("");
  if (marks) line = `${marks} ${line}`;
  if (t.labels?.length) line += "  " + t.labels.map((l) => `#${l}`).join(" ");
  if (t.link) line += `  <${t.link}>`;
  if (t.note) {
    const n = t.note.replace(/\s+/g, " ").trim();
    line += `  (\u5907\u6CE8: ${n.length > 40 ? n.slice(0, 40) + "\u2026" : n})`;
  }
  if (t.collapsed) line += "  [\u6298\u53E0]";
  if (ids) line += `  {${t.id}}`;
  return line;
}
function outline(doc, opts = {}) {
  const lines = [];
  const max = opts.depth ?? Infinity;
  const visit = (t, depth) => {
    lines.push("  ".repeat(depth) + "- " + decorate(t, !!opts.ids));
    for (const s of t.summaries ?? []) {
      lines.push("  ".repeat(depth + 1) + `\xBB \u6982\u62EC(${rangeLabel(doc, s.from, s.to)}): ${s.text ?? ""}${opts.ids ? `  {${s.id}}` : ""}`);
    }
    for (const b of t.boundaries ?? []) {
      lines.push("  ".repeat(depth + 1) + `\u25A2 \u5916\u6846(${rangeLabel(doc, b.from, b.to)})${b.text ? ": " + b.text : ""}${opts.ids ? `  {${b.id}}` : ""}`);
    }
    if (depth + 1 > max) {
      const n = countDescendants(t);
      if (n) lines.push("  ".repeat(depth + 1) + `\u2026 ${n} \u4E2A\u5B50\u5B59\u8282\u70B9`);
      return;
    }
    for (const c of t.children ?? []) visit(c, depth + 1);
  };
  visit(doc.root, 0);
  for (const f of doc.floating ?? []) {
    lines.push("");
    lines.push(`\u81EA\u7531\u4E3B\u9898 @(${f.position?.x ?? 0}, ${f.position?.y ?? 0}):`);
    visit(f, 0);
  }
  if (doc.relationships?.length) {
    lines.push("");
    lines.push("\u8054\u7CFB\u7EBF:");
    for (const r of doc.relationships) {
      const a = getTopic(doc, r.from)?.text ?? `?${r.from}`;
      const b = getTopic(doc, r.to)?.text ?? `?${r.to}`;
      lines.push(`- ${oneLine(a)} \u2192 ${oneLine(b)}${r.text ? `: ${r.text}` : ""}${opts.ids ? `  {${r.id}}` : ""}`);
    }
  }
  return lines.join("\n") + "\n";
}
function oneLine(s) {
  return s.replace(/\n/g, " ");
}
function rangeLabel(doc, from, to) {
  const a = oneLine(getTopic(doc, from)?.text ?? "?");
  if (from === to) return a;
  return `${a} \u2026 ${oneLine(getTopic(doc, to)?.text ?? "?")}`;
}
function countDescendants(t) {
  let n = 0;
  for (const c of t.children ?? []) n += 1 + countDescendants(c);
  return n;
}

// src/core/ops.ts
var OpError = class extends Error {
};
function entry(doc, id) {
  const e = indexDoc(doc).get(id);
  if (!e) throw new OpError(`\u8282\u70B9\u4E0D\u5B58\u5728:${id}`);
  return e;
}
function updateAt(doc, id, fn) {
  const e = entry(doc, id);
  const rebuild = (t, path2) => {
    if (!path2.length) return fn(t);
    const [i, ...rest] = path2;
    return { ...t, children: t.children.map((c, j) => j === i ? rebuild(c, rest) : c) };
  };
  if (e.loc.tree < 0) return { ...doc, root: rebuild(doc.root, e.loc.path) };
  const floating = doc.floating.slice();
  floating[e.loc.tree] = rebuild(floating[e.loc.tree], e.loc.path);
  return { ...doc, floating };
}
function patchObj(obj, patch) {
  const out = { ...obj };
  for (const [k, v] of Object.entries(patch)) {
    if (v === void 0) delete out[k];
    else out[k] = v;
  }
  return out;
}
function newTopic(doc, init = {}) {
  return { ...init, id: genId(allIds(doc)), text: init.text ?? "" };
}
function setText(doc, id, text) {
  return updateAt(doc, id, (t) => ({ ...t, text }));
}
function updateTopic(doc, ids, patch) {
  for (const id of toList(ids)) doc = updateAt(doc, id, (t) => patchObj(t, patch));
  return doc;
}
function setStyle(doc, ids, patch) {
  for (const id of toList(ids)) {
    doc = updateAt(doc, id, (t) => {
      const style = patchObj(t.style ?? {}, patch);
      const out = { ...t, style };
      if (!Object.keys(style).length) delete out.style;
      return out;
    });
  }
  return doc;
}
function clearStyle(doc, ids) {
  return updateTopic(doc, ids, { style: void 0 });
}
function setCollapsed(doc, ids, collapsed) {
  for (const id of toList(ids)) {
    const t = entry(doc, id).topic;
    if (!t.children?.length && collapsed) continue;
    doc = updateTopic(doc, id, { collapsed: collapsed ? true : void 0 });
  }
  return doc;
}
function addMarker(doc, ids, marker) {
  const cat = markerCategory(marker);
  for (const id of toList(ids)) {
    doc = updateAt(doc, id, (t) => {
      const markers = (t.markers ?? []).filter((m) => markerCategory(m) !== cat);
      return { ...t, markers: [...markers, marker] };
    });
  }
  return doc;
}
function removeMarker(doc, ids, marker) {
  for (const id of toList(ids)) {
    doc = updateAt(doc, id, (t) => {
      const markers = (t.markers ?? []).filter((m) => m !== marker);
      const out = { ...t, markers };
      if (!markers.length) delete out.markers;
      return out;
    });
  }
  return doc;
}
function addLabel(doc, ids, label) {
  label = label.trim();
  if (!label) return doc;
  for (const id of toList(ids)) {
    doc = updateAt(doc, id, (t) => t.labels?.includes(label) ? t : { ...t, labels: [...t.labels ?? [], label] });
  }
  return doc;
}
function removeLabel(doc, ids, label) {
  for (const id of toList(ids)) {
    doc = updateAt(doc, id, (t) => {
      const labels = (t.labels ?? []).filter((l) => l !== label);
      const out = { ...t, labels };
      if (!labels.length) delete out.labels;
      return out;
    });
  }
  return doc;
}
function addChild(doc, parentId, init = {}, index) {
  const topic = newTopic(doc, init);
  doc = updateAt(doc, parentId, (p) => {
    const children = (p.children ?? []).slice();
    const at = index === void 0 ? children.length : clamp(index, 0, children.length);
    children.splice(at, 0, topic);
    const out = { ...p, children };
    delete out.collapsed;
    return out;
  });
  return { doc, id: topic.id };
}
function fixRanges(p, oldChildren) {
  const alive = new Set((p.children ?? []).map((c) => c.id));
  const fix = (list) => {
    if (!list) return list;
    const out2 = [];
    for (const r of list) {
      const a = oldChildren.findIndex((c) => c.id === r.from);
      const b2 = oldChildren.findIndex((c) => c.id === r.to);
      if (a < 0 || b2 < 0) {
        out2.push(r);
        continue;
      }
      const span = oldChildren.slice(Math.min(a, b2), Math.max(a, b2) + 1).filter((c) => alive.has(c.id));
      if (!span.length) continue;
      out2.push({ ...r, from: span[0].id, to: span[span.length - 1].id });
    }
    return out2;
  };
  const out = { ...p };
  const s = fix(p.summaries);
  const b = fix(p.boundaries);
  if (s) s.length ? out.summaries = s : delete out.summaries;
  if (b) b.length ? out.boundaries = b : delete out.boundaries;
  if (out.children && !out.children.length) {
    delete out.children;
    delete out.collapsed;
  }
  return out;
}
function remove(doc, ids) {
  const removed = /* @__PURE__ */ new Set();
  for (const id of toList(ids)) {
    const e = indexDoc(doc).get(id);
    if (!e || e.topic.id === doc.root.id) continue;
    for (const x of subtreeIds(e.topic)) removed.add(x);
    if (!e.parent) {
      doc = { ...doc, floating: doc.floating.filter((f) => f.id !== id) };
      if (!doc.floating.length) delete doc.floating;
      continue;
    }
    doc = updateAt(doc, e.parent.id, (p) => fixRanges({ ...p, children: p.children.filter((c) => c.id !== id) }, p.children));
  }
  if (removed.size && doc.relationships) {
    const rels = doc.relationships.filter((r) => !removed.has(r.from) && !removed.has(r.to));
    if (rels.length !== doc.relationships.length) {
      doc = { ...doc, relationships: rels };
      if (!rels.length) delete doc.relationships;
    }
  }
  return doc;
}
function detach(doc, id) {
  const e = entry(doc, id);
  if (e.topic.id === doc.root.id) throw new OpError("\u4E2D\u5FC3\u4E3B\u9898\u4E0D\u80FD\u79FB\u52A8");
  if (!e.parent) {
    const floating = doc.floating.filter((f) => f.id !== id);
    const out = { ...doc, floating };
    if (!floating.length) delete out.floating;
    return { doc: out, topic: e.topic };
  }
  doc = updateAt(doc, e.parent.id, (p) => fixRanges({ ...p, children: p.children.filter((c) => c.id !== id) }, p.children));
  return { doc, topic: e.topic };
}
function move(doc, id, parentId, index) {
  if (isInSubtree(doc, id, parentId)) throw new OpError("\u4E0D\u80FD\u628A\u8282\u70B9\u79FB\u52A8\u5230\u5B83\u81EA\u5DF1\u7684\u5B50\u6811\u91CC");
  const { doc: d, topic } = detach(doc, id);
  const moved = { ...topic };
  delete moved.position;
  return updateAt(d, parentId, (p) => {
    const children = (p.children ?? []).slice();
    const at = index === void 0 ? children.length : clamp(index, 0, children.length);
    children.splice(at, 0, moved);
    const out = { ...p, children };
    delete out.collapsed;
    return out;
  });
}
function addRelationship(doc, from, to, init = {}) {
  entry(doc, from);
  entry(doc, to);
  if (from === to) throw new OpError("\u8054\u7CFB\u7EBF\u7684\u4E24\u7AEF\u4E0D\u80FD\u662F\u540C\u4E00\u4E2A\u8282\u70B9");
  const rel = { ...init, id: genId(allIds(doc)), from, to };
  return { doc: { ...doc, relationships: [...doc.relationships ?? [], rel] }, id: rel.id };
}
function addRange(doc, kind, ids, text) {
  if (!ids.length) return null;
  const entries = ids.map((id) => entry(doc, id));
  const parent = entries[0].parent;
  if (!parent || entries.some((e) => e.parent?.id !== parent.id)) return null;
  const idxs = entries.map((e) => e.index);
  const from = parent.children[Math.min(...idxs)].id;
  const to = parent.children[Math.max(...idxs)].id;
  const range = { id: genId(allIds(doc)), from, to };
  if (text !== void 0) range.text = text;
  doc = updateAt(doc, parent.id, (p) => ({ ...p, [kind]: [...p[kind] ?? [], range] }));
  return { doc, id: range.id };
}
function setDocProp(doc, key, value) {
  const out = { ...doc };
  if (value === void 0) delete out[key];
  else out[key] = value;
  return out;
}
function toList(ids) {
  return typeof ids === "string" ? [ids] : ids;
}
function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

// src/core/markdown.ts
function inline(t) {
  let text = t.text.replace(/\n/g, "<br>");
  if (t.link) text = `[${text}](${t.link})`;
  if (t.markers?.includes("task-100")) text = `[x] ${text}`;
  else if (t.markers?.includes("task-0")) text = `[ ] ${text}`;
  const labels = (t.labels ?? []).map((l) => ` \`#${l}\``).join("");
  return text + labels;
}
function quote(note, indent) {
  return note.split("\n").map((l) => `${indent}> ${l}`.trimEnd());
}
function toMarkdown(doc) {
  const out = [];
  const root = doc.root;
  out.push(`# ${inline(root)}`, "");
  if (root.note) out.push(...quote(root.note, ""), "");
  for (const main2 of root.children ?? []) {
    out.push(`## ${inline(main2)}`, "");
    if (main2.note) out.push(...quote(main2.note, ""), "");
    const visit = (t, depth) => {
      const pad = "  ".repeat(depth);
      out.push(`${pad}- ${inline(t)}`);
      if (t.note) out.push(...quote(t.note, pad + "  "));
      for (const c of t.children ?? []) visit(c, depth + 1);
    };
    for (const c of main2.children ?? []) visit(c, 0);
    if (main2.children?.length) out.push("");
  }
  return out.join("\n").replace(/\n+$/, "") + "\n";
}
function parseInline(raw, used) {
  let text = raw.trim();
  const t = { id: genId(used), text: "" };
  const cb = /^\[( |x|X)\]\s+/.exec(text);
  if (cb) {
    t.markers = [cb[1] === " " ? "task-0" : "task-100"];
    text = text.slice(cb[0].length);
  }
  const labels = [];
  for (; ; ) {
    const m = /\s*`#([^`]+)`\s*$/.exec(text);
    if (!m) break;
    labels.unshift(m[1].trim());
    text = text.slice(0, m.index);
  }
  if (labels.length) t.labels = labels;
  const link = /^\[(.*)\]\(([^)\s]+)\)$/.exec(text);
  if (link) {
    text = link[1];
    t.link = link[2];
  }
  const bold = /^\*\*(.+)\*\*$/.exec(text);
  if (bold) {
    text = bold[1];
    t.style = { bold: true };
  }
  t.text = text.replace(/<br\s*\/?>/gi, "\n");
  return t;
}
function fromMarkdown(md, fallbackTitle = "\u4E2D\u5FC3\u4E3B\u9898") {
  const used = /* @__PURE__ */ new Set();
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  let root = null;
  const stack = [];
  let headingLevel = 1;
  let last = null;
  let inFence = false;
  const listIndents = [];
  const ensureRoot = () => {
    if (!root) {
      root = { id: genId(used), text: fallbackTitle };
      stack.push({ level: 1, topic: root });
    }
    return root;
  };
  const attach = (level, t) => {
    ensureRoot();
    while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
    const parent = stack.length ? stack[stack.length - 1].topic : root;
    (parent.children ??= []).push(t);
    stack.push({ level, topic: t });
    last = t;
  };
  const addNote = (line) => {
    const target = last ?? ensureRoot();
    target.note = target.note === void 0 ? line : `${target.note}
${line}`;
  };
  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      if (last) addNote(line);
      continue;
    }
    if (inFence) {
      addNote(line);
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      listIndents.length = 0;
      const n = h[1].length;
      if (n === 1 && !root) {
        root = parseInline(h[2], used);
        stack.length = 0;
        stack.push({ level: 1, topic: root });
        headingLevel = 1;
        last = root;
        continue;
      }
      const level = Math.max(2, n);
      attach(level, parseInline(h[2], used));
      headingLevel = level;
      continue;
    }
    const li = /^(\s*)(?:[-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (li) {
      const indent = li[1].replace(/\t/g, "    ").length;
      while (listIndents.length && listIndents[listIndents.length - 1] > indent) listIndents.pop();
      if (!listIndents.length || listIndents[listIndents.length - 1] < indent) listIndents.push(indent);
      const depth = listIndents.length - 1;
      attach(headingLevel + 1 + depth, parseInline(li[2], used));
      continue;
    }
    const q = /^\s*>\s?(.*)$/.exec(line);
    if (q) {
      addNote(q[1]);
      continue;
    }
    if (line.trim() && !/^\s*(---|\*\*\*|___)\s*$/.test(line)) addNote(line.trim());
  }
  const r = ensureRoot();
  const tidy = (t) => {
    if (t.note !== void 0) {
      t.note = t.note.replace(/^\n+|\n+$/g, "");
      if (!t.note) delete t.note;
    }
    for (const c of t.children ?? []) tidy(c);
  };
  tidy(r);
  return { version: FORMAT_VERSION, root: r };
}

// src/core/theme.ts
var SANS = `-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", "Segoe UI", sans-serif`;
function lv(base, patch = {}) {
  return { ...base, ...patch };
}
var ROOT = { shape: "rounded", fill: "#1F2D3D", border: "none", borderWidth: 0, textColor: "auto", fontSize: 26, bold: true, lineWidth: 3, padX: 26, padY: 14 };
var MAIN = { shape: "rounded", fill: "branch", border: "none", borderWidth: 0, textColor: "auto", fontSize: 17, bold: false, lineWidth: 2, padX: 16, padY: 9 };
var SUB = { shape: "underline", fill: "none", border: "branch", borderWidth: 2, textColor: "text", fontSize: 14, bold: false, lineWidth: 1.5, padX: 4, padY: 5 };
var FLOAT = { shape: "rounded", fill: "#EEF1F5", border: "none", borderWidth: 0, textColor: "auto", fontSize: 15, bold: false, lineWidth: 1.5, padX: 14, padY: 8 };
var SUMMARY = { shape: "rounded", fill: "none", border: "branch", borderWidth: 1.5, textColor: "text", fontSize: 14, bold: false, lineWidth: 1.5, padX: 12, padY: 6 };
function palette(p) {
  return {
    fontFamily: SANS,
    lineStyle: "curve",
    relationship: "#8A94A6",
    root: ROOT,
    main: MAIN,
    sub: SUB,
    floating: FLOAT,
    summary: SUMMARY,
    ...p
  };
}
var CLASSIC_RAINBOW = ["#F0604D", "#F5A623", "#3DB47A", "#2F9BEA", "#7C63F2", "#E3578F"];
var FRESH_RAINBOW = ["#3FB68E", "#4BAEE3", "#F0B43C", "#EE8070", "#9A86E8", "#4EC0C8"];
var BUSINESS_RAINBOW = ["#1F5FAD", "#2E7DD1", "#1E8C9E", "#4A6FA5", "#2C6E8F", "#5B7DB8"];
var NIGHT_RAINBOW = ["#FF5C8A", "#FFB547", "#3DDC97", "#38BDF8", "#A78BFA", "#F472B6"];
var EXCALI_RAINBOW = ["#e03131", "#1971c2", "#2f9e44", "#f08c00", "#6741d9", "#0c8599", "#c2255c", "#099268"];
var EXCALI_RAINBOW_DARK = ["#ff8787", "#74c0fc", "#8ce99a", "#ffd43b", "#b197fc", "#66d9e8", "#f783ac", "#63e6be"];
var HAND_FONT = `"WM Excalifont", "WM Xiaolai", ${SANS}`;
var THEMES = [
  {
    id: "classic",
    zh: "\u7ECF\u5178",
    en: "Classic",
    light: palette({ background: "#FAFBFC", text: "#2B2F36", rainbow: CLASSIC_RAINBOW }),
    dark: palette({
      background: "#1E1F22",
      text: "#E3E5E8",
      rainbow: CLASSIC_RAINBOW,
      relationship: "#8C96A8",
      root: lv(ROOT, { fill: "#F2F3F5" }),
      floating: lv(FLOAT, { fill: "#2E3036" })
    })
  },
  {
    id: "fresh",
    zh: "\u6E05\u65B0",
    en: "Fresh",
    light: palette({
      background: "#F4FBF8",
      text: "#24413A",
      rainbow: FRESH_RAINBOW,
      relationship: "#7FA89B",
      root: lv(ROOT, { fill: "#2E8B6E", shape: "capsule" }),
      main: lv(MAIN, { shape: "capsule" }),
      floating: lv(FLOAT, { fill: "#E3F3EC", shape: "capsule" })
    }),
    dark: palette({
      background: "#14201C",
      text: "#D5EBE3",
      rainbow: FRESH_RAINBOW,
      relationship: "#6F9A8C",
      root: lv(ROOT, { fill: "#43B892", shape: "capsule" }),
      main: lv(MAIN, { shape: "capsule" }),
      floating: lv(FLOAT, { fill: "#22332D", shape: "capsule" })
    })
  },
  {
    id: "business",
    zh: "\u5546\u52A1",
    en: "Business",
    light: palette({
      background: "#F3F5F8",
      text: "#1E2A3A",
      rainbow: BUSINESS_RAINBOW,
      lineStyle: "elbow",
      relationship: "#6B7A90",
      root: lv(ROOT, { shape: "rect", fill: "#0F2A4A" }),
      main: lv(MAIN, { shape: "rect" }),
      sub: lv(SUB, { shape: "rect", fill: "#FFFFFF", borderWidth: 1, padX: 10, padY: 5 }),
      floating: lv(FLOAT, { shape: "rect", fill: "#E4E9F0" }),
      summary: lv(SUMMARY, { shape: "rect" })
    }),
    dark: palette({
      background: "#121821",
      text: "#DCE4EE",
      rainbow: BUSINESS_RAINBOW,
      lineStyle: "elbow",
      relationship: "#7D8BA0",
      root: lv(ROOT, { shape: "rect", fill: "#D9E4F2" }),
      main: lv(MAIN, { shape: "rect" }),
      sub: lv(SUB, { shape: "rect", fill: "#1B2431", borderWidth: 1, padX: 10, padY: 5 }),
      floating: lv(FLOAT, { shape: "rect", fill: "#222C3A" }),
      summary: lv(SUMMARY, { shape: "rect" })
    })
  },
  {
    id: "night",
    zh: "\u6697\u591C",
    en: "Night",
    light: palette({
      background: "#1B2036",
      text: "#D7DBEA",
      rainbow: NIGHT_RAINBOW,
      relationship: "#8F97B8",
      root: lv(ROOT, { fill: "none", border: "#38BDF8", borderWidth: 2.5, textColor: "#FFFFFF" }),
      main: lv(MAIN, { fill: "none", border: "branch", borderWidth: 2, textColor: "branch" }),
      floating: lv(FLOAT, { fill: "#272D48" })
    }),
    dark: palette({
      background: "#0F1220",
      text: "#D7DBEA",
      rainbow: NIGHT_RAINBOW,
      relationship: "#8F97B8",
      root: lv(ROOT, { fill: "none", border: "#38BDF8", borderWidth: 2.5, textColor: "#FFFFFF" }),
      main: lv(MAIN, { fill: "none", border: "branch", borderWidth: 2, textColor: "branch" }),
      floating: lv(FLOAT, { fill: "#1C2138" })
    })
  },
  {
    id: "sketch",
    zh: "Excalidraw",
    en: "Excalidraw",
    light: palette({
      background: "#ffffff",
      text: "#1e1e1e",
      rainbow: EXCALI_RAINBOW,
      relationship: "#1e1e1e",
      root: lv(ROOT, { fill: "#ffec99", border: "#1e1e1e", borderWidth: 2, textColor: "#1e1e1e" }),
      main: lv(MAIN, { fill: "tint", border: "branch", borderWidth: 2, textColor: "#1e1e1e" }),
      floating: lv(FLOAT, { fill: "#e9ecef", border: "#1e1e1e", borderWidth: 2, textColor: "#1e1e1e" })
    }),
    dark: palette({
      background: "#121212",
      text: "#e9ecef",
      rainbow: EXCALI_RAINBOW_DARK,
      relationship: "#ced4da",
      root: lv(ROOT, { fill: "#5c4a12", border: "#e9ecef", borderWidth: 2, textColor: "#e9ecef" }),
      main: lv(MAIN, { fill: "tint", border: "branch", borderWidth: 2, textColor: "#e9ecef" }),
      floating: lv(FLOAT, { fill: "#2b2b2b", border: "#ced4da", borderWidth: 2, textColor: "#e9ecef" })
    })
  },
  {
    id: "mono",
    zh: "\u9ED1\u767D",
    en: "Mono",
    light: palette({
      background: "#FFFFFF",
      text: "#111111",
      rainbow: ["#333333"],
      lineStyle: "straight",
      relationship: "#666666",
      root: lv(ROOT, { shape: "rect", fill: "#111111" }),
      main: lv(MAIN, { fill: "#FFFFFF", border: "#111111", borderWidth: 1.5, textColor: "#111111" }),
      sub: lv(SUB, { border: "#555555" }),
      floating: lv(FLOAT, { fill: "#FFFFFF", border: "#111111", borderWidth: 1 })
    }),
    dark: palette({
      background: "#111111",
      text: "#E8E8E8",
      rainbow: ["#BBBBBB"],
      lineStyle: "straight",
      relationship: "#999999",
      root: lv(ROOT, { shape: "rect", fill: "#EEEEEE" }),
      main: lv(MAIN, { fill: "#111111", border: "#EEEEEE", borderWidth: 1.5, textColor: "#EEEEEE" }),
      sub: lv(SUB, { border: "#AAAAAA" }),
      floating: lv(FLOAT, { fill: "#111111", border: "#EEEEEE", borderWidth: 1 })
    })
  }
];

// src/cli/wm.ts
var HELP = `wm \u2014 \u8BFB\u5199 .wmind \u601D\u7EF4\u5BFC\u56FE(\u7EAF JSON)

\u8BFB\u53D6
  wm outline  <file> [--ids] [--depth N] [--json]   \u7F29\u8FDB\u5927\u7EB2(\u542B\u6807\u8BB0/\u6807\u7B7E/\u5907\u6CE8\u6458\u8981)
  wm find     <file> <\u5173\u952E\u8BCD>                         \u5339\u914D\u8282\u70B9\u7684 id \u4E0E\u8DEF\u5F84
  wm to-md    <file>                                  \u5BFC\u51FA Markdown \u5927\u7EB2
  wm validate <file>                                  \u6821\u9A8C,\u6709\u95EE\u9898\u65F6\u9000\u51FA\u7801\u4E3A 1

\u4FEE\u6539(<ref> \u53EF\u4EE5\u662F\u8282\u70B9 id,\u4E5F\u53EF\u4EE5\u662F\u4ECE\u4E2D\u5FC3\u4E3B\u9898\u5F00\u59CB\u7684\u8DEF\u5F84,\u5982 "\u4EA7\u54C1\u89C4\u5212/\u7528\u6237\u8C03\u7814")
  wm new      <file> <\u4E2D\u5FC3\u4E3B\u9898>                        \u65B0\u5EFA\u5BFC\u56FE
  wm add      <file> --parent <ref> <\u6587\u672C>... [--index N]   \u6DFB\u52A0\u5B50\u8282\u70B9,\u6253\u5370\u65B0 id;\u6587\u672C\u91CC \\n \u8868\u793A\u6362\u884C
  wm set      <file> <ref> [--text T] [--style k=v]... [--marker m]... [--label l]...
                           [--note T] [--link URL] [--collapsed true|false] [--structure logic|org|tree]
  wm unset    <file> <ref> [--style k]... [--marker m]... [--label l]... [--note] [--link] [--structure] [--all-style]
  wm move     <file> <ref> --parent <ref> [--index N]
  wm rm       <file> <ref>...
  wm rel      <file> <from-ref> <to-ref> [--text T]     \u6DFB\u52A0\u8054\u7CFB\u7EBF
  wm summary  <file> <ref>... [--text T]                \u7ED9\u540C\u4E00\u7236\u8282\u70B9\u4E0B\u7684\u51E0\u4E2A\u5144\u5F1F\u52A0\u6982\u62EC
  wm boundary <file> <ref>... [--text T]                \u7ED9\u540C\u4E00\u7236\u8282\u70B9\u4E0B\u7684\u51E0\u4E2A\u5144\u5F1F\u52A0\u5916\u6846
  wm doc      <file> [--theme \u540D\u79F0] [--look standard|hand] [--fill hachure|cross-hatch|solid|dots|dashed|zigzag|none] [--structure map|logic|org|tree]
  wm from-md  <md \u6587\u4EF6> -o <file> [--title \u4E2D\u5FC3\u4E3B\u9898]    Markdown \u5927\u7EB2 \u2192 \u5BFC\u56FE

\u6837\u5F0F\u952E:shape fill border borderWidth textColor fontSize bold italic strike lineColor lineWidth lineStyle fillStyle textAlign
\u4E3B\u9898:${THEMES.map((t) => t.id).join(" ")}
\u6807\u8BB0:priority-1..9  task-0/25/50/75/100  flag-<\u8272>  star-<\u8272>  smiley-happy/laugh/sad/angry/surprised
      symbol-question/exclamation/check/cross/idea   (\u8272:red orange yellow green blue purple)`;
var UsageError = class extends Error {
};
var BOOL_FLAGS = /* @__PURE__ */ new Set(["ids", "json", "note", "link", "structure", "all-style"]);
function parseArgs(argv, boolFlags = BOOL_FLAGS) {
  const pos = [];
  const flags = /* @__PURE__ */ new Map();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      let key = a.slice(2);
      let val;
      if (eq > 0) {
        key = a.slice(2, eq);
        val = a.slice(eq + 1);
      } else if (boolFlags.has(key) && (i + 1 >= argv.length || argv[i + 1].startsWith("--"))) {
        val = "";
      } else {
        if (i + 1 >= argv.length) throw new UsageError(`--${key} \u7F3A\u5C11\u503C`);
        val = argv[++i];
      }
      if (!flags.has(key)) flags.set(key, []);
      flags.get(key).push(val);
    } else if (a === "-o") {
      if (i + 1 >= argv.length) throw new UsageError("-o \u7F3A\u5C11\u503C");
      flags.set("o", [argv[++i]]);
    } else pos.push(a);
  }
  return { pos, flags };
}
var one = (a, k) => a.flags.get(k)?.[a.flags.get(k).length - 1];
var many = (a, k) => a.flags.get(k) ?? [];
var unescape = (s) => s.replace(/\\n/g, "\n");
function load(file) {
  if (!fs.existsSync(file)) throw new UsageError(`\u6587\u4EF6\u4E0D\u5B58\u5728:${file}`);
  const r = parse(fs.readFileSync(file, "utf8"));
  if (!r.doc) throw new Error(`${file} \u4E0D\u662F\u5408\u6CD5 JSON(\u7B2C ${r.error.line} \u884C\u7B2C ${r.error.column} \u5217):${r.error.message}`);
  if (r.readOnly) throw new Error(r.issues[0].message);
  return r.doc;
}
function save(file, doc) {
  fs.writeFileSync(file, serialize(doc), "utf8");
}
function parseValue(v) {
  if (v === "true") return true;
  if (v === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return v;
}
function parseStyle(pairs) {
  const style = {};
  for (const p of pairs) {
    const i = p.indexOf("=");
    if (i <= 0) throw new UsageError(`--style \u9700\u8981 k=v \u5F62\u5F0F:${p}`);
    const k = p.slice(0, i).trim();
    let v = parseValue(p.slice(i + 1).trim());
    if (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v)) v = v.toUpperCase();
    if (!styleValueOk(k, v)) throw new UsageError(`\u6837\u5F0F\u503C\u975E\u6CD5:${k}=${p.slice(i + 1)}`);
    style[k] = v;
  }
  return style;
}
function checkMarker(m) {
  if (!markerDef(m)) throw new UsageError(`\u672A\u77E5\u6807\u8BB0:${m}(\u8FD0\u884C wm help \u67E5\u770B\u53EF\u7528\u6807\u8BB0)`);
}
function ref(doc, r, what = "\u8282\u70B9") {
  if (!r) throw new UsageError(`\u7F3A\u5C11${what}`);
  return resolveRef(doc, r);
}
function jsonTree(t) {
  const o = { id: t.id, text: t.text };
  if (t.markers) o.markers = t.markers;
  if (t.labels) o.labels = t.labels;
  if (t.note) o.note = t.note;
  if (t.link) o.link = t.link;
  if (t.children?.length) o.children = t.children.map(jsonTree);
  return o;
}
function run(argv) {
  const [cmd, ...rest] = argv;
  const out = (s) => process.stdout.write(s.endsWith("\n") ? s : s + "\n");
  if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") {
    out(HELP);
    return 0;
  }
  const a = parseArgs(rest);
  const file = a.pos[0];
  if (!file && cmd !== "help") throw new UsageError("\u7F3A\u5C11\u6587\u4EF6\u53C2\u6570");
  switch (cmd) {
    case "outline": {
      const doc = load(file);
      if (a.flags.has("json")) out(JSON.stringify(jsonTree(doc.root), null, 2));
      else {
        const depth = one(a, "depth");
        out(outline(doc, { ids: a.flags.has("ids"), depth: depth === void 0 ? void 0 : Number(depth) }));
      }
      return 0;
    }
    case "find": {
      const doc = load(file);
      const kw = a.pos.slice(1).join(" ");
      if (!kw) throw new UsageError("\u7F3A\u5C11\u5173\u952E\u8BCD");
      const hits = search(doc, kw);
      for (const h of hits) out(`${h.id}  ${topicPath(doc, h.id)}`);
      if (!hits.length) out("(\u6CA1\u6709\u5339\u914D\u7684\u8282\u70B9)");
      return 0;
    }
    case "to-md":
      out(toMarkdown(load(file)));
      return 0;
    case "validate": {
      const text = fs.readFileSync(file, "utf8");
      const r = parse(text);
      if (!r.doc) {
        out(`\u2717 JSON \u8BED\u6CD5\u9519\u8BEF(\u7B2C ${r.error.line} \u884C\u7B2C ${r.error.column} \u5217):${r.error.message}`);
        return 1;
      }
      const issues = r.issues;
      if (r.changed) issues.push({ level: "warn", message: "\u6709\u8282\u70B9\u7F3A\u5C11 id \u6216 id \u91CD\u590D,\u63D2\u4EF6\u6253\u5F00\u6216\u4E0B\u6B21\u7528 wm \u4FEE\u6539\u65F6\u4F1A\u81EA\u52A8\u8865\u5168" });
      if (!issues.length) {
        out("\u2713 \u6CA1\u6709\u95EE\u9898");
        return 0;
      }
      for (const i of issues) out(`${i.level === "error" ? "\u2717" : "!"} ${i.message}`);
      return 1;
    }
    case "new": {
      if (fs.existsSync(file)) throw new UsageError(`\u6587\u4EF6\u5DF2\u5B58\u5728:${file}`);
      const title = a.pos.slice(1).join(" ") || path.basename(file, ".wmind");
      const doc = newDoc(unescape(title));
      save(file, doc);
      out(doc.root.id);
      return 0;
    }
    case "add": {
      let doc = load(file);
      const parent = ref(doc, one(a, "parent"), "--parent");
      const texts = a.pos.slice(1);
      if (!texts.length) throw new UsageError("\u7F3A\u5C11\u8282\u70B9\u6587\u672C");
      const idxFlag = one(a, "index");
      let index = idxFlag === void 0 ? void 0 : Number(idxFlag);
      const ids = [];
      for (const text of texts) {
        const r = addChild(doc, parent.id, { text: unescape(text) }, index);
        doc = r.doc;
        ids.push(r.id);
        if (index !== void 0) index++;
      }
      save(file, doc);
      out(ids.join("\n"));
      return 0;
    }
    case "set": {
      let doc = load(file);
      const t = ref(doc, a.pos[1]);
      const text = one(a, "text");
      if (text !== void 0) doc = setText(doc, t.id, unescape(text));
      const style = many(a, "style");
      if (style.length) doc = setStyle(doc, t.id, parseStyle(style));
      for (const m of many(a, "marker")) {
        checkMarker(m);
        doc = addMarker(doc, t.id, m);
      }
      for (const l of many(a, "label")) doc = addLabel(doc, t.id, l);
      const note = one(a, "note");
      if (note !== void 0) doc = updateTopic(doc, t.id, { note: note ? unescape(note) : void 0 });
      const link = one(a, "link");
      if (link !== void 0) doc = updateTopic(doc, t.id, { link: link || void 0 });
      const col = one(a, "collapsed");
      if (col !== void 0) doc = setCollapsed(doc, t.id, col === "true");
      const look = one(a, "look");
      if (look !== void 0) {
        if (!LOOKS.includes(look)) throw new UsageError(`\u672A\u77E5\u753B\u6CD5:${look}`);
        doc = setDocProp(doc, "look", look);
      }
      const st = one(a, "structure");
      if (st !== void 0) {
        if (st && !STRUCTURES.includes(st)) throw new UsageError(`\u672A\u77E5\u7ED3\u6784:${st}`);
        doc = updateTopic(doc, t.id, { structure: st || void 0 });
      }
      save(file, doc);
      out(`\u2713 ${topicPath(doc, t.id)}`);
      return 0;
    }
    case "unset": {
      let doc = load(file);
      const t = ref(doc, a.pos[1]);
      if (a.flags.has("all-style")) doc = clearStyle(doc, t.id);
      const keys = many(a, "style");
      if (keys.length) doc = setStyle(doc, t.id, Object.fromEntries(keys.map((k) => [k, void 0])));
      for (const m of many(a, "marker")) doc = removeMarker(doc, t.id, m);
      for (const l of many(a, "label")) doc = removeLabel(doc, t.id, l);
      if (a.flags.has("note")) doc = updateTopic(doc, t.id, { note: void 0 });
      if (a.flags.has("link")) doc = updateTopic(doc, t.id, { link: void 0 });
      if (a.flags.has("structure")) doc = updateTopic(doc, t.id, { structure: void 0 });
      save(file, doc);
      out(`\u2713 ${topicPath(doc, t.id)}`);
      return 0;
    }
    case "move": {
      let doc = load(file);
      const t = ref(doc, a.pos[1]);
      const parent = ref(doc, one(a, "parent"), "--parent");
      const idx = one(a, "index");
      doc = move(doc, t.id, parent.id, idx === void 0 ? void 0 : Number(idx));
      save(file, doc);
      out(`\u2713 ${topicPath(doc, t.id)}`);
      return 0;
    }
    case "rm": {
      let doc = load(file);
      const targets = a.pos.slice(1).map((r) => ref(doc, r));
      if (!targets.length) throw new UsageError("\u7F3A\u5C11\u8981\u5220\u9664\u7684\u8282\u70B9");
      if (targets.some((t) => t.id === doc.root.id)) throw new UsageError("\u4E2D\u5FC3\u4E3B\u9898\u4E0D\u80FD\u5220\u9664");
      const paths = targets.map((t) => topicPath(doc, t.id));
      doc = remove(
        doc,
        targets.map((t) => t.id)
      );
      save(file, doc);
      for (const p of paths) out(`\u2713 \u5DF2\u5220\u9664 ${p}`);
      return 0;
    }
    case "rel": {
      let doc = load(file);
      const from = ref(doc, a.pos[1], "\u8D77\u70B9");
      const to = ref(doc, a.pos[2], "\u7EC8\u70B9");
      const text = one(a, "text");
      const r = addRelationship(doc, from.id, to.id, text ? { text: unescape(text) } : {});
      save(file, r.doc);
      out(r.id);
      return 0;
    }
    case "summary":
    case "boundary": {
      const doc = load(file);
      const ids = a.pos.slice(1).map((r2) => ref(doc, r2).id);
      const r = addRange(doc, cmd === "summary" ? "summaries" : "boundaries", ids, one(a, "text") ?? (cmd === "summary" ? "\u6982\u62EC" : void 0));
      if (!r) throw new UsageError("\u8FD9\u4E9B\u8282\u70B9\u5FC5\u987B\u662F\u540C\u4E00\u4E2A\u7236\u8282\u70B9\u4E0B\u7684\u5144\u5F1F\u8282\u70B9");
      save(file, r.doc);
      out(r.id);
      return 0;
    }
    case "doc": {
      let doc = load(file);
      const theme = one(a, "theme");
      if (theme !== void 0) {
        if (!THEMES.some((t) => t.id === theme)) throw new UsageError(`\u672A\u77E5\u4E3B\u9898:${theme}`);
        doc = setDocProp(doc, "theme", theme);
      }
      const look = one(a, "look");
      if (look !== void 0) {
        if (!LOOKS.includes(look)) throw new UsageError(`\u672A\u77E5\u753B\u6CD5:${look}`);
        doc = setDocProp(doc, "look", look);
      }
      const fill = one(a, "fill");
      if (fill !== void 0) {
        if (!FILL_STYLES.includes(fill)) throw new UsageError(`\u672A\u77E5\u586B\u5145\u6837\u5F0F:${fill}`);
        doc = setDocProp(doc, "fillStyle", fill);
      }
      const st = one(a, "structure");
      if (st !== void 0) {
        if (!STRUCTURES.includes(st)) throw new UsageError(`\u672A\u77E5\u7ED3\u6784:${st}`);
        doc = setDocProp(doc, "structure", st);
      }
      save(file, doc);
      out("\u2713");
      return 0;
    }
    case "from-md": {
      const target = one(a, "o");
      if (!target) throw new UsageError("\u7F3A\u5C11 -o <\u8F93\u51FA\u6587\u4EF6>");
      const md = fs.readFileSync(file, "utf8");
      const title = one(a, "title") ?? path.basename(file).replace(/\.(md|markdown)$/i, "");
      const doc = fromMarkdown(md, title);
      save(target, doc);
      out(`\u2713 \u5DF2\u751F\u6210 ${target}`);
      return 0;
    }
    default:
      throw new UsageError(`\u672A\u77E5\u547D\u4EE4:${cmd}`);
  }
}
function main() {
  try {
    process.exitCode = run(process.argv.slice(2));
  } catch (err) {
    if (err instanceof RefError) {
      process.stderr.write(`\u2717 ${err.message}
`);
      for (const c of err.candidates) process.stderr.write(`  ${c}
`);
      process.exitCode = 1;
    } else if (err instanceof UsageError) {
      process.stderr.write(`\u2717 ${err.message}
  \u8FD0\u884C wm help \u67E5\u770B\u7528\u6CD5
`);
      process.exitCode = 2;
    } else {
      process.stderr.write(`\u2717 ${err.message}
`);
      process.exitCode = 1;
    }
  }
}
main();
