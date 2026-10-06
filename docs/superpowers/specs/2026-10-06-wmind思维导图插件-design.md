# Weilanx Mind Map（.wmind 思维导图插件）设计

日期：2026-10-06
状态：设计已确认，待写实现计划

## 1. 目标与定位

做一个 VS Code 思维导图插件：

- 数据存储为纯 JSON 文件（扩展名 `.wmind`），本地 VS Code（及 Cursor、Windsurf）打开即是可视化画布。
- 文件对人和 Agent 都友好，**Agent 读取优先**：嵌套树结构，读一遍即可理解全图。
- 视觉与交互参照 XMind。
- 独立新项目，首期只做 VS Code；`core` 层与平台解耦，以后可扩展 Obsidian。
- 工程结构、技术栈、发布方式沿用兄弟项目 `vscode-base-table`（Weilanx Base Table）。

项目位置：`/Users/lytton/Creator/00-CODEBASE/vscode-mind-map`，插件名 `weilanx-mind-map`，publisher `weilanx`。

### 不做（YAGNI）

- `.xmind` 文件互转（需要时在 `core` 加转换器即可，不影响架构）
- 富文本（节点文字为纯文本，支持 `\n` 换行）
- 图片节点、附件、多画布（sheet）、演示模式、协同编辑
- Obsidian 版本、MCP Server

## 2. 文件格式

UTF-8 JSON，2 空格缩进，文件末尾一个换行。

### 2.1 顶层

```jsonc
{
  "$schema": "https://azure12355.github.io/weilanx-mind-map/wmind.schema.json", // 可选
  "version": 1,               // 必填，当前为 1
  "theme": "classic",         // 可选，默认 "classic"
  "structure": "map",         // 可选，默认 "map"；取值 map | logic | org | tree
  "root": Topic,              // 必填，中心主题
  "relationships": [ Relationship ], // 可选，空时省略
  "floating": [ Topic ]       // 可选，自由主题，空时省略
}
```

### 2.2 Topic

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | 6 位小写 base36，全文唯一。Agent 新增节点时可省略，插件加载时补全 |
| `text` | string | 必填，纯文本，`\n` 换行 |
| `children` | Topic[] | 可选，空时省略 |
| `collapsed` | boolean | 可选，仅为 `true` 时写出 |
| `structure` | string | 可选，覆盖该分支的结构（map 仅允许用于根） |
| `style` | Style | 可选，只写与主题默认值不同的键 |
| `markers` | string[] | 可选，标记 id，见 2.5 |
| `labels` | string[] | 可选，标签文本 |
| `note` | string | 可选，Markdown 备注 |
| `link` | string | 可选，`http(s)://` URL 或相对于该 `.wmind` 文件的工作区路径 |
| `summaries` | Summary[] | 可选，作用于本节点的子节点 |
| `boundaries` | Boundary[] | 可选，作用于本节点的子节点 |
| `position` | `{x, y}` | 仅自由主题使用，相对中心主题中心点的坐标 |

### 2.3 Summary / Boundary / Relationship

```jsonc
// Summary：概括（大括号 + 概括主题）
{ "id": "s1a2b3", "from": "<子节点id>", "to": "<子节点id>", "text": "概括", "style": { … } }
// Boundary：外框
{ "id": "b1a2b3", "from": "<子节点id>", "to": "<子节点id>", "text": "外框标题" } // text 可选
// Relationship：联系线，可连接任意两个主题（含自由主题）
{ "id": "r1a2b3", "from": "<主题id>", "to": "<主题id>", "text": "依赖",
  "controls": [{ "x": 0, "y": 0 }, { "x": 0, "y": 0 }], // 可选，两个控制点相对各自端点的偏移
  "style": { "lineColor": "#…", "lineStyle": "dashed" } }
```

- Summary / Boundary 的 `from`、`to` 必须是所属节点的直接子节点 id；顺序颠倒时自动纠正；可相同（只框一个子节点）。
- 用 id 而非下标，保证 Agent 插入兄弟节点后范围不错位。

### 2.4 Style

| 键 | 取值 |
|---|---|
| `fill` | `#RRGGBB` 或 `"none"` |
| `border` | `#RRGGBB` 或 `"none"` |
| `borderWidth` | 0–6 的数字（px） |
| `shape` | `rect` \| `rounded` \| `capsule` \| `ellipse` \| `underline` \| `none` |
| `textColor` | `#RRGGBB` |
| `fontSize` | 10–48 的数字 |
| `bold` / `italic` / `strike` | boolean |
| `lineColor` | `#RRGGBB`，该节点连向子节点的线 |
| `lineWidth` | 1–8 的数字 |
| `lineStyle` | `curve` \| `straight` \| `elbow`；联系线另支持 `dashed` \| `solid` |

最终样式 = 主题按层级（root / 一级分支 / 子主题 / 概括 / 自由主题）给出的默认值 ← 分支彩虹色 ← 节点 `style` 覆盖。

### 2.5 标记 id

格式为 `类别-值`，同一类别在一个节点上最多一个（后写的替换先写的）：

| 类别 | 取值 |
|---|---|
| `priority` | `priority-1` … `priority-9` |
| `task` | `task-0` `task-25` `task-50` `task-75` `task-100` |
| `flag` | `flag-red` `flag-orange` `flag-yellow` `flag-green` `flag-blue` `flag-purple` |
| `star` | `star-red` `star-orange` `star-yellow` `star-green` `star-blue` `star-purple` |
| `smiley` | `smiley-happy` `smiley-laugh` `smiley-sad` `smiley-angry` `smiley-surprised` |
| `symbol` | `symbol-question` `symbol-exclamation` `symbol-check` `symbol-cross` `symbol-idea` |

未知标记 id 原样保留，渲染为灰色问号徽标。

### 2.6 序列化规则

1. 键序固定：顶层 `$schema, version, theme, structure, root, relationships, floating`；Topic `id, text, collapsed, structure, position, style, markers, labels, note, link, summaries, boundaries, children`；其他对象 `id, from, to, text, controls, style`。未知字段排在已知字段之后，保持原有相对顺序。
2. 省略默认值和空集合（`collapsed: false`、`[]`、`{}`、默认 theme/structure）。
3. 2 空格缩进，叶子节点也展开为多行（保证 diff 按节点行粒度）。
4. 未知字段原样保留，不丢失。

### 2.7 解析与容错

| 情况 | 处理 |
|---|---|
| JSON 语法错误 | 不加载，webview 显示错误页（行列号 + "用文本编辑器打开"按钮）；文件修好后自动恢复 |
| 空文件 | 生成最小文档 `{ version: 1, root: { text: "中心主题" } }`，不自动写回，首次编辑时写入 |
| 缺 `id` | 生成新 id，下次写回时落盘 |
| `id` 重复 | 后出现者重新生成 id |
| 缺 `text` 或类型错误 | 视为 `""` |
| 引用悬空（relationship / summary / boundary 指向不存在或非法的节点） | 保留在数据里，不渲染，画布顶部提示条列出问题 |
| 非法样式值 | 忽略该键（保留在数据里），按主题默认渲染 |
| `version` 大于 1 | 只读打开并提示升级插件 |

### 2.8 编辑操作的级联规则

- 根节点不可删除、不可移动。
- 删除节点：一并删除其子树；指向子树中任一节点的联系线删除；所属 Summary/Boundary 若 `from`/`to` 被删，收缩到原范围内剩余的最近兄弟，范围为空则删除。
- 移动节点到其他父节点：同上处理原父节点上的 Summary/Boundary；联系线保留。

## 3. 架构

```
vscode-mind-map/
├── src/core/              纯 TS，不依赖 DOM / vscode
│   ├── types.ts           格式类型
│   ├── id.ts              id 生成
│   ├── doc.ts             parse / serialize / validate / normalize
│   ├── ops.ts             编辑操作（不可变，结构共享）
│   ├── query.ts           按 id / 路径查找、遍历、大纲文本
│   ├── theme.ts           内置主题 + 样式合并
│   ├── markers.ts         标记定义
│   ├── markdown.ts        Markdown 大纲 ⇄ 文档
│   └── layout/
│       ├── types.ts       LayoutInput（树 + 每节点尺寸）→ LayoutResult（坐标、连线路径、包围盒）
│       ├── map.ts         左右平衡思维导图
│       ├── logic.ts       向右逻辑图
│       ├── org.ts         向下组织结构图
│       ├── tree.ts        向右下树形图
│       └── extras.ts      联系线、概括、外框几何
├── src/vscode/
│   ├── extension.ts       注册 editor、命令、快捷键转发
│   └── editor.ts          CustomTextEditorProvider
├── webview/src/           React 19 + Vite
│   ├── App.tsx  Canvas.tsx  Topic.tsx  Toolbar.tsx  FormatPanel.tsx  Outline.tsx
│   ├── measure.ts         canvas measureText 量节点尺寸
│   ├── history.ts         撤销 / 重做快照栈
│   ├── keys.ts            快捷键
│   ├── export.ts          PNG / SVG / Markdown 导出
│   └── host.ts            与扩展端通信
├── skills/weilanx-mind-map/
│   ├── SKILL.md
│   ├── references/format.md
│   ├── scripts/wm.mjs     由 core 打包生成，零依赖
│   └── evals/
├── schema/wmind.schema.json
├── examples/
└── test/
```

依赖方向：`webview → core`，`vscode → core`，`skills/scripts → core`；`core` 不依赖任何一方。

### 3.1 数据流

1. `CustomTextEditorProvider` 绑定 `*.wmind`，文件即 TextDocument：保存、脏标记、git diff、"用文本编辑器打开"均为原生能力。
2. 打开时扩展端把文档文本发给 webview，webview 调 `core/doc.parse` 得到文档。
3. 用户编辑：webview 调 `core/ops` 得新文档 → 立即重绘 → `serialize` 后把全文发给扩展端 → 扩展端用 `WorkspaceEdit` 整体替换。扩展端记录 `lastSentText`。
4. 外部修改（Agent、git checkout、文本编辑器）：`onDidChangeTextDocument` 收到的文本 ≠ `lastSentText` 时推送给 webview 重新 parse；保留选中节点（按 id）和视口。
5. 撤销 / 重做：webview 内维护文档快照栈（上限 200 步）。外部修改作为一个新快照入栈，因此撤销会回到外部修改前的状态。扩展端注册 `wmind.undo` / `wmind.redo` 命令，`when: activeCustomEditorId == weilanx.mindMap` 时绑定 `⌘Z` / `⌘⇧Z` 并转发给 webview。

### 3.2 布局引擎接口

```ts
layout(input: { root: Topic; sizes: Map<id, {w, h}>; theme: ResolvedTheme; structure: Structure })
  → { nodes: Map<id, {x, y, w, h, side}>; edges: Path[]; bounds: Rect }
```

- 纯函数，布局结果按子树缓存（键为节点对象引用，ops 的结构共享保证未变子树引用不变）。
- 分支可覆盖 `structure`，引擎在该子树内切换算法。
- 目标：1000 节点编辑时单帧布局 < 16ms。

## 4. 视觉与交互

### 4.1 界面

- 顶部工具栏：左侧插入类（主题、子主题、联系线、概括、外框、标记、标签、备注、链接），右侧结构、主题、导出。
- 右侧格式面板（可收起）：选中节点显示"样式"页（形状、填充、边框、文字、分支线、标记）；无选中显示"画布"页（主题、结构、背景）。支持多选批量设置。
- 右下角：缩放（－ 百分比 ＋，点击百分比适应画布）、大纲视图切换。
- 大纲视图：可编辑缩进列表，快捷键与画布一致。

### 4.2 XMind 风格视觉规范

- 中心主题：深色填充大圆角矩形，白色粗体，字号 24。
- 一级分支主题：分支彩虹色填充的圆角矩形，白字，字号 18。
- 子主题：无框，底部一条分支色下划线，字号 14。
- 连线：中心到一级分支为由粗渐细的平滑曲线；往下逐层变细，颜色跟随分支。
- 选中态：2px 蓝色外描边；悬停：浅色外描边。
- 折叠：分支末端圆形徽标显示隐藏子节点数；展开时悬停显示 `−` 圆点。
- 标记显示在文字左侧，标签显示在文字下方小胶囊，备注 / 链接显示为文字右侧小图标（悬停预览备注）。

### 4.3 内置主题

`classic`（经典，默认）、`fresh`（清新）、`business`（商务）、`night`（暗夜）、`sketch`（手写字体）、`mono`（黑白打印）。每套主题定义：背景色、彩虹色板、各层级默认样式、连线风格、字体。每套都有亮 / 暗两个版本，文件未指定 `theme` 时按 VS Code 当前配色自动选版本；文件指定的主题同样按 VS Code 亮暗选版本。

### 4.4 快捷键（Mac 为 ⌘，Windows/Linux 为 Ctrl）

| 操作 | 按键 |
|---|---|
| 添加同级 / 子级 / 上级 | `Enter` / `Tab` / `Shift+Tab` |
| 进入编辑 | `Space`、`F2`、双击、直接输入字符（覆盖原文） |
| 编辑中换行 / 确认 / 取消 | `Shift+Enter` / `Enter` / `Esc` |
| 删除 | `Delete` / `Backspace` |
| 节点间导航 | 方向键（按空间最近节点） |
| 折叠 / 展开 | `⌘/` 或点击分支圆点 |
| 撤销 / 重做 | `⌘Z` / `⌘⇧Z` |
| 复制 / 剪切 / 粘贴 | `⌘C` / `⌘X` / `⌘V` |
| 全选 | `⌘A` |
| 适应画布 / 放大 / 缩小 | `⌘0` / `⌘=` / `⌘-` |
| 平移 | 拖动空白处、空格 + 拖动、触控板双指 |
| 缩放 | `⌘` + 滚轮、触控板捏合 |
| 框选 / 多选 | `Shift` + 拖动 / `⌘` + 点击 |

### 4.5 拖拽与剪贴板

- 拖到节点上：成为其最后一个子节点；拖到兄弟节点之间：重新排序；拖到空白处：变成自由主题。拖动时显示放置预览。
- 复制：剪贴板同时写入内部 JSON（子树，粘贴时重新生成 id）和 Markdown 大纲纯文本。
- 粘贴：优先内部 JSON；否则把纯文本按缩进 / Markdown 列表解析为多个子节点。

### 4.6 渲染

SVG 渲染；节点尺寸用 canvas `measureText` 计算（按主题字体、字号、最大宽度 240px 自动换行）；文字编辑时在节点位置覆盖 `textarea`，正确处理中文输入法组合输入（composition 期间不响应 Enter）。

## 5. 功能分期

| 里程碑 | 内容 |
|---|---|
| M1 能用 | 格式 + core（doc / ops / query / theme / id）、map 布局、CustomTextEditor、节点增删改、拖拽、折叠、撤销重做、快捷键、外部修改同步、classic 主题、"新建思维导图"命令、错误页 |
| M2 好看 | 格式面板、6 套主题、多选批量样式、大纲视图 |
| M3 内容 | 标记、标签、备注、链接 |
| M4 结构 | logic / org / tree 布局，整图与分支级设置 |
| M5 高级元素 | 联系线（控制点、文字）、概括、外框、自由主题 |
| M6 互通与 Agent | 导出 PNG（2x）/ SVG / Markdown，导入 Markdown，`wm.mjs` + skill + evals，JSON Schema，README（中英） |

每个里程碑结束时插件可独立打包安装使用。

## 6. 导入导出

- **Markdown 大纲**：中心主题 = `# 标题`；一级分支 = `## 标题`；更深层 = `-` 列表（2 空格缩进）；备注 = 节点下方 `>` 引用块；标签 = 行尾 `` `#标签` ``。导出再导入后结构、文字、备注、标签不丢；样式、标记、联系线、概括、外框、自由主题导出时舍弃并提示。
- **PNG / SVG**：导出整张图（非视口），四周留白 40px，背景随主题；PNG 为 2 倍像素。
- 导出文件默认保存在 `.wmind` 同目录同名，通过保存对话框确认。
- 命令 `wmind.importMarkdown`：在资源管理器右键 `.md` 文件生成同名 `.wmind`。

## 7. Agent 支持

### 7.1 skill：`skills/weilanx-mind-map/`

- `SKILL.md`：触发条件（提到 `.wmind`、本地思维导图文件、"往导图里加…""把这个导图整理成…"）；推荐流程：先 `wm outline` 读，再用命令改，批量重构才直接编辑 JSON，改完 `wm validate`。不适用于飞书画板（交给 lark-whiteboard）。
- `references/format.md`：第 2 节格式说明的 Agent 版本，含标记、主题、样式全表和示例。
- `evals/`：仿照 base-table，覆盖读取问答、增删改、从 Markdown 生成、样式设置等用例。

### 7.2 `wm.mjs` 命令

```bash
wm outline  <file> [--ids] [--depth N] [--json]   # 缩进大纲（含标记/标签/备注摘要）
wm find     <file> <关键词>                         # 输出匹配节点 id 与路径
wm add      <file> --parent <id|路径> <文本> [--index N]   # 打印新 id
wm set      <file> <id|路径> [--text …] [--style k=v]… [--marker m]… [--label l]… [--note …] [--link …] [--collapsed true|false]
wm unset    <file> <id|路径> --style k | --marker m | --label l | --note | --link
wm move     <file> <id|路径> --parent <id|路径> [--index N]
wm rm       <file> <id|路径>
wm rel      <file> <from> <to> [--text …]          # 添加联系线
wm from-md  <md> -o <file>
wm to-md    <file>
wm validate <file>                                  # 退出码 0 表示无问题
```

- 路径用 `/` 分隔的节点文本，从中心主题开始，如 `产品规划/用户调研`；文本含 `/` 时用 `\/` 转义；路径有歧义时报错并列出候选 id。
- 所有写命令走 `core` 的 parse → ops → serialize，与插件写出的格式逐字节一致。

### 7.3 JSON Schema

`schema/wmind.schema.json` 通过 `contributes.jsonValidation` 绑定 `*.wmind`，在文本编辑器中提供补全和校验；同时发布到官网路径，供文件 `$schema` 引用。

## 8. 测试

- **core 单元测试（vitest）**：parse ↔ serialize 往返一致；键序与默认值省略；未知字段保留；所有容错分支；ops 不可变性与级联规则；四种布局的坐标快照（固定尺寸输入）；Markdown 往返。
- **CLI 集成测试**：对 `examples/` 下文件执行 `wm` 各命令，比对输出文件。
- **webview 冒烟测试**：用本地 playwright-cli 启动无头浏览器访问 Vite 预览页（不使用 Chrome），覆盖键盘建节点、编辑文字（含中文输入）、拖拽、改样式、撤销，并截图检查视觉。
- 每个里程碑结束时手动在 VS Code 中安装 `.vsix` 验证一次，包括"Agent 在外部改文件，画布实时刷新"。

## 9. 技术栈与工程

- TypeScript、React 19、Vite（webview）、esbuild（扩展端与 `wm.mjs`）、vitest。
- 运行时零第三方依赖（除 React）；不引入思维导图库。
- `engines.vscode` 与 base-table 一致（`^1.90.0`）；界面中英双语（`package.nls.json` / `package.nls.zh-cn.json`，webview 跟随 VS Code 语言）。
