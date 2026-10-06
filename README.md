<p align="center">
  <img src="./media/logo.png" width="128" height="128" alt="Weilanx Mind Map" />
</p>

<h1 align="center">Weilanx Mind Map</h1>

<p align="center">English | <a href="./README.zh-CN.md">中文</a></p>

An XMind-style mind map editor for VS Code. Each map is a `.wmind` file containing plain JSON. You edit on a canvas, AI agents read and write the file directly, and changes on either side show up live.

![Mind map](./media/readme/map.png)

## Features

- **XMind look**: rainbow branches, tapered curves, rounded topics with underlined subtopics. Six built-in themes (Classic, Fresh, Business, Night, Sketch, Mono), each with light and dark variants that follow VS Code.
- **Four structures**: mind map, logic chart, org chart and tree chart, for the whole map or for a single branch.
- **Editing**: add and delete topics, drag to re-parent or reorder, fold, multi-select, marquee select, undo/redo, copy and paste subtrees (pasting Markdown or indented text works too).
- **Styling**: shape, fill, border, text (size, bold, italic, strike, color) and branch line (color, width, curve / straight / elbow), applied to one topic or many.
- **Content**: markers (priority, task progress, flags, stars, smileys, symbols), labels, notes, and links (URLs or relative workspace paths).
- **Advanced elements**: relationships with draggable control points and text, summaries, boundaries, floating topics.
- **Outline view**: edit the whole map as an indented list.
- **Import and export**: PNG (2x), SVG and Markdown outline export; create a map from a Markdown outline.
- **Agent-friendly**: nested-tree JSON with a fixed key order, and only non-default values are written, so git diffs stay clean. Ships with a skill and a zero-dependency CLI, `wm.mjs`.

![Org chart, Night theme](./media/readme/org-night.png)

## Quick start

1. Install `weilanx-mind-map.vsix` (Command Palette → `Extensions: Install from VSIX...`).
2. Right-click a folder → **Create Mind Map (.wmind)**, or open any `.wmind` file.
3. Use **Open as JSON Text** in the editor title bar to view or edit the raw JSON. Text mode has JSON Schema completion and validation.

| Action | Keys |
|---|---|
| Add sibling / child / parent | `Enter` / `Tab` / `Shift+Tab` |
| Edit text | `Space`, `F2`, double-click, or just start typing (IME supported) |
| New line / finish editing | `Shift+Enter` / `Enter` or `Esc` |
| Delete | `Delete` / `Backspace` |
| Navigate | Arrow keys |
| Fold / unfold | `Cmd+/` |
| Undo / redo | `Cmd+Z` / `Cmd+Shift+Z` |
| Zoom in / out / fit | `Cmd+=` / `Cmd+-` / `Cmd+0` |
| Pan | Drag the background, Space + drag, or two-finger scroll |
| New floating topic | Double-click the background |

On Windows / Linux, use `Ctrl` instead of `Cmd`.

## File format

```json
{
  "version": 1,
  "root": {
    "id": "a1b2c3",
    "text": "Product plan",
    "children": [
      { "id": "k9x2m1", "text": "Research", "markers": ["priority-1"], "children": [{ "id": "p0q9w8", "text": "10 interviews" }] },
      { "id": "z7y6x5", "text": "MVP", "style": { "fill": "#FFE8A3" } }
    ]
  }
}
```

See [references/format.md](./skills/weilanx-mind-map/references/format.md) for every field, and [schema/wmind.schema.json](./schema/wmind.schema.json) for the schema.

## For agents

Copy `skills/weilanx-mind-map` into your agent's skills folder (for example `~/.claude/skills/`):

```bash
WM="node skills/weilanx-mind-map/scripts/wm.mjs"
$WM outline plan.wmind --ids
$WM add plan.wmind --parent "Product plan/MVP" "Export" "Import"
$WM set plan.wmind "Product plan/MVP/Export" --marker priority-1 --style fill=#FFE8A3
$WM from-md notes.md -o notes.wmind
$WM validate plan.wmind
```

## Development

```bash
npm install
npm run dev:web     # preview the canvas in a browser
npm test            # core unit tests + CLI integration tests
npm run package     # build weilanx-mind-map.vsix
```

## License

MIT
