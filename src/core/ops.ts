// 编辑操作:输入旧文档,输出新文档(不可变,未改动的子树保持原引用)
import { genId } from "./id";
import { markerCategory } from "./markers";
import { allIds, Entry, getTopic, indexDoc, isInSubtree, subtreeIds, walk } from "./query";
import { MindDoc, Point, Range, Relationship, Style, Topic } from "./types";

export class OpError extends Error {}

export type RangeKind = "summaries" | "boundaries";

function entry(doc: MindDoc, id: string): Entry {
  const e = indexDoc(doc).get(id);
  if (!e) throw new OpError(`节点不存在:${id}`);
  return e;
}

/** 替换某个节点(沿路径重建祖先,其余子树复用) */
export function updateAt(doc: MindDoc, id: string, fn: (t: Topic) => Topic): MindDoc {
  const e = entry(doc, id);
  const rebuild = (t: Topic, path: number[]): Topic => {
    if (!path.length) return fn(t);
    const [i, ...rest] = path;
    return { ...t, children: t.children!.map((c, j) => (j === i ? rebuild(c, rest) : c)) };
  };
  if (e.loc.tree < 0) return { ...doc, root: rebuild(doc.root, e.loc.path) };
  const floating = doc.floating!.slice();
  floating[e.loc.tree] = rebuild(floating[e.loc.tree], e.loc.path);
  return { ...doc, floating };
}

/** 合并字段;值为 undefined 的键删除 */
function patchObj<T extends Record<string, unknown>>(obj: T, patch: Record<string, unknown>): T {
  const out: Record<string, unknown> = { ...obj };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete out[k];
    else out[k] = v;
  }
  return out as T;
}

function newTopic(doc: MindDoc, init: Partial<Topic> = {}): Topic {
  return { ...init, id: genId(allIds(doc)), text: init.text ?? "" } as Topic;
}

// ---------- 文字 / 字段 / 样式 ----------

export function setText(doc: MindDoc, id: string, text: string): MindDoc {
  return updateAt(doc, id, (t) => ({ ...t, text }));
}

/** 改节点字段(note / link / labels / markers / collapsed / structure …),值为 undefined 表示删除 */
export function updateTopic(doc: MindDoc, ids: string | string[], patch: Partial<Topic>): MindDoc {
  for (const id of toList(ids)) doc = updateAt(doc, id, (t) => patchObj(t, patch));
  return doc;
}

/** 改样式;值为 undefined 表示恢复主题默认 */
export function setStyle(doc: MindDoc, ids: string | string[], patch: Style): MindDoc {
  for (const id of toList(ids)) {
    doc = updateAt(doc, id, (t) => {
      const style = patchObj(t.style ?? {}, patch);
      const out: Topic = { ...t, style };
      if (!Object.keys(style).length) delete out.style;
      return out;
    });
  }
  return doc;
}

export function clearStyle(doc: MindDoc, ids: string | string[]): MindDoc {
  return updateTopic(doc, ids, { style: undefined });
}

export function setCollapsed(doc: MindDoc, ids: string | string[], collapsed: boolean): MindDoc {
  for (const id of toList(ids)) {
    const t = entry(doc, id).topic;
    if (!t.children?.length && collapsed) continue;
    doc = updateTopic(doc, id, { collapsed: collapsed ? true : undefined });
  }
  return doc;
}

export function toggleCollapsed(doc: MindDoc, ids: string | string[]): MindDoc {
  const list = toList(ids).filter((id) => entry(doc, id).topic.children?.length);
  if (!list.length) return doc;
  const allCollapsed = list.every((id) => entry(doc, id).topic.collapsed);
  return setCollapsed(doc, list, !allCollapsed);
}

/** 展开 / 折叠所有节点 */
export function setAllCollapsed(doc: MindDoc, collapsed: boolean, minDepth = 1): MindDoc {
  const ids: string[] = [];
  for (const [id, e] of indexDoc(doc)) {
    if (e.depth >= minDepth && e.topic.children?.length && !!e.topic.collapsed !== collapsed) ids.push(id);
  }
  return setCollapsed(doc, ids, collapsed);
}

/** 展开 / 收起某个节点及其全部后代(中心主题本身不收起) */
export function setSubtreeCollapsed(doc: MindDoc, id: string, collapsed: boolean): MindDoc {
  const ids: string[] = [];
  walk(entry(doc, id).topic, (t) => {
    if (collapsed && t.id === doc.root.id) return;
    if (t.children?.length && !!t.collapsed !== collapsed) ids.push(t.id);
  });
  return setCollapsed(doc, ids, collapsed);
}

/** 展开某个节点的所有祖先,让它在画布上可见 */
export function revealTopic(doc: MindDoc, id: string): MindDoc {
  const idx = indexDoc(doc);
  const ids: string[] = [];
  for (let p = idx.get(id)?.parent; p; p = idx.get(p.id)?.parent) if (p.collapsed) ids.push(p.id);
  return ids.length ? setCollapsed(doc, ids, false) : doc;
}

/** 在节点文字里查找替换(纯文本,不是正则);没有变化的节点保持原样 */
export function replaceText(doc: MindDoc, ids: string | string[], find: string, replacement: string, caseSensitive = false): MindDoc {
  if (!find) return doc;
  const re = new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), caseSensitive ? "g" : "gi");
  for (const id of toList(ids)) {
    const t = entry(doc, id).topic;
    const text = t.text.replace(re, () => replacement);
    if (text !== t.text) doc = setText(doc, id, text);
  }
  return doc;
}

// ---------- 标记 / 标签 ----------

/** 加标记:同一类别只保留一个 */
export function addMarker(doc: MindDoc, ids: string | string[], marker: string): MindDoc {
  const cat = markerCategory(marker);
  for (const id of toList(ids)) {
    doc = updateAt(doc, id, (t) => {
      const markers = (t.markers ?? []).filter((m) => markerCategory(m) !== cat);
      return { ...t, markers: [...markers, marker] };
    });
  }
  return doc;
}

export function removeMarker(doc: MindDoc, ids: string | string[], marker: string): MindDoc {
  for (const id of toList(ids)) {
    doc = updateAt(doc, id, (t) => {
      const markers = (t.markers ?? []).filter((m) => m !== marker);
      const out: Topic = { ...t, markers };
      if (!markers.length) delete out.markers;
      return out;
    });
  }
  return doc;
}

/** 所有选中节点都有这个标记 → 全部移除;否则全部加上 */
export function toggleMarker(doc: MindDoc, ids: string | string[], marker: string): MindDoc {
  const list = toList(ids);
  const all = list.every((id) => entry(doc, id).topic.markers?.includes(marker));
  return all ? removeMarker(doc, list, marker) : addMarker(doc, list, marker);
}

export function addLabel(doc: MindDoc, ids: string | string[], label: string): MindDoc {
  label = label.trim();
  if (!label) return doc;
  for (const id of toList(ids)) {
    doc = updateAt(doc, id, (t) => (t.labels?.includes(label) ? t : { ...t, labels: [...(t.labels ?? []), label] }));
  }
  return doc;
}

export function removeLabel(doc: MindDoc, ids: string | string[], label: string): MindDoc {
  for (const id of toList(ids)) {
    doc = updateAt(doc, id, (t) => {
      const labels = (t.labels ?? []).filter((l) => l !== label);
      const out: Topic = { ...t, labels };
      if (!labels.length) delete out.labels;
      return out;
    });
  }
  return doc;
}

// ---------- 增 ----------

export function addChild(doc: MindDoc, parentId: string, init: Partial<Topic> = {}, index?: number): { doc: MindDoc; id: string } {
  const topic = newTopic(doc, init);
  doc = updateAt(doc, parentId, (p) => {
    const children = (p.children ?? []).slice();
    const at = index === undefined ? children.length : clamp(index, 0, children.length);
    children.splice(at, 0, topic);
    const out = { ...p, children };
    delete out.collapsed;
    return out;
  });
  return { doc, id: topic.id };
}

/** 添加同级节点;中心主题和自由主题没有同级,改为添加子节点 */
export function addSibling(doc: MindDoc, id: string, before = false, init: Partial<Topic> = {}): { doc: MindDoc; id: string } {
  const e = entry(doc, id);
  if (!e.parent) return addChild(doc, id, init);
  return addChild(doc, e.parent.id, init, before ? e.index : e.index + 1);
}

/** 在节点和它的父节点之间插入一个新的上级节点 */
export function insertParent(doc: MindDoc, id: string, init: Partial<Topic> = {}): { doc: MindDoc; id: string } | null {
  const e = entry(doc, id);
  if (!e.parent) return null;
  const topic = newTopic(doc, init);
  topic.children = [e.topic];
  doc = updateAt(doc, e.parent.id, (p) => {
    const children = p.children!.slice();
    children[e.index] = topic;
    const fixRef = (r: Range) => ({ ...r, from: r.from === id ? topic.id : r.from, to: r.to === id ? topic.id : r.to });
    const out = { ...p, children };
    if (p.summaries) out.summaries = p.summaries.map(fixRef);
    if (p.boundaries) out.boundaries = p.boundaries.map(fixRef);
    return out;
  });
  return { doc, id: topic.id };
}

export function addFloating(doc: MindDoc, position: Point, init: Partial<Topic> = {}): { doc: MindDoc; id: string } {
  const topic = newTopic(doc, init);
  topic.position = { x: Math.round(position.x), y: Math.round(position.y) };
  return { doc: { ...doc, floating: [...(doc.floating ?? []), topic] }, id: topic.id };
}

/** 粘贴子树:重新生成所有 id,并修正子树内部的概括 / 外框引用 */
export function pasteTopics(doc: MindDoc, parentId: string, topics: Topic[], index?: number): { doc: MindDoc; ids: string[] } {
  const used = allIds(doc);
  const clone = (t: Topic): Topic => {
    const map = new Map<string, string>();
    const children = (t.children ?? []).map((c) => {
      const cc = clone(c);
      map.set(c.id, cc.id);
      return cc;
    });
    const out: Topic = { ...t, id: genId(used) };
    delete out.position;
    if (t.children) out.children = children;
    const remap = (r: Range): Range => ({ ...r, id: genId(used), from: map.get(r.from) ?? r.from, to: map.get(r.to) ?? r.to });
    if (t.summaries) out.summaries = t.summaries.map(remap);
    if (t.boundaries) out.boundaries = t.boundaries.map(remap);
    return out;
  };
  const clones = topics.map(clone);
  doc = updateAt(doc, parentId, (p) => {
    const children = (p.children ?? []).slice();
    const at = index === undefined ? children.length : clamp(index, 0, children.length);
    children.splice(at, 0, ...clones);
    const out = { ...p, children };
    delete out.collapsed;
    return out;
  });
  return { doc, ids: clones.map((c) => c.id) };
}

// ---------- 删 ----------

/** 子节点集合变化后修正概括 / 外框:端点被删就收缩到原范围内剩下的兄弟,范围空了就删除 */
function fixRanges(p: Topic, oldChildren: Topic[]): Topic {
  const alive = new Set((p.children ?? []).map((c) => c.id));
  const fix = (list: Range[] | undefined): Range[] | undefined => {
    if (!list) return list;
    const out: Range[] = [];
    for (const r of list) {
      const a = oldChildren.findIndex((c) => c.id === r.from);
      const b = oldChildren.findIndex((c) => c.id === r.to);
      if (a < 0 || b < 0) {
        out.push(r); // 本来就悬空的引用原样保留
        continue;
      }
      const span = oldChildren.slice(Math.min(a, b), Math.max(a, b) + 1).filter((c) => alive.has(c.id));
      if (!span.length) continue;
      out.push({ ...r, from: span[0].id, to: span[span.length - 1].id });
    }
    return out;
  };
  const out = { ...p };
  const s = fix(p.summaries);
  const b = fix(p.boundaries);
  if (s) s.length ? (out.summaries = s) : delete out.summaries;
  if (b) b.length ? (out.boundaries = b) : delete out.boundaries;
  if (out.children && !out.children.length) {
    delete out.children;
    delete out.collapsed;
  }
  return out;
}

/** 删除节点(连同子树);中心主题不可删除。指向被删节点的联系线一并删除 */
export function remove(doc: MindDoc, ids: string | string[]): MindDoc {
  const removed = new Set<string>();
  for (const id of toList(ids)) {
    const e = indexDoc(doc).get(id);
    if (!e || e.topic.id === doc.root.id) continue;
    for (const x of subtreeIds(e.topic)) removed.add(x);
    if (!e.parent) {
      doc = { ...doc, floating: doc.floating!.filter((f) => f.id !== id) };
      if (!doc.floating!.length) delete doc.floating;
      continue;
    }
    doc = updateAt(doc, e.parent.id, (p) => fixRanges({ ...p, children: p.children!.filter((c) => c.id !== id) }, p.children!));
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

// ---------- 移动 ----------

/** 把节点从原位置摘下(不删联系线),返回新文档和被摘下的子树 */
function detach(doc: MindDoc, id: string): { doc: MindDoc; topic: Topic } {
  const e = entry(doc, id);
  if (e.topic.id === doc.root.id) throw new OpError("中心主题不能移动");
  if (!e.parent) {
    const floating = doc.floating!.filter((f) => f.id !== id);
    const out: MindDoc = { ...doc, floating };
    if (!floating.length) delete out.floating;
    return { doc: out, topic: e.topic };
  }
  doc = updateAt(doc, e.parent.id, (p) => fixRanges({ ...p, children: p.children!.filter((c) => c.id !== id) }, p.children!));
  return { doc, topic: e.topic };
}

/**
 * 移动节点到 parentId 下的第 index 个位置(index 按「移走之后」的子节点列表计算,省略表示末尾)。
 * 不能移动中心主题,不能移到自己的子树里。
 */
export function move(doc: MindDoc, id: string, parentId: string, index?: number): MindDoc {
  if (isInSubtree(doc, id, parentId)) throw new OpError("不能把节点移动到它自己的子树里");
  const { doc: d, topic } = detach(doc, id);
  const moved = { ...topic };
  delete moved.position;
  return updateAt(d, parentId, (p) => {
    const children = (p.children ?? []).slice();
    const at = index === undefined ? children.length : clamp(index, 0, children.length);
    children.splice(at, 0, moved);
    const out = { ...p, children };
    delete out.collapsed;
    return out;
  });
}

/** 批量移动(保持原有相对顺序),跳过中心主题、目标的祖先、以及已被其他选中节点包含的节点 */
export function moveMany(doc: MindDoc, ids: string[], parentId: string, index?: number): MindDoc {
  const idx = indexDoc(doc);
  const list = ids.filter(
    (id) => id !== doc.root.id && idx.has(id) && !isInSubtree(doc, id, parentId) && !ids.some((o) => o !== id && isInSubtree(doc, o, id))
  );
  // 按文档顺序排序,依次插入
  const order = [...idx.keys()];
  list.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  // index 是相对「移走之前」的列表时,要扣除移走的、排在它前面的兄弟
  const parent = idx.get(parentId)!.topic;
  let at = index;
  if (at !== undefined) {
    const before = (parent.children ?? []).slice(0, at).filter((c) => list.includes(c.id)).length;
    at -= before;
  }
  for (const id of list) {
    doc = move(doc, id, parentId, at);
    if (at !== undefined) at++;
  }
  return doc;
}

/** 变成自由主题,或移动自由主题的位置 */
export function toFloating(doc: MindDoc, id: string, position: Point): MindDoc {
  const pos = { x: Math.round(position.x), y: Math.round(position.y) };
  const e = entry(doc, id);
  if (e.loc.tree >= 0 && !e.parent) return updateAt(doc, id, (t) => ({ ...t, position: pos }));
  const { doc: d, topic } = detach(doc, id);
  return { ...d, floating: [...(d.floating ?? []), { ...topic, position: pos }] };
}

/** 在兄弟间上移 / 下移 */
export function moveSibling(doc: MindDoc, id: string, delta: number): MindDoc {
  const e = entry(doc, id);
  if (!e.parent) return doc;
  const to = e.index + delta;
  if (to < 0 || to >= e.parent.children!.length) return doc;
  return updateAt(doc, e.parent.id, (p) => {
    const children = p.children!.slice();
    const [t] = children.splice(e.index, 1);
    children.splice(to, 0, t);
    return { ...p, children };
  });
}

/** 缩进:变成前一个兄弟的最后一个子节点 */
export function indent(doc: MindDoc, id: string): MindDoc {
  const e = entry(doc, id);
  if (!e.parent || e.index === 0) return doc;
  const prev = e.parent.children![e.index - 1];
  return move(doc, id, prev.id);
}

/** 反缩进:移到父节点之后,成为祖父节点的子节点 */
export function outdent(doc: MindDoc, id: string): MindDoc {
  const e = entry(doc, id);
  if (!e.parent) return doc;
  const pe = entry(doc, e.parent.id);
  if (!pe.parent) return doc;
  return move(doc, id, pe.parent.id, pe.index + 1);
}

// ---------- 联系线 ----------

export function addRelationship(doc: MindDoc, from: string, to: string, init: Partial<Relationship> = {}): { doc: MindDoc; id: string } {
  entry(doc, from);
  entry(doc, to);
  if (from === to) throw new OpError("联系线的两端不能是同一个节点");
  const rel: Relationship = { ...init, id: genId(allIds(doc)), from, to };
  return { doc: { ...doc, relationships: [...(doc.relationships ?? []), rel] }, id: rel.id };
}

export function updateRelationship(doc: MindDoc, id: string, patch: Partial<Relationship>): MindDoc {
  const list = doc.relationships ?? [];
  if (!list.some((r) => r.id === id)) throw new OpError(`联系线不存在:${id}`);
  return { ...doc, relationships: list.map((r) => (r.id === id ? patchObj(r, patch) : r)) };
}

export function setRelationshipStyle(doc: MindDoc, id: string, patch: Style): MindDoc {
  const r = (doc.relationships ?? []).find((x) => x.id === id);
  if (!r) throw new OpError(`联系线不存在:${id}`);
  const style = patchObj(r.style ?? {}, patch);
  return updateRelationship(doc, id, { style: Object.keys(style).length ? style : undefined });
}

export function removeRelationship(doc: MindDoc, id: string): MindDoc {
  const rels = (doc.relationships ?? []).filter((r) => r.id !== id);
  const out: MindDoc = { ...doc, relationships: rels };
  if (!rels.length) delete out.relationships;
  return out;
}

// ---------- 概括 / 外框 ----------

/** 给一组兄弟节点加概括 / 外框,范围是它们中最靠前到最靠后的那段;不是同一父节点时返回 null */
export function addRange(doc: MindDoc, kind: RangeKind, ids: string[], text?: string): { doc: MindDoc; id: string } | null {
  if (!ids.length) return null;
  const entries = ids.map((id) => entry(doc, id));
  const parent = entries[0].parent;
  if (!parent || entries.some((e) => e.parent?.id !== parent.id)) return null;
  const idxs = entries.map((e) => e.index);
  const from = parent.children![Math.min(...idxs)].id;
  const to = parent.children![Math.max(...idxs)].id;
  const range: Range = { id: genId(allIds(doc)), from, to };
  if (text !== undefined) range.text = text;
  doc = updateAt(doc, parent.id, (p) => ({ ...p, [kind]: [...(p[kind] ?? []), range] }));
  return { doc, id: range.id };
}

/** 找到某个概括 / 外框所在的节点 */
export function findRange(doc: MindDoc, id: string): { owner: Topic; kind: RangeKind; range: Range } | null {
  for (const [, e] of indexDoc(doc)) {
    for (const kind of ["summaries", "boundaries"] as const) {
      const r = e.topic[kind]?.find((x) => x.id === id);
      if (r) return { owner: e.topic, kind, range: r };
    }
  }
  return null;
}

export function updateRange(doc: MindDoc, id: string, patch: Partial<Range>): MindDoc {
  const f = findRange(doc, id);
  if (!f) throw new OpError(`概括 / 外框不存在:${id}`);
  return updateAt(doc, f.owner.id, (p) => ({ ...p, [f.kind]: p[f.kind]!.map((r) => (r.id === id ? patchObj(r, patch) : r)) }));
}

export function setRangeStyle(doc: MindDoc, id: string, patch: Style): MindDoc {
  const f = findRange(doc, id);
  if (!f) throw new OpError(`概括 / 外框不存在:${id}`);
  const style = patchObj(f.range.style ?? {}, patch);
  return updateRange(doc, id, { style: Object.keys(style).length ? style : undefined });
}

export function removeRange(doc: MindDoc, id: string): MindDoc {
  const f = findRange(doc, id);
  if (!f) return doc;
  return updateAt(doc, f.owner.id, (p) => {
    const list = p[f.kind]!.filter((r) => r.id !== id);
    const out: Topic = { ...p, [f.kind]: list };
    if (!list.length) delete out[f.kind];
    return out;
  });
}

// ---------- 文档级 ----------

export function setDocProp(doc: MindDoc, key: "theme" | "structure", value: string | undefined): MindDoc {
  const out = { ...doc } as MindDoc;
  if (value === undefined) delete out[key];
  else (out as Record<string, unknown>)[key] = value;
  return out;
}

/** 删除任意对象:节点 / 联系线 / 概括 / 外框 */
export function removeAny(doc: MindDoc, ids: string[]): MindDoc {
  const topics: string[] = [];
  for (const id of ids) {
    if (getTopic(doc, id)) topics.push(id);
    else if (doc.relationships?.some((r) => r.id === id)) doc = removeRelationship(doc, id);
    else doc = removeRange(doc, id);
  }
  return topics.length ? remove(doc, topics) : doc;
}

// ---------- 工具 ----------

function toList(ids: string | string[]): string[] {
  return typeof ids === "string" ? [ids] : ids;
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

/** 复制用:取一组节点的子树(去掉被其他选中节点包含的) */
export function copyTopics(doc: MindDoc, ids: string[]): Topic[] {
  const idx = indexDoc(doc);
  const order = [...idx.keys()];
  return ids
    .filter((id) => idx.has(id) && !ids.some((o) => o !== id && isInSubtree(doc, o, id)))
    .sort((a, b) => order.indexOf(a) - order.indexOf(b))
    .map((id) => idx.get(id)!.topic);
}

