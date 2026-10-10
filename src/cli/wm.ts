// wm:给 Agent 用的 .wmind 命令行。与插件共用 core,写出的格式逐字节一致。
// 用法见 HELP,或 skills/weilanx-mind-map/SKILL.md
import * as fs from "fs";
import * as path from "path";
import { newDoc, parse, serialize, styleValueOk } from "../core/doc";
import * as ops from "../core/ops";
import { fromMarkdown, toMarkdown } from "../core/markdown";
import { outline, resolveRef, RefError, search, topicPath } from "../core/query";
import { markerDef } from "../core/markers";
import { THEMES } from "../core/theme";
import { FILL_STYLES, FillStyle, Look, LOOKS, MindDoc, STRUCTURES, Structure, Style, Topic } from "../core/types";

const HELP = `wm — 读写 .wmind 思维导图(纯 JSON)

读取
  wm outline  <file> [--ids] [--depth N] [--json]   缩进大纲(含标记/标签/备注摘要)
  wm find     <file> <关键词>                         匹配节点的 id 与路径
  wm to-md    <file>                                  导出 Markdown 大纲
  wm validate <file>                                  校验,有问题时退出码为 1

修改(<ref> 可以是节点 id,也可以是从中心主题开始的路径,如 "产品规划/用户调研")
  wm new      <file> <中心主题>                        新建导图
  wm add      <file> --parent <ref> <文本>... [--index N]   添加子节点,打印新 id;文本里 \\n 表示换行
  wm set      <file> <ref> [--text T] [--style k=v]... [--marker m]... [--label l]...
                           [--note T] [--link URL] [--collapsed true|false] [--structure logic|org|tree]
  wm unset    <file> <ref> [--style k]... [--marker m]... [--label l]... [--note] [--link] [--structure] [--all-style]
  wm move     <file> <ref> --parent <ref> [--index N]
  wm rm       <file> <ref>...
  wm rel      <file> <from-ref> <to-ref> [--text T]     添加联系线
  wm summary  <file> <ref>... [--text T]                给同一父节点下的几个兄弟加概括
  wm boundary <file> <ref>... [--text T]                给同一父节点下的几个兄弟加外框
  wm doc      <file> [--theme 名称] [--look standard|hand] [--fill hachure|cross-hatch|solid|dots|dashed|zigzag|none] [--structure map|logic|org|tree]
  wm from-md  <md 文件> -o <file> [--title 中心主题]    Markdown 大纲 → 导图

样式键:shape fill border borderWidth textColor fontSize bold italic strike lineColor lineWidth lineStyle fillStyle textAlign
主题:${THEMES.map((t) => t.id).join(" ")}
标记:priority-1..9  task-0/25/50/75/100  flag-<色>  star-<色>  smiley-happy/laugh/sad/angry/surprised
      symbol-question/exclamation/check/cross/idea   (色:red orange yellow green blue purple)`;

class UsageError extends Error {}

interface Args {
  pos: string[];
  flags: Map<string, string[]>;
}

const BOOL_FLAGS = new Set(["ids", "json", "note", "link", "structure", "all-style"]);

function parseArgs(argv: string[], boolFlags = BOOL_FLAGS): Args {
  const pos: string[] = [];
  const flags = new Map<string, string[]>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      let key = a.slice(2);
      let val: string;
      if (eq > 0) {
        key = a.slice(2, eq);
        val = a.slice(eq + 1);
      } else if (boolFlags.has(key) && (i + 1 >= argv.length || argv[i + 1].startsWith("--"))) {
        val = "";
      } else {
        if (i + 1 >= argv.length) throw new UsageError(`--${key} 缺少值`);
        val = argv[++i];
      }
      if (!flags.has(key)) flags.set(key, []);
      flags.get(key)!.push(val);
    } else if (a === "-o") {
      if (i + 1 >= argv.length) throw new UsageError("-o 缺少值");
      flags.set("o", [argv[++i]]);
    } else pos.push(a);
  }
  return { pos, flags };
}

const one = (a: Args, k: string) => a.flags.get(k)?.[a.flags.get(k)!.length - 1];
const many = (a: Args, k: string) => a.flags.get(k) ?? [];
const unescape = (s: string) => s.replace(/\\n/g, "\n");

function load(file: string): MindDoc {
  if (!fs.existsSync(file)) throw new UsageError(`文件不存在:${file}`);
  const r = parse(fs.readFileSync(file, "utf8"));
  if (!r.doc) throw new Error(`${file} 不是合法 JSON(第 ${r.error!.line} 行第 ${r.error!.column} 列):${r.error!.message}`);
  if (r.readOnly) throw new Error(r.issues[0].message);
  return r.doc;
}

function save(file: string, doc: MindDoc) {
  fs.writeFileSync(file, serialize(doc), "utf8");
}

function parseValue(v: string): unknown {
  if (v === "true") return true;
  if (v === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return v;
}

function parseStyle(pairs: string[]): Style {
  const style: Style = {};
  for (const p of pairs) {
    const i = p.indexOf("=");
    if (i <= 0) throw new UsageError(`--style 需要 k=v 形式:${p}`);
    const k = p.slice(0, i).trim();
    let v = parseValue(p.slice(i + 1).trim());
    if (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v)) v = v.toUpperCase();
    if (!styleValueOk(k, v)) throw new UsageError(`样式值非法:${k}=${p.slice(i + 1)}`);
    style[k] = v;
  }
  return style;
}

function checkMarker(m: string) {
  if (!markerDef(m)) throw new UsageError(`未知标记:${m}(运行 wm help 查看可用标记)`);
}

function ref(doc: MindDoc, r: string | undefined, what = "节点"): Topic {
  if (!r) throw new UsageError(`缺少${what}`);
  return resolveRef(doc, r);
}

function jsonTree(t: Topic): unknown {
  const o: Record<string, unknown> = { id: t.id, text: t.text };
  if (t.markers) o.markers = t.markers;
  if (t.labels) o.labels = t.labels;
  if (t.note) o.note = t.note;
  if (t.link) o.link = t.link;
  if (t.children?.length) o.children = t.children.map(jsonTree);
  return o;
}

function run(argv: string[]): number {
  const [cmd, ...rest] = argv;
  const out = (s: string) => process.stdout.write(s.endsWith("\n") ? s : s + "\n");
  if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") {
    out(HELP);
    return 0;
  }
  const a = parseArgs(rest);
  const file = a.pos[0];
  if (!file && cmd !== "help") throw new UsageError("缺少文件参数");

  switch (cmd) {
    case "outline": {
      const doc = load(file);
      if (a.flags.has("json")) out(JSON.stringify(jsonTree(doc.root), null, 2));
      else {
        const depth = one(a, "depth");
        out(outline(doc, { ids: a.flags.has("ids"), depth: depth === undefined ? undefined : Number(depth) }));
      }
      return 0;
    }
    case "find": {
      const doc = load(file);
      const kw = a.pos.slice(1).join(" ");
      if (!kw) throw new UsageError("缺少关键词");
      const hits = search(doc, kw);
      for (const h of hits) out(`${h.id}  ${topicPath(doc, h.id)}`);
      if (!hits.length) out("(没有匹配的节点)");
      return 0;
    }
    case "to-md":
      out(toMarkdown(load(file)));
      return 0;
    case "validate": {
      const text = fs.readFileSync(file, "utf8");
      const r = parse(text);
      if (!r.doc) {
        out(`✗ JSON 语法错误(第 ${r.error!.line} 行第 ${r.error!.column} 列):${r.error!.message}`);
        return 1;
      }
      const issues = r.issues;
      if (r.changed) issues.push({ level: "warn", message: "有节点缺少 id 或 id 重复,插件打开或下次用 wm 修改时会自动补全" });
      if (!issues.length) {
        out("✓ 没有问题");
        return 0;
      }
      for (const i of issues) out(`${i.level === "error" ? "✗" : "!"} ${i.message}`);
      return 1;
    }
    case "new": {
      if (fs.existsSync(file)) throw new UsageError(`文件已存在:${file}`);
      const title = a.pos.slice(1).join(" ") || path.basename(file, ".wmind");
      const doc = newDoc(unescape(title));
      save(file, doc);
      out(doc.root.id);
      return 0;
    }
    case "add": {
      let doc = load(file);
      const parent = ref(doc, one(a, "parent"), "--parent");
      const texts = a.pos.slice(1);
      if (!texts.length) throw new UsageError("缺少节点文本");
      const idxFlag = one(a, "index");
      let index = idxFlag === undefined ? undefined : Number(idxFlag);
      const ids: string[] = [];
      for (const text of texts) {
        const r = ops.addChild(doc, parent.id, { text: unescape(text) }, index);
        doc = r.doc;
        ids.push(r.id);
        if (index !== undefined) index++;
      }
      save(file, doc);
      out(ids.join("\n"));
      return 0;
    }
    case "set": {
      let doc = load(file);
      const t = ref(doc, a.pos[1]);
      const text = one(a, "text");
      if (text !== undefined) doc = ops.setText(doc, t.id, unescape(text));
      const style = many(a, "style");
      if (style.length) doc = ops.setStyle(doc, t.id, parseStyle(style));
      for (const m of many(a, "marker")) {
        checkMarker(m);
        doc = ops.addMarker(doc, t.id, m);
      }
      for (const l of many(a, "label")) doc = ops.addLabel(doc, t.id, l);
      const note = one(a, "note");
      if (note !== undefined) doc = ops.updateTopic(doc, t.id, { note: note ? unescape(note) : undefined });
      const link = one(a, "link");
      if (link !== undefined) doc = ops.updateTopic(doc, t.id, { link: link || undefined });
      const col = one(a, "collapsed");
      if (col !== undefined) doc = ops.setCollapsed(doc, t.id, col === "true");
      const look = one(a, "look");
      if (look !== undefined) {
        if (!LOOKS.includes(look as Look)) throw new UsageError(`未知画法:${look}`);
        doc = ops.setDocProp(doc, "look", look);
      }
      const st = one(a, "structure");
      if (st !== undefined) {
        if (st && !STRUCTURES.includes(st as Structure)) throw new UsageError(`未知结构:${st}`);
        doc = ops.updateTopic(doc, t.id, { structure: (st || undefined) as Structure | undefined });
      }
      save(file, doc);
      out(`✓ ${topicPath(doc, t.id)}`);
      return 0;
    }
    case "unset": {
      let doc = load(file);
      const t = ref(doc, a.pos[1]);
      if (a.flags.has("all-style")) doc = ops.clearStyle(doc, t.id);
      const keys = many(a, "style");
      if (keys.length) doc = ops.setStyle(doc, t.id, Object.fromEntries(keys.map((k) => [k, undefined])));
      for (const m of many(a, "marker")) doc = ops.removeMarker(doc, t.id, m);
      for (const l of many(a, "label")) doc = ops.removeLabel(doc, t.id, l);
      if (a.flags.has("note")) doc = ops.updateTopic(doc, t.id, { note: undefined });
      if (a.flags.has("link")) doc = ops.updateTopic(doc, t.id, { link: undefined });
      if (a.flags.has("structure")) doc = ops.updateTopic(doc, t.id, { structure: undefined });
      save(file, doc);
      out(`✓ ${topicPath(doc, t.id)}`);
      return 0;
    }
    case "move": {
      let doc = load(file);
      const t = ref(doc, a.pos[1]);
      const parent = ref(doc, one(a, "parent"), "--parent");
      const idx = one(a, "index");
      doc = ops.move(doc, t.id, parent.id, idx === undefined ? undefined : Number(idx));
      save(file, doc);
      out(`✓ ${topicPath(doc, t.id)}`);
      return 0;
    }
    case "rm": {
      let doc = load(file);
      const targets = a.pos.slice(1).map((r) => ref(doc, r));
      if (!targets.length) throw new UsageError("缺少要删除的节点");
      if (targets.some((t) => t.id === doc.root.id)) throw new UsageError("中心主题不能删除");
      const paths = targets.map((t) => topicPath(doc, t.id));
      doc = ops.remove(
        doc,
        targets.map((t) => t.id)
      );
      save(file, doc);
      for (const p of paths) out(`✓ 已删除 ${p}`);
      return 0;
    }
    case "rel": {
      let doc = load(file);
      const from = ref(doc, a.pos[1], "起点");
      const to = ref(doc, a.pos[2], "终点");
      const text = one(a, "text");
      const r = ops.addRelationship(doc, from.id, to.id, text ? { text: unescape(text) } : {});
      save(file, r.doc);
      out(r.id);
      return 0;
    }
    case "summary":
    case "boundary": {
      const doc = load(file);
      const ids = a.pos.slice(1).map((r) => ref(doc, r).id);
      const r = ops.addRange(doc, cmd === "summary" ? "summaries" : "boundaries", ids, one(a, "text") ?? (cmd === "summary" ? "概括" : undefined));
      if (!r) throw new UsageError("这些节点必须是同一个父节点下的兄弟节点");
      save(file, r.doc);
      out(r.id);
      return 0;
    }
    case "doc": {
      let doc = load(file);
      const theme = one(a, "theme");
      if (theme !== undefined) {
        if (!THEMES.some((t) => t.id === theme)) throw new UsageError(`未知主题:${theme}`);
        doc = ops.setDocProp(doc, "theme", theme);
      }
      const look = one(a, "look");
      if (look !== undefined) {
        if (!LOOKS.includes(look as Look)) throw new UsageError(`未知画法:${look}`);
        doc = ops.setDocProp(doc, "look", look);
      }
      const fill = one(a, "fill");
      if (fill !== undefined) {
        if (!FILL_STYLES.includes(fill as FillStyle)) throw new UsageError(`未知填充样式:${fill}`);
        doc = ops.setDocProp(doc, "fillStyle", fill);
      }
      const st = one(a, "structure");
      if (st !== undefined) {
        if (!STRUCTURES.includes(st as Structure)) throw new UsageError(`未知结构:${st}`);
        doc = ops.setDocProp(doc, "structure", st);
      }
      save(file, doc);
      out("✓");
      return 0;
    }
    case "from-md": {
      const target = one(a, "o");
      if (!target) throw new UsageError("缺少 -o <输出文件>");
      const md = fs.readFileSync(file, "utf8");
      const title = one(a, "title") ?? path.basename(file).replace(/\.(md|markdown)$/i, "");
      const doc = fromMarkdown(md, title);
      save(target, doc);
      out(`✓ 已生成 ${target}`);
      return 0;
    }
    default:
      throw new UsageError(`未知命令:${cmd}`);
  }
}

function main() {
  try {
    process.exitCode = run(process.argv.slice(2));
  } catch (err) {
    if (err instanceof RefError) {
      process.stderr.write(`✗ ${err.message}\n`);
      for (const c of err.candidates) process.stderr.write(`  ${c}\n`);
      process.exitCode = 1;
    } else if (err instanceof UsageError) {
      process.stderr.write(`✗ ${err.message}\n  运行 wm help 查看用法\n`);
      process.exitCode = 2;
    } else {
      process.stderr.write(`✗ ${(err as Error).message}\n`);
      process.exitCode = 1;
    }
  }
}

main();
