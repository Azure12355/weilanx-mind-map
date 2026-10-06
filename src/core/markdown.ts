// Markdown 大纲 ⇄ 文档
// 中心主题 = # 标题;一级分支 = ## 标题;更深层 = - 列表(2 空格缩进);
// 备注 = 节点下方的 > 引用块;标签 = 行尾 `#标签`;链接 = [文字](地址);任务完成度 0 / 100 = [ ] / [x]
import { genId } from "./id";
import { FORMAT_VERSION, MindDoc, Topic } from "./types";

// ---------- 导出 ----------

function inline(t: Topic): string {
  let text = t.text.replace(/\n/g, "<br>");
  if (t.link) text = `[${text}](${t.link})`;
  if (t.markers?.includes("task-100")) text = `[x] ${text}`;
  else if (t.markers?.includes("task-0")) text = `[ ] ${text}`;
  const labels = (t.labels ?? []).map((l) => ` \`#${l}\``).join("");
  return text + labels;
}

function quote(note: string, indent: string): string[] {
  return note.split("\n").map((l) => `${indent}> ${l}`.trimEnd());
}

export function toMarkdown(doc: MindDoc): string {
  const out: string[] = [];
  const root = doc.root;
  out.push(`# ${inline(root)}`, "");
  if (root.note) out.push(...quote(root.note, ""), "");
  for (const main of root.children ?? []) {
    out.push(`## ${inline(main)}`, "");
    if (main.note) out.push(...quote(main.note, ""), "");
    const visit = (t: Topic, depth: number) => {
      const pad = "  ".repeat(depth);
      out.push(`${pad}- ${inline(t)}`);
      if (t.note) out.push(...quote(t.note, pad + "  "));
      for (const c of t.children ?? []) visit(c, depth + 1);
    };
    for (const c of main.children ?? []) visit(c, 0);
    if (main.children?.length) out.push("");
  }
  return out.join("\n").replace(/\n+$/, "") + "\n";
}

/** 导出 Markdown 时会丢失的内容 */
export function markdownLosses(doc: MindDoc): string[] {
  const lost = new Set<string>();
  const visit = (t: Topic) => {
    if (t.style && Object.keys(t.style).length) lost.add("样式");
    if (t.markers?.some((m) => m !== "task-0" && m !== "task-100")) lost.add("标记");
    if (t.summaries?.length) lost.add("概括");
    if (t.boundaries?.length) lost.add("外框");
    if (t.structure) lost.add("分支结构");
    for (const c of t.children ?? []) visit(c);
  };
  visit(doc.root);
  if (doc.relationships?.length) lost.add("联系线");
  if (doc.floating?.length) lost.add("自由主题");
  return [...lost];
}

// ---------- 导入 ----------

/** 解析一行节点文本:复选框、链接、行尾标签、加粗 */
function parseInline(raw: string, used: Set<string>): Topic {
  let text = raw.trim();
  const t: Topic = { id: genId(used), text: "" };
  const cb = /^\[( |x|X)\]\s+/.exec(text);
  if (cb) {
    t.markers = [cb[1] === " " ? "task-0" : "task-100"];
    text = text.slice(cb[0].length);
  }
  const labels: string[] = [];
  for (;;) {
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

/**
 * Markdown 大纲 → 文档。没有 # 标题时用 fallbackTitle 作为中心主题。
 * 多个 # 标题时,第二个起当作一级分支;### 及更深的标题依次下沉一级;正文段落和引用块成为上一个节点的备注。
 */
export function fromMarkdown(md: string, fallbackTitle = "中心主题"): MindDoc {
  const used = new Set<string>();
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  let root: Topic | null = null;
  /** 栈:level 越大越深。中心主题 level=1,## 为 2,列表项 = 所属标题 level + 1 + 缩进层级 */
  const stack: { level: number; topic: Topic }[] = [];
  let headingLevel = 1;
  let last: Topic | null = null;
  let inFence = false;
  const listIndents: number[] = [];

  const ensureRoot = (): Topic => {
    if (!root) {
      root = { id: genId(used), text: fallbackTitle };
      stack.push({ level: 1, topic: root });
    }
    return root;
  };
  const attach = (level: number, t: Topic) => {
    ensureRoot();
    while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
    const parent = stack.length ? stack[stack.length - 1].topic : root!;
    (parent.children ??= []).push(t);
    stack.push({ level, topic: t });
    last = t;
  };
  const addNote = (line: string) => {
    const target: Topic = last ?? ensureRoot();
    target.note = target.note === undefined ? line : `${target.note}\n${line}`;
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
  // 去掉备注首尾空行
  const tidy = (t: Topic) => {
    if (t.note !== undefined) {
      t.note = t.note.replace(/^\n+|\n+$/g, "");
      if (!t.note) delete t.note;
    }
    for (const c of t.children ?? []) tidy(c);
  };
  tidy(r);
  return { version: FORMAT_VERSION, root: r };
}

/** 粘贴的文本 → 节点列表:Markdown 大纲按结构解析;普通文本每行一个节点,按缩进分层 */
export function textToTopics(text: string): Topic[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n").filter((l) => l.trim());
  if (!lines.length) return [];
  const structured = lines.some((l) => /^\s*(#{1,6}\s|[-*+]\s|\d+[.)]\s)/.test(l));
  const md = structured ? lines.join("\n") : lines.map((l) => `${/^\s*/.exec(l)![0]}- ${l.trim()}`).join("\n");
  const SENTINEL = "\u0000";
  const doc = fromMarkdown(md, SENTINEL);
  return doc.root.text === SENTINEL ? (doc.root.children ?? []) : [doc.root];
}
