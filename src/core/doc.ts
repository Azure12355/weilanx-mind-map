// .wmind 文档的解析(容错 + 补 id)、序列化(固定键序、省略默认值)与校验
import { genId } from "./id";
import { markerDef } from "./markers";
import {
  DEFAULT_STRUCTURE,
  DEFAULT_THEME,
  FORMAT_VERSION,
  Issue,
  LINE_STYLES,
  MindDoc,
  Range,
  Relationship,
  SHAPES,
  STRUCTURES,
  Style,
  Topic,
} from "./types";

export interface ParseError {
  message: string;
  line: number;
  column: number;
}

export interface ParseResult {
  /** 语法错误时为 null */
  doc: MindDoc | null;
  error?: ParseError;
  issues: Issue[];
  /** 规范化改动了内容(补 id、修重复 id 等),下次写回时落盘 */
  changed: boolean;
  /** 文件版本比插件新:只读打开 */
  readOnly: boolean;
  /** 空文件:生成了最小文档,但不主动写回 */
  empty: boolean;
}

export function newDoc(rootText = "中心主题"): MindDoc {
  return { version: FORMAT_VERSION, root: { id: genId(new Set()), text: rootText } };
}

// ---------- 解析 ----------

export function parse(text: string): ParseResult {
  if (!text.trim()) {
    return { doc: newDoc(), issues: [], changed: false, readOnly: false, empty: true };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    return { doc: null, error: locateError(text, (err as Error).message), issues: [], changed: false, readOnly: false, empty: false };
  }
  const issues: Issue[] = [];
  const state: NormState = { taken: new Set(), avoid: new Set(), changed: false, issues };
  if (!isObj(raw)) {
    issues.push({ level: "error", message: "文件顶层不是 JSON 对象,已按空文档打开" });
    return { doc: newDoc(), issues, changed: true, readOnly: false, empty: false };
  }
  const doc = normalizeDoc(raw, state);
  issues.push(...validate(doc));
  const readOnly = doc.version > FORMAT_VERSION;
  if (readOnly) {
    issues.unshift({ level: "error", message: `文件格式版本 ${doc.version} 高于插件支持的版本 ${FORMAT_VERSION},已只读打开,请升级插件` });
  }
  return { doc, issues, changed: state.changed, readOnly, empty: false };
}

/** 从 JSON.parse 的报错里提取行列号 */
function locateError(text: string, message: string): ParseError {
  const lc = /line (\d+) column (\d+)/.exec(message);
  if (lc) return { message, line: Number(lc[1]), column: Number(lc[2]) };
  const pos = /position (\d+)/.exec(message);
  let offset = pos ? Number(pos[1]) : text.length;
  offset = Math.min(offset, text.length);
  const before = text.slice(0, offset).split("\n");
  return { message, line: before.length, column: before[before.length - 1].length + 1 };
}

interface NormState {
  /** 已分配出去的 id,用来判重 */
  taken: Set<string>;
  /** 生成新 id 时要避开的 id:文件里出现过的所有 id + 已分配的 id */
  avoid: Set<string>;
  changed: boolean;
  issues: Issue[];
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** 取用已有 id;缺失或重复时生成新 id */
function takeId(v: unknown, st: NormState, what: string): string {
  if (typeof v === "string" && v.trim() && !st.taken.has(v)) {
    st.taken.add(v);
    st.avoid.add(v);
    return v;
  }
  st.changed = true;
  const id = genId(st.avoid);
  st.taken.add(id);
  if (typeof v === "string" && v.trim()) {
    st.issues.push({ level: "warn", message: `${what}的 id「${v}」重复,已重新生成为「${id}」`, id });
  }
  return id;
}

/** 先收集所有合法且不重复的 id,保证生成的新 id 不和后面出现的已有 id 撞车 */
function collectIds(raw: unknown, out: Set<string>) {
  if (Array.isArray(raw)) {
    for (const x of raw) collectIds(x, out);
  } else if (isObj(raw)) {
    for (const [k, v] of Object.entries(raw)) {
      if (k === "id" && typeof v === "string") out.add(v);
      else if (typeof v === "object") collectIds(v, out);
    }
  }
}

function normalizeDoc(raw: Record<string, unknown>, ctx: NormState): MindDoc {
  collectIds(raw, ctx.avoid);
  const out: MindDoc = { ...raw } as MindDoc;
  if (typeof raw.version !== "number") {
    out.version = FORMAT_VERSION;
    ctx.changed = true;
  }
  if (raw.theme !== undefined && typeof raw.theme !== "string") {
    delete out.theme;
    ctx.changed = true;
  }
  if (raw.structure !== undefined && !STRUCTURES.includes(raw.structure as never)) {
    ctx.issues.push({ level: "warn", message: `未知结构「${String(raw.structure)}」,按 ${DEFAULT_STRUCTURE} 显示` });
  }
  if (isObj(raw.root)) {
    out.root = normalizeTopic(raw.root, ctx);
  } else {
    out.root = { id: takeId(undefined, ctx, "中心主题"), text: typeof raw.root === "string" ? raw.root : "中心主题" };
    ctx.changed = true;
    if (raw.root !== undefined) ctx.issues.push({ level: "warn", message: "root 不是对象,已重建中心主题" });
  }
  if (raw.floating !== undefined) {
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
      out.floating!.push(topic);
    });
  }
  if (raw.relationships !== undefined) {
    const list = Array.isArray(raw.relationships) ? raw.relationships : [];
    out.relationships = [];
    for (const r of list) {
      if (!isObj(r)) {
        ctx.changed = true;
        continue;
      }
      const rel = { ...r } as Relationship;
      rel.id = takeId(r.id, ctx, "联系线");
      rel.from = String(r.from ?? "");
      rel.to = String(r.to ?? "");
      if (r.text !== undefined && typeof r.text !== "string") rel.text = String(r.text);
      out.relationships.push(rel);
    }
  }
  return out;
}

function toTopicObj(v: unknown, st: NormState): Record<string, unknown> | null {
  if (isObj(v)) return v;
  if (typeof v === "string" || typeof v === "number") {
    st.changed = true;
    return { text: String(v) };
  }
  st.changed = true;
  return null;
}

function isPoint(p: unknown): p is { x: number; y: number } {
  return isObj(p) && typeof p.x === "number" && typeof p.y === "number";
}

function normalizeTopic(raw: Record<string, unknown>, st: NormState): Topic {
  const t = { ...raw } as Topic;
  t.id = takeId(raw.id, st, "节点");
  if (typeof raw.text !== "string") {
    t.text = raw.text === undefined || raw.text === null ? "" : String(raw.text);
    st.changed = true;
  }
  if (raw.collapsed !== undefined && raw.collapsed !== true) {
    delete t.collapsed;
    if (raw.collapsed !== false) st.changed = true;
  }
  for (const key of ["markers", "labels"] as const) {
    const v = raw[key];
    if (v === undefined) continue;
    if (!Array.isArray(v)) {
      t[key] = typeof v === "string" ? [v] : [];
      st.changed = true;
    } else if (v.some((x) => typeof x !== "string")) {
      t[key] = v.filter((x) => typeof x === "string" || typeof x === "number").map(String);
      st.changed = true;
    }
  }
  for (const key of ["note", "link"] as const) {
    const v = raw[key];
    if (v !== undefined && typeof v !== "string") {
      t[key] = v === null ? undefined : String(v);
      st.changed = true;
    }
  }
  if (raw.style !== undefined && !isObj(raw.style)) {
    delete t.style;
    st.changed = true;
  }
  if (raw.children !== undefined) {
    const list = Array.isArray(raw.children) ? raw.children : [];
    const children: Topic[] = [];
    for (const c of list) {
      const obj = toTopicObj(c, st);
      if (obj) children.push(normalizeTopic(obj, st));
    }
    t.children = children;
    if (!Array.isArray(raw.children)) st.changed = true;
  }
  for (const key of ["summaries", "boundaries"] as const) {
    const v = raw[key];
    if (v === undefined) continue;
    const list = Array.isArray(v) ? v : [];
    t[key] = list.filter(isObj).map((r) => {
      const range = { ...r } as Range;
      range.id = takeId(r.id, st, key === "summaries" ? "概括" : "外框");
      range.from = String(r.from ?? "");
      range.to = String(r.to ?? range.from);
      if (r.text !== undefined && typeof r.text !== "string") range.text = String(r.text);
      return range;
    });
    if (list.length !== t[key]!.length || !Array.isArray(v)) st.changed = true;
  }
  return t;
}

// ---------- 校验 ----------

const HEX = /^#[0-9a-fA-F]{6}$/;

/** 返回样式里非法的键 */
export function badStyleKeys(style: Style | undefined, forRelationship = false): string[] {
  if (!style) return [];
  const bad: string[] = [];
  for (const [k, v] of Object.entries(style)) {
    if (!styleValueOk(k, v, forRelationship)) bad.push(k);
  }
  return bad;
}

export function styleValueOk(key: string, v: unknown, forRelationship = false): boolean {
  switch (key) {
    case "fill":
    case "border":
      return v === "none" || (typeof v === "string" && HEX.test(v));
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
      return SHAPES.includes(v as never);
    case "bold":
    case "italic":
    case "strike":
      return typeof v === "boolean";
    case "lineStyle":
      return LINE_STYLES.includes(v as never) || (forRelationship && (v === "dashed" || v === "solid"));
    default:
      return true; // 未知键原样保留,不算错
  }
}

/** 只保留合法的样式键,渲染时使用 */
export function cleanStyle(style: Style | undefined, forRelationship = false): Style {
  const out: Style = {};
  if (!style) return out;
  for (const [k, v] of Object.entries(style)) if (styleValueOk(k, v, forRelationship)) out[k] = v;
  return out;
}

/** 语义校验:悬空引用、非法范围、非法样式、未知标记 */
export function validate(doc: MindDoc): Issue[] {
  const issues: Issue[] = [];
  const ids = new Set<string>();
  const visit = (t: Topic) => {
    ids.add(t.id);
    const bad = badStyleKeys(t.style);
    if (bad.length) issues.push({ level: "warn", message: `节点「${short(t.text)}」的样式值非法:${bad.join(", ")},已按主题默认显示`, id: t.id });
    for (const m of t.markers ?? []) {
      if (!markerDef(m)) issues.push({ level: "warn", message: `节点「${short(t.text)}」有未知标记「${m}」`, id: t.id });
    }
    if (t.structure !== undefined && !STRUCTURES.includes(t.structure)) {
      issues.push({ level: "warn", message: `节点「${short(t.text)}」的结构「${String(t.structure)}」未知,已忽略`, id: t.id });
    }
    const childIds = new Set((t.children ?? []).map((c) => c.id));
    for (const key of ["summaries", "boundaries"] as const) {
      for (const r of t[key] ?? []) {
        ids.add(r.id);
        if (!childIds.has(r.from) || !childIds.has(r.to)) {
          const what = key === "summaries" ? "概括" : "外框";
          issues.push({ level: "warn", message: `节点「${short(t.text)}」的${what}「${r.id}」引用的子节点不存在,暂不显示`, id: r.id });
        }
      }
    }
    for (const c of t.children ?? []) visit(c);
  };
  visit(doc.root);
  for (const f of doc.floating ?? []) visit(f);
  for (const r of doc.relationships ?? []) {
    if (!ids.has(r.from) || !ids.has(r.to)) {
      issues.push({ level: "warn", message: `联系线「${r.id}」的端点不存在(${r.from} → ${r.to}),暂不显示`, id: r.id });
    }
    const bad = badStyleKeys(r.style, true);
    if (bad.length) issues.push({ level: "warn", message: `联系线「${r.id}」的样式值非法:${bad.join(", ")}`, id: r.id });
  }
  return issues;
}

function short(s: string): string {
  const one = s.replace(/\n/g, " ");
  return one.length > 20 ? one.slice(0, 20) + "…" : one;
}

// ---------- 序列化 ----------

const DOC_KEYS = ["$schema", "version", "theme", "structure", "root", "relationships", "floating"];
const TOPIC_KEYS = ["id", "text", "collapsed", "structure", "position", "style", "markers", "labels", "note", "link", "summaries", "boundaries", "children"];
const REF_KEYS = ["id", "from", "to", "text", "controls", "style"];
const STYLE_KEYS = ["shape", "fill", "border", "borderWidth", "textColor", "fontSize", "bold", "italic", "strike", "lineColor", "lineWidth", "lineStyle"];

function isEmpty(v: unknown): boolean {
  if (v === undefined || v === null) return true;
  if (Array.isArray(v)) return v.length === 0;
  if (isObj(v)) return Object.keys(v).length === 0;
  return false;
}

/** 按固定键序重排对象;未知键排在已知键之后,保持原有相对顺序 */
function ordered(obj: Record<string, unknown>, keys: string[], map: (k: string, v: unknown) => unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const put = (k: string) => {
    const v = map(k, obj[k]);
    if (v !== undefined) out[k] = v;
  };
  for (const k of keys) if (k in obj) put(k);
  for (const k of Object.keys(obj)) if (!keys.includes(k)) put(k);
  return out;
}

function serStyle(s: unknown): unknown {
  if (!isObj(s)) return undefined;
  const o = ordered(s, STYLE_KEYS, (_k, v) => (v === undefined || v === null ? undefined : v));
  return isEmpty(o) ? undefined : o;
}

function serRef(r: Record<string, unknown>): Record<string, unknown> {
  return ordered(r, REF_KEYS, (k, v) => {
    if (k === "style") return serStyle(v);
    if (k === "text" && v === "") return undefined;
    return isEmpty(v) ? undefined : v;
  });
}

function serTopic(t: Topic): Record<string, unknown> {
  return ordered(t, TOPIC_KEYS, (k, v) => {
    switch (k) {
      case "text":
        return typeof v === "string" ? v : "";
      case "collapsed":
        return v === true ? true : undefined;
      case "note":
      case "link":
        return v === "" ? undefined : isEmpty(v) ? undefined : v;
      case "style":
        return serStyle(v);
      case "summaries":
      case "boundaries":
        return isEmpty(v) ? undefined : (v as Range[]).map((r) => serRef(r));
      case "children":
        return isEmpty(v) ? undefined : (v as Topic[]).map(serTopic);
      default:
        return isEmpty(v) ? undefined : v;
    }
  });
}

export function serialize(doc: MindDoc): string {
  const out = ordered(doc, DOC_KEYS, (k, v) => {
    switch (k) {
      case "version":
        return typeof v === "number" ? v : FORMAT_VERSION;
      case "theme":
        return v === DEFAULT_THEME || isEmpty(v) ? undefined : v;
      case "structure":
        return v === DEFAULT_STRUCTURE || isEmpty(v) ? undefined : v;
      case "root":
        return serTopic(v as Topic);
      case "relationships":
        return isEmpty(v) ? undefined : (v as Relationship[]).map((r) => serRef(r));
      case "floating":
        return isEmpty(v) ? undefined : (v as Topic[]).map(serTopic);
      default:
        return isEmpty(v) ? undefined : v;
    }
  });
  if (!("version" in out)) {
    // version 必须写出,放在 $schema 之后
    const { $schema, ...rest } = out;
    return JSON.stringify({ ...($schema !== undefined ? { $schema } : {}), version: FORMAT_VERSION, ...rest }, null, 2) + "\n";
  }
  return JSON.stringify(out, null, 2) + "\n";
}

export function docTheme(doc: MindDoc): string {
  return typeof doc.theme === "string" && doc.theme ? doc.theme : DEFAULT_THEME;
}
