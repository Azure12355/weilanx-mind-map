// 大纲视图:可编辑的缩进列表,快捷键与画布一致(Enter 同级、Tab 缩进、Shift+Tab 反缩进)
import { useEffect, useRef, useState } from "react";
import * as ops from "../../src/core/ops";
import { indexDoc } from "../../src/core/query";
import type { MindDoc, Topic } from "../../src/core/types";
import type { Actions } from "./App";
import { t } from "./i18n";

interface Row {
  topic: Topic;
  depth: number;
}

function flatten(doc: MindDoc): Row[] {
  const rows: Row[] = [];
  const visit = (tp: Topic, depth: number) => {
    rows.push({ topic: tp, depth });
    if (!tp.collapsed) for (const c of tp.children ?? []) visit(c, depth + 1);
  };
  visit(doc.root, 0);
  for (const f of doc.floating ?? []) visit(f, 0);
  return rows;
}

export function Outline({ actions: a }: { actions: Actions }) {
  const rows = flatten(a.doc);
  const refs = useRef(new Map<string, HTMLTextAreaElement>());
  const [focusId, setFocusId] = useState<string | null>(a.selection[0] ?? a.doc.root.id);
  const pendingFocus = useRef<{ id: string; caret: "end" | "all" } | null>(null);

  useEffect(() => {
    const p = pendingFocus.current;
    if (!p) return;
    const el = refs.current.get(p.id);
    if (!el) return;
    pendingFocus.current = null;
    el.focus();
    if (p.caret === "all") el.select();
    else el.setSelectionRange(el.value.length, el.value.length);
  });

  const focusRow = (id: string, caret: "end" | "all" = "end") => {
    pendingFocus.current = { id, caret };
    setFocusId(id);
    a.select([id]);
  };

  return (
    <div className="wm-outline">
      <div className="wm-outline-inner">
        {rows.map(({ topic, depth }, i) => (
          <OutlineRow
            key={topic.id}
            topic={topic}
            depth={depth}
            isRoot={topic.id === a.doc.root.id}
            active={focusId === topic.id}
            readOnly={a.readOnly}
            setRef={(el) => (el ? refs.current.set(topic.id, el) : refs.current.delete(topic.id))}
            onFocus={() => {
              setFocusId(topic.id);
              a.select([topic.id]);
            }}
            onToggle={() => a.apply((d) => ops.toggleCollapsed(d, topic.id))}
            onCommit={(text) => a.apply((d) => ops.setText(d, topic.id, text))}
            onKey={(e, draft) => {
              const d = a.doc;
              const commitText = (doc: MindDoc) => (draft !== topic.text ? ops.setText(doc, topic.id, draft) : doc);
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                const e2 = indexDoc(d).get(topic.id)!;
                const r = e2.parent ? ops.addSibling(commitText(d), topic.id, false, { text: "" }) : ops.addChild(commitText(d), topic.id, { text: "" }, 0);
                a.apply(() => r.doc, [r.id]);
                focusRow(r.id);
              } else if (e.key === "Tab") {
                e.preventDefault();
                a.apply((doc) => (e.shiftKey ? ops.outdent(commitText(doc), topic.id) : ops.indent(commitText(doc), topic.id)));
                focusRow(topic.id);
              } else if (e.key === "Backspace" && draft === "" && topic.id !== d.root.id && !topic.children?.length) {
                e.preventDefault();
                const prev = rows[i - 1]?.topic.id ?? d.root.id;
                a.apply((doc) => ops.remove(doc, topic.id), [prev]);
                focusRow(prev);
              } else if (e.key === "ArrowUp" && !e.nativeEvent.isComposing) {
                const el = e.currentTarget;
                if (el.selectionStart === 0 || !el.value.slice(0, el.selectionStart).includes("\n")) {
                  e.preventDefault();
                  const prev = rows[i - 1];
                  if (prev) focusRow(prev.topic.id);
                }
              } else if (e.key === "ArrowDown" && !e.nativeEvent.isComposing) {
                const el = e.currentTarget;
                if (!el.value.slice(el.selectionEnd).includes("\n")) {
                  e.preventDefault();
                  const next = rows[i + 1];
                  if (next) focusRow(next.topic.id);
                }
              } else if ((e.metaKey || e.ctrlKey) && e.key === "/") {
                e.preventDefault();
                a.apply((doc) => ops.toggleCollapsed(doc, topic.id));
              }
            }}
          />
        ))}
      </div>
    </div>
  );
}

function OutlineRow({
  topic,
  depth,
  isRoot,
  active,
  readOnly,
  setRef,
  onFocus,
  onToggle,
  onCommit,
  onKey,
}: {
  topic: Topic;
  depth: number;
  isRoot: boolean;
  active: boolean;
  readOnly: boolean;
  setRef: (el: HTMLTextAreaElement | null) => void;
  onFocus: () => void;
  onToggle: () => void;
  onCommit: (text: string) => void;
  onKey: (e: React.KeyboardEvent<HTMLTextAreaElement>, draft: string) => void;
}) {
  const [draft, setDraft] = useState(topic.text);
  useEffect(() => setDraft(topic.text), [topic.text]);
  const hasKids = !!topic.children?.length;
  return (
    <div className={"wm-orow" + (isRoot ? " wm-orow-root" : "") + (active ? " wm-active" : "")} style={{ paddingLeft: 8 + depth * 22 }}>
      <button className={"wm-obullet" + (hasKids ? " wm-has-kids" : "") + (topic.collapsed ? " wm-collapsed" : "")} onClick={hasKids ? onToggle : undefined} tabIndex={-1}>
        <span />
      </button>
      <textarea
        ref={setRef}
        className="wm-otext"
        rows={1}
        value={draft}
        readOnly={readOnly}
        placeholder={t("emptyText")}
        onFocus={onFocus}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => draft !== topic.text && onCommit(draft)}
        onKeyDown={(e) => onKey(e, draft)}
      />
    </div>
  );
}
