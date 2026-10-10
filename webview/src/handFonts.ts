// 手绘字体:Excalifont + 小赖分片按 unicode-range 注册,用到哪些字才加载哪些分片
import { SHARDS, type FontShard } from "./fonts";

const FAMILY: Record<FontShard["family"], string> = { Excalifont: "WM Excalifont", Xiaolai: "WM Xiaolai" };

let registered = false;

function register(): void {
  if (registered) return;
  registered = true;
  for (const s of SHARDS) {
    const face = new FontFace(FAMILY[s.family], `url("${s.url}") format("woff2")`, { unicodeRange: s.range, display: "block" });
    document.fonts.add(face);
  }
}

/** 加载这些文字用到的分片;返回是否有新分片加载完成(需要重新排版) */
export async function loadHandFonts(text: string): Promise<boolean> {
  register();
  const sample = text || "A";
  const fonts = Object.values(FAMILY).map((f) => `16px "${f}"`);
  if (fonts.every((f) => document.fonts.check(f, sample))) return false;
  await Promise.all(fonts.map((f) => document.fonts.load(f, sample).catch(() => [])));
  return true;
}

function parseRange(range: string): [number, number][] {
  return range.split(",").map((part) => {
    const [a, b] = part.replace(/^U\+/i, "").split("-");
    const lo = parseInt(a, 16);
    return [lo, b ? parseInt(b, 16) : lo];
  });
}

const parsed = new Map<FontShard, [number, number][]>();

function covers(s: FontShard, cp: number): boolean {
  let r = parsed.get(s);
  if (!r) parsed.set(s, (r = parseRange(s.range)));
  return r.some(([lo, hi]) => cp >= lo && cp <= hi);
}

async function toDataUrl(url: string): Promise<string> {
  if (url.startsWith("data:")) return url;
  const buf = new Uint8Array(await (await fetch(url)).arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return `data:font/woff2;base64,${btoa(bin)}`;
}

/** 导出用:只把这些文字用到的分片以 data URL 写进 @font-face */
export async function handFontCss(text: string): Promise<string> {
  const cps = new Set<number>();
  for (const ch of text) cps.add(ch.codePointAt(0)!);
  const used = SHARDS.filter((s) => [...cps].some((cp) => covers(s, cp)));
  const rules = await Promise.all(
    used.map(async (s) => `@font-face{font-family:"${FAMILY[s.family]}";src:url(${await toDataUrl(s.url)}) format("woff2");unicode-range:${s.range};}`),
  );
  return rules.join("");
}
