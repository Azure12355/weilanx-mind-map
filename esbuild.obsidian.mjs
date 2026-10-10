// Obsidian 插件打包:main.js(插件 + React 画布)、styles.css(主题映射 + 加作用域的共享样式)、manifest.json
// 用法:node esbuild.obsidian.mjs [--watch] [--out <dir>]
import esbuild from "esbuild";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const watch = args.includes("--watch");
const outDir = args.includes("--out") ? args[args.indexOf("--out") + 1] : "dist/obsidian";
fs.mkdirSync(outDir, { recursive: true });

/** 把共享样式包进 `body .wm-root { ... }`:共享样式里的 .wm-root 就是包裹层本身 */
function scopedCss() {
  const shared = fs.readFileSync("webview/src/style.css", "utf8").replace(/\.wm-root/g, "&");
  return `${fs.readFileSync("src/obsidian/theme.css", "utf8")}\nbody .wm-root {\n${shared}\n}\n`;
}

async function buildCss() {
  // esbuild 把 CSS 嵌套展开成普通选择器,兼容较老的手机 WebView
  const res = await esbuild.transform(scopedCss(), { loader: "css", target: ["chrome100", "safari15"] });
  fs.writeFileSync(path.join(outDir, "styles.css"), "/* Weilanx Mind Map */\n" + res.code);
}

function copyManifest() {
  fs.copyFileSync("manifest.json", path.join(outDir, "manifest.json"));
}

const ctx = await esbuild.context({
  entryPoints: ["src/obsidian/main.ts"],
  bundle: true,
  outfile: path.join(outDir, "main.js"),
  format: "cjs",
  platform: "browser",
  target: "es2020",
  jsx: "automatic",
  external: ["obsidian", "electron", "@codemirror/*", "@lezer/*"],
  define: { "process.env.NODE_ENV": JSON.stringify(watch ? "development" : "production") },
  minify: !watch,
  sourcemap: watch ? "inline" : false,
  logLevel: "info",
  // 手绘字体以 data URL 内联进 main.js
  loader: { ".css": "empty", ".woff2": "dataurl" },
});

if (watch) {
  await buildCss();
  copyManifest();
  await ctx.watch();
  fs.watch("webview/src/style.css", () => buildCss().catch(console.error));
  fs.watch("src/obsidian/theme.css", () => buildCss().catch(console.error));
} else {
  await ctx.rebuild();
  await ctx.dispose();
  await buildCss();
  copyManifest();
}
