// 浏览器预览宿主:用 localStorage 模拟文件,并暴露测试钩子模拟外部修改
import type { Host, InMsg } from "./host";
import { SAMPLE } from "./sample";

const STORE_KEY = "wmind-preview";

export function previewHost(): Host {
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
        setTimeout(() => emit({ type: "init", text, lang, fileName: "preview", host: "preview" }));
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
