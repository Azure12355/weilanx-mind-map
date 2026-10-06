// 画布 ↔ 宿主 的消息桥。VS Code 里走 acquireVsCodeApi;浏览器预览(npm run dev:web / 无头测试)时用 localStorage 模拟
import { SAMPLE } from "./sample";

export type OutMsg =
  | { type: "ready" }
  | { type: "edit"; text: string }
  | { type: "export"; format: "png" | "svg" | "md"; data: string; encoding: "base64" | "utf8"; defaultName: string; note?: string }
  | { type: "openLink"; target: string }
  | { type: "openText" }
  | { type: "notify"; level: "info" | "warn" | "error"; message: string };

export type HostCommand = "undo" | "redo" | "zoomIn" | "zoomOut" | "fit" | "export";

export type InMsg =
  | { type: "init"; text: string; lang: string; fileName: string; inVsCode: boolean }
  | { type: "update"; text: string }
  | { type: "command"; command: HostCommand };

export interface Host {
  post(msg: OutMsg): void;
  subscribe(handler: (msg: InMsg) => void): () => void;
}

interface VsCodeApi {
  postMessage(msg: unknown): void;
}

declare global {
  interface Window {
    acquireVsCodeApi?: () => VsCodeApi;
    /** 预览模式下给测试脚本用:模拟外部修改文件 */
    __wmindExternalEdit?: (text: string) => void;
    __wmindText?: () => string;
  }
}

const STORE_KEY = "wmind-preview";

function previewHost(): Host {
  const handlers = new Set<(m: InMsg) => void>();
  const emit = (m: InMsg) => handlers.forEach((h) => h(m));
  let text = localStorage.getItem(STORE_KEY) ?? SAMPLE;
  if (new URLSearchParams(location.search).has("reset")) text = SAMPLE;
  window.__wmindExternalEdit = (t) => {
    text = t;
    localStorage.setItem(STORE_KEY, t);
    emit({ type: "update", text: t });
  };
  window.__wmindText = () => text;
  return {
    post(msg) {
      if (msg.type === "ready") {
        const lang = new URLSearchParams(location.search).get("lang") ?? navigator.language;
        setTimeout(() => emit({ type: "init", text, lang, fileName: "preview", inVsCode: false }));
      } else if (msg.type === "edit") {
        text = msg.text;
        localStorage.setItem(STORE_KEY, text);
      } else if (msg.type === "export") {
        const a = document.createElement("a");
        const mime = msg.format === "png" ? "image/png" : msg.format === "svg" ? "image/svg+xml" : "text/markdown";
        a.href = msg.encoding === "base64" ? `data:${mime};base64,${msg.data}` : URL.createObjectURL(new Blob([msg.data], { type: mime }));
        a.download = msg.defaultName;
        a.click();
      } else if (msg.type === "openLink") {
        window.open(msg.target, "_blank");
      } else {
        console.log("[preview]", msg);
      }
    },
    subscribe(h) {
      handlers.add(h);
      return () => handlers.delete(h);
    },
  };
}

function vscodeHost(api: VsCodeApi): Host {
  return {
    post: (msg) => api.postMessage(msg),
    subscribe(handler) {
      const listener = (e: MessageEvent) => handler(e.data as InMsg);
      window.addEventListener("message", listener);
      return () => window.removeEventListener("message", listener);
    },
  };
}

let host: Host | null = null;
export function getHost(): Host {
  return (host ??= window.acquireVsCodeApi ? vscodeHost(window.acquireVsCodeApi()) : previewHost());
}
