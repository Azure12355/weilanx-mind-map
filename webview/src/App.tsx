import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { parse, serialize, type ParseError } from "../../src/core/doc";
import * as ops from "../../src/core/ops";
import { OpError } from "../../src/core/ops";
import { getTopic, indexDoc } from "../../src/core/query";
import { markdownLosses, textToTopics, toMarkdown } from "../../src/core/markdown";
import { relationshipGeom } from "../../src/core/layout/geometry";
import type { Issue, MindDoc, Point, Topic } from "../../src/core/types";
import type { Host, HostCommand, HostKind, InMsg } from "./host";
import { History } from "./history";
import { buildScene } from "./scene";
import { Canvas, zoomAt, type CanvasApi, type DropTarget, type Viewport } from "./Canvas";
import { Toolbar } from "./Toolbar";
import { Laser } from "./Laser";
import { SearchBar, type SearchMode } from "./Search";
import { ContextMenu } from "./ContextMenu";
import { FormatPanel } from "./FormatPanel";
import { Outline } from "./Outline";
import { buildSvg, svgToPngBase64 } from "./export";
import { setLang, t } from "./i18n";
import { Icon } from "./icons";

export interface Editing {
  id: string;
  value: string;
  selectAll: boolean;
}

export type ExportFormat = "png" | "svg" | "md";

/** 给工具栏 / 格式面板 / 大纲用的操作集合 */
export interface Actions {
  doc: MindDoc;
  selection: string[];
  readOnly: boolean;
  dark: boolean;
  apply(fn: (d: MindDoc) => MindDoc, select?: string[]): void;
  select(ids: string[]): void;
  addTopic(kind: "sibling" | "before" | "child" | "parent"): void;
  remove(): void;
  startLinking(): void;
  addRange(kind: "summaries" | "boundaries"): void;
  undo(): void;
  redo(): void;
  canUndo: boolean;
  canRedo: boolean;
  exportAs(format: ExportFormat): void;
  openLink(id: string): void;
  notify(msg: string): void;
}

/** 只影响显示、不写进文件的设置,记在本机 */
export interface ViewPrefs {
  showBranches: boolean;
  showRelationships: boolean;
}

function detectDark(): boolean {
  const c = document.body.classList;
  // Obsidian
  if (c.contains("theme-dark")) return true;
  if (c.contains("theme-light")) return false;
  if (c.contains("vscode-light") || c.contains("vscode-high-contrast-light")) return false;
  if (c.contains("vscode-dark") || c.contains("vscode-high-contrast")) return true;
  const q = new URLSearchParams(location.search).get("dark");
  if (q !== null) return q !== "0";
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

const isMac = /Mac|iPhone|iPad/.test(navigator.platform);

export function App({ host }: { host: Host }) {
  /** 整个界面的根元素:Obsidian 里多个导图共用一个页面,全局事件只处理落在本界面内的 */
  const rootRef = useRef<HTMLDivElement>(null);
  const [doc, setDocState] = useState<MindDoc | null>(null);
  const docRef = useRef<MindDoc | null>(null);
  const [error, setError] = useState<ParseError | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [showIssues, setShowIssues] = useState(false);
  const [readOnly, setReadOnly] = useState(false);
  const [hostKind, setHostKind] = useState<HostKind>("preview");
  const fileName = useRef("mindmap");
  const history = useRef(new History());
  const [, bump] = useReducer((x: number) => x + 1, 0);
  const [selection, setSelectionState] = useState<string[]>([]);
  const selRef = useRef<string[]>([]);
  const [editing, setEditingState] = useState<Editing | null>(null);
  const editingRef = useRef<Editing | null>(null);
  const [view, setView] = useState<"map" | "outline">("map");
  const [laser, setLaser] = useState(false);
  const exitLaser = useCallback(() => setLaser(false), []);
  const [panel, setPanel] = useState(() => localStorage.getItem("wmind-panel") !== "0");
  const [prefs, setPrefsState] = useState<ViewPrefs>(() => ({
    showBranches: localStorage.getItem("wmind-branches") !== "0",
    showRelationships: localStorage.getItem("wmind-relationships") !== "0",
  }));
  const setPrefs = (p: Partial<ViewPrefs>) =>
    setPrefsState((old) => {
      const next = { ...old, ...p };
      localStorage.setItem("wmind-branches", next.showBranches ? "1" : "0");
      localStorage.setItem("wmind-relationships", next.showRelationships ? "1" : "0");
      return next;
    });
  const [search, setSearch] = useState<{ mode: SearchMode; n: number } | null>(null);
  const [found, setFound] = useState<{ ids: Set<string>; current: string | null }>({ ids: new Set(), current: null });
  const [ctxMenu, setCtxMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const closeCtxMenu = useCallback(() => {
    setCtxMenu(null);
    // 菜单按钮卸载后焦点会落到 body,还给画布,快捷键才能继续用
    requestAnimationFrame(() => {
      const el = document.activeElement;
      if (!el || el === document.body) captureRef.current?.focus({ preventScroll: true });
    });
  }, []);
  const [panelFocus, setPanelFocus] = useState<{ field: "note" | "link"; n: number } | null>(null);
  const [linkingFrom, setLinkingFrom] = useState<string | null>(null);
  const [dark, setDark] = useState(detectDark);
  const [viewport, setViewportState] = useState<Viewport>({ x: 0, y: 0, k: 1 });
  const vpRef = useRef(viewport);
  const size = useRef({ w: 0, h: 0 });
  const needCenter = useRef(true);
  const [toast, setToast] = useState<string | null>(null);
  const captureRef = useRef<HTMLTextAreaElement>(null);
  const composing = useRef(false);
  const spaceHeld = useRef({ down: false, used: false });
  const clip = useRef<{ text: string; topics: Topic[] } | null>(null);

  const setViewport = useCallback((v: Viewport | ((v: Viewport) => Viewport)) => {
    setViewportState((old) => {
      const next = typeof v === "function" ? v(old) : v;
      vpRef.current = next;
      return next;
    });
  }, []);

  const setSelection = (ids: string[]) => {
    selRef.current = ids;
    setSelectionState(ids);
  };
  const setEditing = (e: Editing | null) => {
    editingRef.current = e;
    setEditingState(e);
  };

  const scene = useMemo(() => (doc ? buildScene(doc, dark) : null), [doc, dark]);
  const sceneRef = useRef(scene);
  sceneRef.current = scene;

  const notify = useCallback((msg: string) => {
    setToast(msg);
    window.clearTimeout((notify as unknown as { timer?: number }).timer);
    (notify as unknown as { timer?: number }).timer = window.setTimeout(() => setToast(null), 2600);
  }, []);

  // ---------- 文档读写 ----------

  const setDoc = (d: MindDoc) => {
    docRef.current = d;
    setDocState(d);
  };

  const load = (text: string, initial: boolean) => {
    const r = parse(text);
    if (!r.doc) {
      setError(r.error ?? { message: "?", line: 1, column: 1 });
      return;
    }
    setError(null);
    setIssues(r.issues);
    setReadOnly(r.readOnly);
    if (!initial && docRef.current) history.current.push(docRef.current);
    setDoc(r.doc);
    const idx = indexDoc(r.doc);
    setSelection(selRef.current.filter((id) => idx.has(id) || ops.findRange(r.doc!, id) || r.doc!.relationships?.some((x) => x.id === id)));
    if (initial) needCenter.current = true;
    bump();
  };

  const post = (d: MindDoc) => host.post({ type: "edit", text: serialize(d) });

  const commit = (next: MindDoc, select?: string[]) => {
    const cur = docRef.current;
    if (!cur || readOnly) return;
    if (next !== cur) {
      history.current.push(cur);
      setDoc(next);
      post(next);
      bump();
    }
    if (select) setSelection(select);
  };

  const safe = (fn: () => void) => {
    try {
      fn();
    } catch (err) {
      if (err instanceof OpError) notify(err.message);
      else throw err;
    }
  };

  const undo = () => {
    if (editingRef.current || !docRef.current) return;
    const prev = history.current.undo(docRef.current);
    if (!prev) return;
    setDoc(prev);
    post(prev);
    bump();
  };
  const redo = () => {
    if (editingRef.current || !docRef.current) return;
    const next = history.current.redo(docRef.current);
    if (!next) return;
    setDoc(next);
    post(next);
    bump();
  };

  // ---------- 视口 ----------

  const fit = useCallback(() => {
    const s = sceneRef.current;
    if (!s || !size.current.w) return;
    const b = s.layout.bounds;
    const pad = 60;
    const k = Math.min(1, (size.current.w - pad * 2) / Math.max(1, b.w), (size.current.h - pad * 2) / Math.max(1, b.h));
    const kk = Math.max(0.2, k);
    setViewport({ k: kk, x: size.current.w / 2 - (b.x + b.w / 2) * kk, y: size.current.h / 2 - (b.y + b.h / 2) * kk });
  }, [setViewport]);

  const zoom = (factor: number) => setViewport((v) => zoomAt(v, factor, size.current.w / 2, size.current.h / 2));

  const onSize = useCallback(
    (w: number, h: number) => {
      size.current = { w, h };
      if (needCenter.current && sceneRef.current && w) {
        needCenter.current = false;
        fit();
      }
    },
    [fit]
  );

  useEffect(() => {
    if (needCenter.current && scene && size.current.w) {
      needCenter.current = false;
      fit();
    }
  }, [scene, fit]);

  /** 让选中的节点保持在可见区域内 */
  const reveal = (id: string) => {
    const box = sceneRef.current?.layout.nodes.get(id);
    if (!box) return;
    const v = vpRef.current;
    const m = 40;
    const sx = box.x * v.k + v.x;
    const sy = box.y * v.k + v.y;
    const ex = sx + box.w * v.k;
    const ey = sy + box.h * v.k;
    let dx = 0;
    let dy = 0;
    if (sx < m) dx = m - sx;
    else if (ex > size.current.w - m) dx = size.current.w - m - ex;
    if (sy < m) dy = m - sy;
    else if (ey > size.current.h - m) dy = size.current.h - m - ey;
    if (dx || dy) setViewport({ ...v, x: v.x + dx, y: v.y + dy });
  };

  // ---------- 编辑 ----------

  const focusCapture = () => requestAnimationFrame(() => captureRef.current?.focus({ preventScroll: true }));

  const textOf = (d: MindDoc, id: string): string | null => {
    const tp = getTopic(d, id);
    if (tp) return tp.text;
    const r = ops.findRange(d, id);
    if (r) return r.range.text ?? "";
    const rel = d.relationships?.find((x) => x.id === id);
    if (rel) return rel.text ?? "";
    return null;
  };

  const startEdit = (id: string, initial?: string) => {
    const d = docRef.current;
    if (!d || readOnly) return;
    const cur = textOf(d, id);
    if (cur === null) return;
    setSelection([id]);
    setEditing({ id, value: initial ?? cur, selectAll: initial === undefined });
    requestAnimationFrame(() => {
      const el = captureRef.current;
      if (!el) return;
      el.focus({ preventScroll: true });
      if (initial === undefined) el.select();
      else el.setSelectionRange(el.value.length, el.value.length);
    });
    reveal(id);
  };

  const commitEdit = (then?: "child") => {
    const e = editingRef.current;
    const d = docRef.current;
    if (!e || !d) return;
    setEditing(null);
    let next = d;
    if (getTopic(d, e.id)) next = ops.setText(d, e.id, e.value);
    else if (ops.findRange(d, e.id)) next = ops.updateRange(d, e.id, { text: e.value.trim() ? e.value : undefined });
    else if (d.relationships?.some((r) => r.id === e.id)) next = ops.updateRelationship(d, e.id, { text: e.value.trim() ? e.value : undefined });
    if (textOf(d, e.id) !== e.value) commit(next);
    if (then === "child") addTopicTo(next, "child", e.id);
    else focusCapture();
  };

  const defaultText = (d: MindDoc, parentId: string) => (parentId === d.root.id ? t("newTopic") : t("newSubtopic"));

  const addTopicTo = (d: MindDoc, kind: "sibling" | "before" | "child" | "parent", id: string) => {
    safe(() => {
      const e = indexDoc(d).get(id);
      if (!e) return;
      let r: { doc: MindDoc; id: string } | null;
      if (kind === "child") r = ops.addChild(d, id, { text: defaultText(d, id) });
      else if (kind === "parent") r = ops.insertParent(d, id, { text: t("topic") });
      else if (!e.parent) r = ops.addChild(d, id, { text: defaultText(d, id) });
      else r = ops.addSibling(d, id, kind === "before", { text: defaultText(d, e.parent.id) });
      if (!r) return;
      commit(r.doc, [r.id]);
      requestAnimationFrame(() => startEdit(r!.id));
    });
  };

  const selectedTopics = () => selRef.current.filter((id) => sceneRef.current?.topics.has(id));

  const addTopic = (kind: "sibling" | "before" | "child" | "parent") => {
    const d = docRef.current;
    if (!d || readOnly) return;
    const ids = selectedTopics();
    addTopicTo(d, kind, ids.length ? ids[ids.length - 1] : d.root.id);
  };

  const remove = () => {
    const d = docRef.current;
    if (!d || readOnly || !selRef.current.length) return;
    const ids = selRef.current.filter((id) => id !== d.root.id);
    if (!ids.length) return;
    // 删除后选中:下一个兄弟 → 上一个兄弟 → 父节点
    let nextSel: string[] = [];
    const first = indexDoc(d).get(ids[0]);
    if (first?.parent) {
      const sibs = first.parent.children!.filter((c) => !ids.includes(c.id));
      const after = first.parent.children!.slice(first.index + 1).find((c) => !ids.includes(c.id));
      const before = first.parent.children!.slice(0, first.index).reverse().find((c) => !ids.includes(c.id));
      nextSel = [(after ?? before ?? first.parent).id];
      if (!sibs.length) nextSel = [first.parent.id];
    } else {
      const r = ops.findRange(d, ids[0]);
      if (r) nextSel = [r.owner.id];
    }
    commit(ops.removeAny(d, ids), nextSel);
  };

  const addRange = (kind: "summaries" | "boundaries") => {
    const d = docRef.current;
    if (!d || readOnly) return;
    const ids = selectedTopics();
    const r = ops.addRange(d, kind, ids, kind === "summaries" ? t("newSummary") : undefined);
    if (!r) {
      notify(t("rangeHint"));
      return;
    }
    commit(r.doc, [r.id]);
    if (kind === "summaries") requestAnimationFrame(() => startEdit(r.id));
  };

  const startLinking = () => {
    const ids = selectedTopics();
    if (ids.length !== 1 || readOnly) return;
    setLinkingFrom(ids[0]);
    notify(t("linkHint"));
  };

  const toggleFold = (ids: string[]) => {
    const d = docRef.current;
    if (!d || !ids.length) return;
    commit(ops.toggleCollapsed(d, ids));
  };

  /** 方向键:在该方向上找最近的节点(主方向距离 + 2 倍偏离距离) */
  const navigate = (dx: number, dy: number) => {
    const s = sceneRef.current;
    const d = docRef.current;
    if (!s || !d) return;
    const cur = selRef.current[selRef.current.length - 1];
    const box = cur ? s.layout.nodes.get(cur) : null;
    if (!box) {
      setSelection([d.root.id]);
      return;
    }
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    let best: { id: string; score: number } | null = null;
    for (const b of s.layout.nodes.values()) {
      if (b.id === box.id) continue;
      const ox = b.x + b.w / 2 - cx;
      const oy = b.y + b.h / 2 - cy;
      const along = ox * dx + oy * dy;
      // 用边缘间距判断「在这个方向上」,避免宽节点误判
      const gap = dx ? (dx > 0 ? b.x - (box.x + box.w) : box.x - (b.x + b.w)) : dy > 0 ? b.y - (box.y + box.h) : box.y - (b.y + b.h);
      if (along <= 0 || gap < -Math.min(b.w, b.h, box.w, box.h) / 2) continue;
      const perp = Math.abs(ox * dy) + Math.abs(oy * dx);
      const score = Math.max(0, gap) + perp * 2;
      if (!best || score < best.score) best = { id: b.id, score };
    }
    if (best) {
      setSelection([best.id]);
      reveal(best.id);
    }
  };

  /** 展开 / 收起某个主题的整棵子树 */
  const setSubtreeFold = (id: string, collapsed: boolean) => {
    const d = docRef.current;
    if (!d) return;
    safe(() => commit(ops.setSubtreeCollapsed(d, id, collapsed)));
  };

  // ---------- 查找 / 替换 ----------

  const openSearch = (mode: SearchMode) => {
    if (editingRef.current) commitEdit();
    if (view !== "map") setView("map");
    setSearch((s) => ({ mode: readOnly ? "find" : mode, n: (s?.n ?? 0) + 1 }));
  };

  const closeSearch = () => {
    setSearch(null);
    focusCapture();
  };

  /** 跳到匹配项:折叠在里面的先展开祖先,再选中并滚动到可见 */
  const jumpTo = (id: string) => {
    const d = docRef.current;
    if (!d) return;
    const next = ops.revealTopic(d, id);
    if (next !== d) commit(next);
    setSelection([id]);
    requestAnimationFrame(() => reveal(id));
  };

  const replaceIn = (ids: string[], find: string, replacement: string, caseSensitive: boolean) => {
    const d = docRef.current;
    if (!d || readOnly) return;
    safe(() => {
      const next = ops.replaceText(d, ids, find, replacement, caseSensitive);
      commit(next);
      if (ids.length > 1) notify(t("replaced", ids.filter((id) => getTopic(next, id) !== getTopic(d, id)).length));
    });
  };

  // ---------- 导出 ----------

  const exportAs = async (format: ExportFormat) => {
    const d = docRef.current;
    const s = sceneRef.current;
    if (!d || !s) return;
    const name = fileName.current;
    if (format === "md") {
      const lost = markdownLosses(d);
      host.post({ type: "export", format, data: toMarkdown(d), encoding: "utf8", defaultName: `${name}.md`, note: lost.length ? t("exportLost", lost.join("、")) : undefined });
      return;
    }
    if (view !== "map") setView("map");
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    const world = rootRef.current?.querySelector(".wm-world") as SVGGElement | null;
    if (!world) return;
    const { svg, w, h } = buildSvg(world, s.palette.background);
    if (format === "svg") host.post({ type: "export", format, data: svg, encoding: "utf8", defaultName: `${name}.svg` });
    else host.post({ type: "export", format, data: await svgToPngBase64(svg, w, h, 2), encoding: "base64", defaultName: `${name}.png` });
  };

  const openLink = (id: string) => {
    const tp = docRef.current && getTopic(docRef.current, id);
    if (tp?.link) host.post({ type: "openLink", target: tp.link });
  };

  // ---------- 剪贴板 ----------

  useEffect(() => {
    const inField = (e: Event) => {
      const el = e.target as HTMLElement | null;
      if (!el || !rootRef.current?.contains(el)) return true; // 不是本界面的事件,不处理
      return el !== captureRef.current && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
    };
    const onCopy = (e: ClipboardEvent, cut: boolean) => {
      const d = docRef.current;
      if (!d || editingRef.current || inField(e) || view !== "map") return;
      const topics = ops.copyTopics(d, selectedTopics());
      if (!topics.length) return;
      e.preventDefault();
      const plain = topics.map((tp) => outlineText(tp, 0)).join("");
      e.clipboardData?.setData("text/plain", plain);
      clip.current = { text: plain, topics };
      if (cut && !readOnly) remove();
    };
    const onPaste = (e: ClipboardEvent) => {
      const d = docRef.current;
      if (!d || editingRef.current || inField(e) || readOnly || view !== "map") return;
      const text = e.clipboardData?.getData("text/plain") ?? "";
      let topics: Topic[] | null = null;
      if (clip.current && text === clip.current.text) topics = clip.current.topics;
      else if (text.trim()) topics = textToTopics(text);
      if (!topics?.length) return;
      e.preventDefault();
      const ids = selectedTopics();
      const parentId = ids.length ? ids[ids.length - 1] : d.root.id;
      safe(() => {
        const r = ops.pasteTopics(d, parentId, topics!);
        commit(r.doc, r.ids);
      });
    };
    const c = (e: ClipboardEvent) => onCopy(e, false);
    const x = (e: ClipboardEvent) => onCopy(e, true);
    document.addEventListener("copy", c);
    document.addEventListener("cut", x);
    document.addEventListener("paste", onPaste);
    return () => {
      document.removeEventListener("copy", c);
      document.removeEventListener("cut", x);
      document.removeEventListener("paste", onPaste);
    };
  });

  // ---------- 宿主消息 ----------

  const runCommand = (c: HostCommand) => {
    if (c === "undo") undo();
    else if (c === "redo") redo();
    else if (c === "zoomIn") zoom(1.2);
    else if (c === "zoomOut") zoom(1 / 1.2);
    else if (c === "fit") fit();
    else if (c === "export") exportAs("png");
    else if (c === "find" || c === "replace") openSearch(c);
  };
  const runRef = useRef(runCommand);
  runRef.current = runCommand;
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    const off = host.subscribe((m: InMsg) => {
      if (m.type === "init") {
        setLang(m.lang);
        setHostKind(m.host);
        fileName.current = m.fileName;
        loadRef.current(m.text, true);
      } else if (m.type === "update") loadRef.current(m.text, false);
      else if (m.type === "command") runRef.current(m.command);
    });
    host.post({ type: "ready" });
    const mo = new MutationObserver(() => setDark(detectDark()));
    mo.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    return () => {
      off();
      mo.disconnect();
    };
  }, []);

  // ---------- 键盘 ----------

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editingRef.current || view !== "map") return;
      const tgt = e.target as HTMLElement;
      if (!rootRef.current?.contains(tgt)) return;
      if (tgt !== captureRef.current && (tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA" || tgt.tagName === "SELECT" || tgt.isContentEditable)) return;
      if (e.isComposing || e.key === "Process") return;
      const mod = isMac ? e.metaKey : e.ctrlKey;
      const d = docRef.current;
      if (!d) return;
      const key = e.key;
      const handled = () => {
        e.preventDefault();
        e.stopPropagation();
      };
      // VS Code 里撤销 / 缩放 / 查找由宿主命令转发;浏览器预览里自己处理
      if (hostKind === "preview") {
        if (mod && !e.altKey && key.toLowerCase() === "f") return handled(), openSearch("find");
        // Mac 上 ⌘H 是系统「隐藏窗口」,替换用 Ctrl+H 或 ⌘⌥F
        if ((e.ctrlKey && !e.metaKey && key.toLowerCase() === "h") || (isMac && e.metaKey && e.altKey && e.code === "KeyF")) return handled(), openSearch("replace");
      }
      if (mod && hostKind === "preview") {
        const k = key.toLowerCase();
        if (k === "z" && !e.shiftKey) return handled(), undo();
        if ((k === "z" && e.shiftKey) || k === "y") return handled(), redo();
        if (k === "=" || k === "+") return handled(), zoom(1.2);
        if (k === "-") return handled(), zoom(1 / 1.2);
        if (k === "0") return handled(), fit();
      }
      if (mod && key.toLowerCase() === "a") {
        handled();
        setSelection([...(sceneRef.current?.layout.nodes.keys() ?? [])].filter((id) => sceneRef.current!.topics.has(id)));
        return;
      }
      if (mod && key === "/") return handled(), toggleFold(selectedTopics());
      if (mod && (key === "ArrowUp" || key === "ArrowDown")) {
        const id = selectedTopics()[0];
        if (id && !readOnly) {
          handled();
          commit(ops.moveSibling(d, id, key === "ArrowUp" ? -1 : 1));
        }
        return;
      }
      if (mod || e.altKey) return;
      switch (key) {
        case "Enter":
          handled();
          if (linkingFrom) return;
          addTopic(e.shiftKey ? "before" : "sibling");
          return;
        case "Tab":
          handled();
          addTopic(e.shiftKey ? "parent" : "child");
          return;
        case "Delete":
        case "Backspace":
          handled();
          remove();
          return;
        case "F2":
          handled();
          if (selRef.current.length === 1) startEdit(selRef.current[0]);
          return;
        case " ":
          handled();
          if (!e.repeat) spaceHeld.current = { down: true, used: false };
          return;
        case "Escape":
          handled();
          if (linkingFrom) setLinkingFrom(null);
          else if (search) closeSearch();
          else setSelection([]);
          return;
        case "ArrowUp":
          return handled(), navigate(0, -1);
        case "ArrowDown":
          return handled(), navigate(0, 1);
        case "ArrowLeft":
          return handled(), navigate(-1, 0);
        case "ArrowRight":
          return handled(), navigate(1, 0);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key !== " " || !spaceHeld.current.down) return;
      if (!rootRef.current?.contains(e.target as Node)) return;
      const used = spaceHeld.current.used;
      spaceHeld.current = { down: false, used: false };
      if (!used && !editingRef.current && selRef.current.length === 1) startEdit(selRef.current[0]);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
    };
  });

  useEffect(() => {
    if (!editing) focusCapture();
  }, [doc === null, view]);

  // ---------- 画布回调 ----------

  const canvasApi: CanvasApi = {
    select(ids, mode = "replace") {
      if (editingRef.current) commitEdit();
      if (mode === "replace") setSelection(ids);
      else if (mode === "add") setSelection([...new Set([...selRef.current, ...ids])]);
      else {
        const s = new Set(selRef.current);
        for (const id of ids) s.has(id) ? s.delete(id) : s.add(id);
        setSelection([...s]);
      }
    },
    startEdit: (id) => startEdit(id),
    toggleFold: (id) => toggleFold([id]),
    openLink,
    openNote(id) {
      setSelection([id]);
      setPanel(true);
      setPanelFocus({ field: "note", n: Date.now() });
    },
    drop(ids: string[], target: DropTarget) {
      const d = docRef.current;
      if (!d) return;
      safe(() => {
        if (target.type === "child") commit(ops.moveMany(d, ids, target.parentId), ids);
        else if (target.type === "sibling") commit(ops.moveMany(d, ids, target.parentId, target.index), ids);
        else commit(ops.toFloating(d, ids[0], target.pos), ids);
      });
    },
    addFloating(pos: Point) {
      const d = docRef.current;
      if (!d) return;
      const r = ops.addFloating(d, { x: pos.x - 40, y: pos.y - 16 }, { text: t("newFloating") });
      commit(r.doc, [r.id]);
      requestAnimationFrame(() => startEdit(r.id));
    },
    createRelationship(from, to) {
      const d = docRef.current;
      if (!d) return;
      if (!prefs.showRelationships) setPrefs({ showRelationships: true });
      safe(() => {
        const r = ops.addRelationship(d, from, to);
        commit(r.doc, [r.id]);
      });
    },
    setControls(relId, controls, done) {
      const d = docRef.current;
      if (!d || !done) return;
      commit(ops.updateRelationship(d, relId, { controls }));
    },
    cancelLinking: () => setLinkingFrom(null),
    focusCapture,
    contextMenu(id, x, y) {
      if (editingRef.current) commitEdit();
      setCtxMenu({ id, x, y });
    },
  };

  const actions: Actions | null = doc
    ? {
        doc,
        selection,
        readOnly,
        dark,
        apply: (fn, select) => {
          const d = docRef.current;
          if (d) safe(() => commit(fn(d), select));
        },
        select: setSelection,
        addTopic,
        remove,
        startLinking,
        addRange,
        undo,
        redo,
        canUndo: history.current.canUndo,
        canRedo: history.current.canRedo,
        exportAs,
        openLink,
        notify,
      }
    : null;

  // ---------- 渲染 ----------

  if (error) {
    return (
      <div className="wm-root wm-error" ref={rootRef}>
        <div className="wm-error-card">
          <div className="wm-error-icon">
            <Icon.warn />
          </div>
          <h2>{t("parseError")}</h2>
          <p className="wm-error-pos">{t("parseErrorAt", error.line, error.column)}</p>
          <pre>{error.message}</pre>
          <p>{t("parseErrorHint")}</p>
          {hostKind === "vscode" && (
            <button className="wm-btn wm-btn-primary" onClick={() => host.post({ type: "openText" })}>
              {t("openAsText")}
            </button>
          )}
        </div>
      </div>
    );
  }
  if (!doc || !scene || !actions) return <div className="wm-root wm-loading" ref={rootRef} />;

  // 文字输入框:编辑时显示在节点上;不编辑时透明地停在选中节点上,接收快捷键和输入法输入
  const v = viewport;
  const targetId = editing?.id ?? (selection.length === 1 ? selection[0] : null);
  let edStyle: React.CSSProperties = { left: -9999, top: 0 };
  if (targetId && view === "map") {
    const box = scene.layout.nodes.get(targetId);
    const st = scene.styles.get(targetId);
    if (box && st) {
      edStyle = {
        left: box.x * v.k + v.x,
        top: box.y * v.k + v.y,
        minWidth: box.w * v.k,
        minHeight: box.h * v.k,
        fontFamily: st.fontFamily,
        fontSize: st.fontSize * v.k,
        fontWeight: st.bold ? 600 : 400,
        fontStyle: st.italic ? "italic" : undefined,
        lineHeight: 1.4,
        padding: `${st.padY * v.k}px ${st.padX * v.k}px`,
        color: st.fill === "none" ? st.textColor : st.textColor,
        background: st.fill === "none" ? scene.palette.background : st.fill,
        borderRadius: 6 * v.k,
      };
    } else {
      const rel = doc.relationships?.find((r) => r.id === targetId);
      const g = scene.layout.boundaries.find((b) => b.id === targetId);
      let p: Point | null = null;
      if (rel) {
        const a = scene.layout.nodes.get(rel.from);
        const b = scene.layout.nodes.get(rel.to);
        if (a && b) {
          const geo = relationshipGeom(a, b, rel.controls);
          p = { x: geo.mid.x - 60, y: geo.mid.y - 12 };
        }
      } else if (g) p = { x: g.x, y: g.y - 2 };
      if (p) {
        edStyle = {
          left: p.x * v.k + v.x,
          top: p.y * v.k + v.y,
          minWidth: 120 * v.k,
          fontSize: 13 * v.k,
          padding: `${3 * v.k}px ${8 * v.k}px`,
          color: scene.palette.text,
          background: scene.palette.background,
          borderRadius: 6,
        };
      }
    }
  }

  return (
    <div className={"wm-root wm-app" + (dark ? " wm-dark" : "")} ref={rootRef}>
      <Toolbar actions={actions} view={view} setView={setView} panel={panel} togglePanel={() => setPanel((p) => (localStorage.setItem("wmind-panel", p ? "0" : "1"), !p))} laser={laser} toggleLaser={() => setLaser((l) => !l)} prefs={prefs} setPrefs={setPrefs} openSearch={() => openSearch("find")} />
      <div className="wm-main">
        <div className="wm-stage">
          {issues.length > 0 && (
            <div className="wm-issues">
              <div className="wm-issues-head">
                <Icon.warn />
                <span>{readOnly ? t("readOnly") + " · " : ""}{t("issues", issues.length)}</span>
                <button className="wm-link-btn" onClick={() => setShowIssues((s) => !s)}>
                  {showIssues ? t("hide") : t("show")}
                </button>
              </div>
              {showIssues && (
                <ul>
                  {issues.map((i, k) => (
                    <li key={k}>{i.message}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {view === "map" ? (
            <Canvas
              doc={doc}
              scene={scene}
              selection={selection}
              linkingFrom={linkingFrom}
              readOnly={readOnly}
              viewport={viewport}
              setViewport={setViewport}
              onSize={onSize}
              spaceHeld={spaceHeld}
              api={canvasApi}
              showBranches={prefs.showBranches}
              showRelationships={prefs.showRelationships}
              matches={found.ids}
              currentMatch={found.current}
            />
          ) : (
            <Outline actions={actions} />
          )}
          {laser && view === "map" && <Laser onExit={exitLaser} />}
          {search && view === "map" && (
            <SearchBar
              doc={doc}
              readOnly={readOnly}
              mode={search.mode}
              focusN={search.n}
              setMode={(mode) => setSearch((s) => ({ mode, n: (s?.n ?? 0) + 1 }))}
              onClose={closeSearch}
              onJump={jumpTo}
              onMatches={(ids, current) => setFound({ ids: new Set(ids), current })}
              onReplace={replaceIn}
            />
          )}
          {ctxMenu && view === "map" && (() => {
            const tp = getTopic(doc, ctxMenu.id);
            const kids = !!tp?.children?.length;
            return (
              <ContextMenu
                x={ctxMenu.x}
                y={ctxMenu.y}
                onClose={closeCtxMenu}
                items={[
                  { icon: <Icon.expand />, label: t("expandSubtree"), disabled: readOnly || !kids, run: () => setSubtreeFold(ctxMenu.id, false) },
                  { icon: <Icon.collapse />, label: t("collapseSubtree"), disabled: readOnly || !kids, run: () => setSubtreeFold(ctxMenu.id, true) },
                ]}
              />
            );
          })()}
          <textarea
            ref={captureRef}
            className={"wm-editor" + (editing ? " wm-editing" : "")}
            style={edStyle}
            value={editing ? editing.value : ""}
            spellCheck={false}
            aria-label="topic text"
            onCompositionStart={() => {
              composing.current = true;
              if (!editingRef.current && targetId && !readOnly) setEditing({ id: targetId, value: "", selectAll: false });
            }}
            onCompositionEnd={() => (composing.current = false)}
            onChange={(e) => {
              const val = e.target.value;
              if (editingRef.current) setEditing({ ...editingRef.current, value: val });
              else if (targetId && !readOnly && val) setEditing({ id: targetId, value: val, selectAll: false });
            }}
            onKeyDown={(e) => {
              if (!editingRef.current) return;
              e.stopPropagation();
              if (e.nativeEvent.isComposing || composing.current) return;
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                commitEdit();
              } else if (e.key === "Escape") {
                e.preventDefault();
                commitEdit();
              } else if (e.key === "Tab") {
                e.preventDefault();
                commitEdit(getTopic(doc, editingRef.current.id) ? "child" : undefined);
              }
            }}
            onBlur={() => {
              if (editingRef.current) commitEdit();
            }}
          />
          {view === "map" && (
            <div className="wm-zoom">
              <button title={t("zoomOut")} onClick={() => zoom(1 / 1.2)}>
                <Icon.minus />
              </button>
              <button className="wm-zoom-pct" title={t("fit")} onClick={fit}>
                {Math.round(viewport.k * 100)}%
              </button>
              <button title={t("zoomIn")} onClick={() => zoom(1.2)}>
                <Icon.plus />
              </button>
            </div>
          )}
          {toast && <div className="wm-toast">{toast}</div>}
        </div>
        {panel && <FormatPanel actions={actions} scene={scene} focus={panelFocus} onClose={() => setPanel(false)} />}
      </div>
    </div>
  );
}

/** 复制到剪贴板的纯文本:缩进列表 */
function outlineText(tp: Topic, depth: number): string {
  let s = "  ".repeat(depth) + "- " + tp.text.replace(/\n/g, " ") + "\n";
  for (const c of tp.children ?? []) s += outlineText(c, depth + 1);
  return s;
}
