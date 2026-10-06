# .wmind format reference

UTF-8 JSON, 2-space indentation, one trailing newline. JSON Schema: `schema/wmind.schema.json` in the plugin repo.

## Top level

| key | type | notes |
|---|---|---|
| `$schema` | string | optional |
| `version` | number | required, currently `1`. A newer version opens read-only |
| `theme` | string | optional, default `classic`. One of `classic` `fresh` `business` `night` `sketch` `mono` |
| `structure` | string | optional, default `map`. One of `map` (balanced left/right) `logic` (to the right) `org` (downward org chart) `tree` (indented tree) |
| `root` | Topic | required, the central topic |
| `relationships` | Relationship[] | optional |
| `floating` | Topic[] | optional, free-floating topics. Each needs `position` |

## Topic

| key | type | notes |
|---|---|---|
| `id` | string | unique across the file (topics, summaries, boundaries and relationships share one namespace). May be omitted on new topics |
| `text` | string | required. Plain text, `\n` for a line break |
| `collapsed` | boolean | only written when `true` |
| `structure` | string | `logic` / `org` / `tree`, applies to this branch only |
| `position` | `{x, y}` | floating topics only. Top-left corner relative to the center of the central topic |
| `style` | Style | only keys that differ from the theme |
| `markers` | string[] | marker ids, at most one per category |
| `labels` | string[] | short tags shown under the text |
| `note` | string | Markdown note |
| `link` | string | `http(s)://…` or a path relative to the `.wmind` file |
| `summaries` | Range[] | summaries over a run of this topic's children |
| `boundaries` | Range[] | boundaries around a run of this topic's children |
| `children` | Topic[] | |

Key order the plugin writes: `id, text, collapsed, structure, position, style, markers, labels, note, link, summaries, boundaries, children`.

## Range (summary / boundary)

```json
{ "id": "s1a2b3", "from": "<first child id>", "to": "<last child id>", "text": "两周完成", "style": { "border": "#F0604D" } }
```

`from` and `to` must be direct children of the topic that holds the range. They can be equal, which covers a single child. A summary draws a brace plus a summary topic; a boundary draws a dashed box, with `text` as an optional title. If an endpoint is deleted, the plugin shrinks the range to the remaining siblings, and drops it when none remain.

## Relationship

```json
{ "id": "r1a2b3", "from": "<topic id>", "to": "<topic id>", "text": "依赖", "controls": [{ "x": 40, "y": -60 }, { "x": -40, "y": -60 }], "style": { "lineColor": "#E5484D", "lineStyle": "solid" } }
```

A curved arrow between any two topics, floating ones included. `controls` holds two Bézier control points, each an offset from the center of the `from` / `to` topic. Omit it to get the default arc. The line is dashed by default; set `lineStyle` to `solid` for a solid line.

## Style keys

| key | values |
|---|---|
| `shape` | `rect` `rounded` `capsule` `ellipse` `underline` `none` |
| `fill` | `#RRGGBB` or `none` |
| `border` | `#RRGGBB` or `none` (for an `underline` topic this is the underline color) |
| `borderWidth` | 0–6 |
| `textColor` | `#RRGGBB` |
| `fontSize` | 10–48 |
| `bold` `italic` `strike` | boolean |
| `lineColor` | `#RRGGBB`, color of the lines going to this topic's children. On a main branch it also sets the branch color |
| `lineWidth` | 1–8 |
| `lineStyle` | `curve` `straight` `elbow`. Relationships also accept `dashed` `solid` |

Invalid values are ignored when drawing and reported by `wm validate`.

Theme defaults: the central topic is a dark rounded box; main branches are filled rounded boxes, each in its own rainbow color; deeper topics are text on an underline in the branch color. A main branch's `fill` also becomes its branch color.

## Markers

| category | ids |
|---|---|
| priority | `priority-1` … `priority-9` |
| task progress | `task-0` `task-25` `task-50` `task-75` `task-100` |
| flag | `flag-red` `flag-orange` `flag-yellow` `flag-green` `flag-blue` `flag-purple` |
| star | `star-red` `star-orange` `star-yellow` `star-green` `star-blue` `star-purple` |
| smiley | `smiley-happy` `smiley-laugh` `smiley-sad` `smiley-angry` `smiley-surprised` |
| symbol | `symbol-question` `symbol-exclamation` `symbol-check` `symbol-cross` `symbol-idea` |

Adding a marker replaces any marker of the same category on that topic.

## Markdown outline mapping (`from-md` / `to-md`)

| Markdown | map |
|---|---|
| `# 标题` | central topic (when several `#` headings exist, the later ones become main branches) |
| `## 标题` | main branch. `###` and deeper go one level further down each |
| `- item` (2-space indent per level) | child topics under the latest heading |
| `> text` / plain paragraph | note of the topic above |
| `` `#tag` `` at line end | label |
| `[text](url)` | link |
| `[ ] ` / `[x] ` | `task-0` / `task-100` marker |
| `<br>` | line break inside a topic |
