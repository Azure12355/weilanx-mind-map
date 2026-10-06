// 查询:按 id / 路径定位节点、遍历、输出大纲
import { MindDoc, Topic } from "./types";

/** 节点位置:在哪棵树(-1 = 中心主题,i = floating[i])以及从树根到它的子节点下标路径 */
export interface Loc {
  tree: number;
  path: number[];
}

export interface Entry {
  topic: Topic;
  parent: Topic | null;
  /** 在父节点 children 里的下标;树根为 -1 */
  index: number;
  depth: number;
  loc: Loc;
}

const cache = new WeakMap<MindDoc, Map<string, Entry>>();

/** id → 节点信息(含中心主题树与所有自由主题树)。文档是不可变对象,结果按文档缓存 */
export function indexDoc(doc: MindDoc): Map<string, Entry> {
  let map = cache.get(doc);
  if (map) return map;
  map = new Map();
  const m = map;
  const visit = (t: Topic, parent: Topic | null, index: number, depth: number, tree: number, path: number[]) => {
    m.set(t.id, { topic: t, parent, index, depth, loc: { tree, path } });
    (t.children ?? []).forEach((c, i) => visit(c, t, i, depth + 1, tree, [...path, i]));
  };
  visit(doc.root, null, -1, 0, -1, []);
  (doc.floating ?? []).forEach((f, i) => visit(f, null, -1, 0, i, []));
  cache.set(doc, map);
  return map;
}

export function getTopic(doc: MindDoc, id: string): Topic | undefined {
  return indexDoc(doc).get(id)?.topic;
}

export function isFloatingRoot(doc: MindDoc, id: string): boolean {
  const e = indexDoc(doc).get(id);
  return !!e && e.loc.tree >= 0 && e.parent === null;
}

/** 是否 ancestor 本身或其子孙 */
export function isInSubtree(doc: MindDoc, ancestorId: string, id: string): boolean {
  let e = indexDoc(doc).get(id);
  while (e) {
    if (e.topic.id === ancestorId) return true;
    e = e.parent ? indexDoc(doc).get(e.parent.id) : undefined;
  }
  return false;
}

export function walk(t: Topic, fn: (t: Topic, depth: number) => void, depth = 0) {
  fn(t, depth);
  for (const c of t.children ?? []) walk(c, fn, depth + 1);
}

export function subtreeIds(t: Topic): Set<string> {
  const s = new Set<string>();
  walk(t, (x) => s.add(x.id));
  return s;
}

/** 所有 id(节点、概括、外框、联系线),生成新 id 时避开 */
export function allIds(doc: MindDoc): Set<string> {
  const s = new Set<string>();
  const visit = (t: Topic) => {
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

// ---------- 路径 ----------

/** "产品规划/用户调研" → ["产品规划","用户调研"];文本里的 / 写成 \/ */
export function splitPath(path: string): string[] {
  const parts: string[] = [];
  let cur = "";
  for (let i = 0; i < path.length; i++) {
    const ch = path[i];
    if (ch === "\\" && path[i + 1] === "/") {
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

function escapeSeg(text: string): string {
  return text.replace(/\n/g, " ").replace(/\//g, "\\/");
}

export function topicPath(doc: MindDoc, id: string): string {
  const parts: string[] = [];
  let e = indexDoc(doc).get(id);
  while (e) {
    parts.unshift(escapeSeg(e.topic.text));
    e = e.parent ? indexDoc(doc).get(e.parent.id) : undefined;
  }
  return parts.join("/");
}

/** 按路径找节点。第一段匹配中心主题或某个自由主题;文本比较时把换行当空格 */
export function findByPath(doc: MindDoc, path: string): Topic[] {
  const segs = splitPath(path);
  if (!segs.length) return [];
  const norm = (s: string) => s.replace(/\s+/g, " ").trim();
  let level = [doc.root, ...(doc.floating ?? [])].filter((t) => norm(t.text) === segs[0]);
  for (const seg of segs.slice(1)) {
    level = level.flatMap((t) => (t.children ?? []).filter((c) => norm(c.text) === seg));
  }
  return level;
}

export class RefError extends Error {
  constructor(message: string, public candidates: string[] = []) {
    super(message);
  }
}

/** 引用可以是 id,也可以是路径;找不到或有歧义时抛 RefError */
export function resolveRef(doc: MindDoc, ref: string): Topic {
  const byId = getTopic(doc, ref);
  if (byId) return byId;
  const hits = findByPath(doc, ref);
  if (hits.length === 1) return hits[0];
  if (!hits.length) throw new RefError(`找不到节点「${ref}」(既不是 id,也不是从中心主题开始的路径)`);
  throw new RefError(
    `路径「${ref}」匹配到 ${hits.length} 个节点,请改用 id`,
    hits.map((h) => `${h.id}  ${topicPath(doc, h.id)}`)
  );
}

/** 关键词搜索:匹配文本、备注、标签 */
export function search(doc: MindDoc, keyword: string): Topic[] {
  const k = keyword.toLowerCase();
  const out: Topic[] = [];
  const visit = (t: Topic) =>
    walk(t, (x) => {
      const hay = [x.text, x.note ?? "", ...(x.labels ?? [])].join("\n").toLowerCase();
      if (hay.includes(k)) out.push(x);
    });
  visit(doc.root);
  for (const f of doc.floating ?? []) visit(f);
  return out;
}

// ---------- 大纲 ----------

export interface OutlineOptions {
  ids?: boolean;
  depth?: number;
}

function decorate(t: Topic, ids: boolean): string {
  let line = t.text.replace(/\n/g, " / ");
  const marks = (t.markers ?? []).map((m) => `[${m}]`).join("");
  if (marks) line = `${marks} ${line}`;
  if (t.labels?.length) line += "  " + t.labels.map((l) => `#${l}`).join(" ");
  if (t.link) line += `  <${t.link}>`;
  if (t.note) {
    const n = t.note.replace(/\s+/g, " ").trim();
    line += `  (备注: ${n.length > 40 ? n.slice(0, 40) + "…" : n})`;
  }
  if (t.collapsed) line += "  [折叠]";
  if (ids) line += `  {${t.id}}`;
  return line;
}

/** 缩进大纲文本:Agent 读这个最省 token */
export function outline(doc: MindDoc, opts: OutlineOptions = {}): string {
  const lines: string[] = [];
  const max = opts.depth ?? Infinity;
  const visit = (t: Topic, depth: number) => {
    lines.push("  ".repeat(depth) + "- " + decorate(t, !!opts.ids));
    for (const s of t.summaries ?? []) {
      lines.push("  ".repeat(depth + 1) + `» 概括(${rangeLabel(doc, s.from, s.to)}): ${s.text ?? ""}${opts.ids ? `  {${s.id}}` : ""}`);
    }
    for (const b of t.boundaries ?? []) {
      lines.push("  ".repeat(depth + 1) + `▢ 外框(${rangeLabel(doc, b.from, b.to)})${b.text ? ": " + b.text : ""}${opts.ids ? `  {${b.id}}` : ""}`);
    }
    if (depth + 1 > max) {
      const n = countDescendants(t);
      if (n) lines.push("  ".repeat(depth + 1) + `… ${n} 个子孙节点`);
      return;
    }
    for (const c of t.children ?? []) visit(c, depth + 1);
  };
  visit(doc.root, 0);
  for (const f of doc.floating ?? []) {
    lines.push("");
    lines.push(`自由主题 @(${f.position?.x ?? 0}, ${f.position?.y ?? 0}):`);
    visit(f, 0);
  }
  if (doc.relationships?.length) {
    lines.push("");
    lines.push("联系线:");
    for (const r of doc.relationships) {
      const a = getTopic(doc, r.from)?.text ?? `?${r.from}`;
      const b = getTopic(doc, r.to)?.text ?? `?${r.to}`;
      lines.push(`- ${oneLine(a)} → ${oneLine(b)}${r.text ? `: ${r.text}` : ""}${opts.ids ? `  {${r.id}}` : ""}`);
    }
  }
  return lines.join("\n") + "\n";
}

function oneLine(s: string) {
  return s.replace(/\n/g, " ");
}

function rangeLabel(doc: MindDoc, from: string, to: string): string {
  const a = oneLine(getTopic(doc, from)?.text ?? "?");
  if (from === to) return a;
  return `${a} … ${oneLine(getTopic(doc, to)?.text ?? "?")}`;
}

export function countDescendants(t: Topic): number {
  let n = 0;
  for (const c of t.children ?? []) n += 1 + countDescendants(c);
  return n;
}
