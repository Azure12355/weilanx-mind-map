// 查找 / 替换条:停在画布右上角,只匹配主题文字
import { useEffect, useMemo, useRef, useState } from "react";
import type { MindDoc } from "../../src/core/types";
import { findText } from "../../src/core/query";
import { Icon } from "./icons";
import { t } from "./i18n";

export type SearchMode = "find" | "replace";

interface Props {
  doc: MindDoc;
  readOnly: boolean;
  mode: SearchMode;
  /** 每次按快捷键都加一,用来重新聚焦并全选输入框 */
  focusN: number;
  setMode(m: SearchMode): void;
  onClose(): void;
  /** 跳到某个匹配项:展开祖先、选中、滚动到可见 */
  onJump(id: string): void;
  /** 命中的节点 id 和当前项,给画布高亮用 */
  onMatches(ids: string[], current: string | null): void;
  onReplace(ids: string[], find: string, replacement: string, caseSensitive: boolean): void;
}

export function SearchBar({ doc, readOnly, mode, focusN, setMode, onClose, onJump, onMatches, onReplace }: Props) {
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [index, setIndex] = useState(0);
  const findRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);

  const matches = useMemo(() => findText(doc, query, caseSensitive), [doc, query, caseSensitive]);
  const cur = matches.length ? Math.min(index, matches.length - 1) : -1;
  const curId = cur >= 0 ? matches[cur] : null;

  useEffect(() => {
    const el = mode === "replace" && query && !readOnly ? replaceRef.current : findRef.current;
    el?.focus();
    el?.select();
  }, [focusN, mode]);

  useEffect(() => onMatches(matches, curId), [matches, curId]);
  useEffect(() => () => onMatches([], null), []);

  // 改了查找条件就从第一个匹配开始;打字时稍等再跳,免得中间态把无关的折叠分支展开
  const typing = useRef(0);
  useEffect(() => () => window.clearTimeout(typing.current), []);
  const change = (q: string, cs: boolean) => {
    setQuery(q);
    setCaseSensitive(cs);
    setIndex(0);
    window.clearTimeout(typing.current);
    typing.current = window.setTimeout(() => {
      const first = findText(doc, q, cs)[0];
      if (first) onJump(first);
    }, 250);
  };

  const step = (delta: number) => {
    window.clearTimeout(typing.current);
    if (!matches.length) return;
    const i = (cur + delta + matches.length) % matches.length;
    setIndex(i);
    onJump(matches[i]);
  };

  const replaceOne = () => {
    if (readOnly || !curId) return;
    onReplace([curId], query, replacement, caseSensitive);
    // 替换后当前项通常不再匹配,下标自然落到下一项;替换内容里仍含查找词时手动前进
    const stays = caseSensitive ? replacement.includes(query) : replacement.toLowerCase().includes(query.toLowerCase());
    const n = stays ? matches.length : matches.length - 1;
    if (!n) return;
    const i = (stays ? cur + 1 : cur) % n;
    setIndex(i);
    const next = stays ? matches[(cur + 1) % matches.length] : matches.filter((id) => id !== curId)[i];
    if (next) onJump(next);
  };

  const replaceAll = () => {
    if (readOnly || !matches.length) return;
    onReplace(matches, query, replacement, caseSensitive);
    setIndex(0);
  };

  const keys = (e: React.KeyboardEvent, field: "find" | "replace") => {
    e.stopPropagation();
    if (e.nativeEvent.isComposing) return;
    const mod = e.metaKey || e.ctrlKey;
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (field === "replace") {
        if (mod) replaceAll();
        else replaceOne();
      } else step(e.shiftKey ? -1 : 1);
    } else if (mod && !e.altKey && e.key.toLowerCase() === "f") {
      e.preventDefault();
      setMode("find");
      findRef.current?.select();
    } else if ((e.ctrlKey && e.key.toLowerCase() === "h") || (e.metaKey && e.altKey && e.code === "KeyF")) {
      e.preventDefault();
      if (!readOnly) setMode("replace");
    }
  };

  const showReplace = mode === "replace" && !readOnly;
  const count = !query ? "" : matches.length ? `${cur + 1}/${matches.length}` : t("noMatch");

  return (
    <div className="wm-search" onPointerDown={(e) => e.stopPropagation()}>
      <button className={"wm-search-toggle" + (showReplace ? " wm-open" : "")} onClick={() => setMode(showReplace ? "find" : "replace")} disabled={readOnly} title={t("toggleReplace")}>
        <Icon.right />
      </button>
      <div className="wm-search-rows">
        <div className="wm-search-row">
          <div className="wm-search-input">
            <input ref={findRef} value={query} placeholder={t("findPlaceholder")} spellCheck={false} onChange={(e) => change(e.target.value, caseSensitive)} onKeyDown={(e) => keys(e, "find")} />
            <button className={"wm-search-case" + (caseSensitive ? " wm-active" : "")} onClick={() => change(query, !caseSensitive)} title={t("matchCase")}>
              Aa
            </button>
          </div>
          <span className={"wm-search-count" + (query && !matches.length ? " wm-none" : "")}>{count}</span>
          <button className="wm-search-btn" onClick={() => step(-1)} disabled={!matches.length} title={t("prevMatch")}>
            <Icon.up />
          </button>
          <button className="wm-search-btn" onClick={() => step(1)} disabled={!matches.length} title={t("nextMatch")}>
            <Icon.down />
          </button>
          <button className="wm-search-btn" onClick={onClose} title={t("closeFind")}>
            <Icon.close />
          </button>
        </div>
        {showReplace && (
          <div className="wm-search-row">
            <div className="wm-search-input">
              <input ref={replaceRef} value={replacement} placeholder={t("replacePlaceholder")} spellCheck={false} onChange={(e) => setReplacement(e.target.value)} onKeyDown={(e) => keys(e, "replace")} />
            </div>
            <button className="wm-search-text-btn" onClick={replaceOne} disabled={!curId}>
              {t("replace")}
            </button>
            <button className="wm-search-text-btn" onClick={replaceAll} disabled={!matches.length}>
              {t("replaceAll")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
