# Install Weilanx Mind Map (instructions for AI agents)

You are installing **Weilanx Mind Map** for the user. There are three parts. Install the ones the user asked for; if they only said "install it", install the editor plugin they use **and** the skill.

- **VS Code** and VS Code based editors (Cursor, Windsurf, Insiders, VSCodium): extension id `weilanx.weilanx-mind-map`. See sections 1 to 4.
- **Obsidian** (desktop, mobile is experimental): plugin id `weilanx-mind-map`. See [Obsidian](#obsidian).
- **Agent skill** (`SKILL.md` + the zero-dependency CLI `wm.mjs`), which lets agents read and edit `.wmind` files. See [Agent skill](#agent-skill).

If you can't tell which editor the user works in, check: an Obsidian vault has a `.obsidian/` folder. If that doesn't settle it, ask. Follow the steps in order and report the result.

## 1. Pick the editor CLI

```bash
command -v code code-insiders cursor windsurf codium
```

If `code` is missing on macOS, use the CLI inside the app bundle, e.g. `/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code`.

## 2. Install

**Option A, one command** (macOS / Linux). This installs into every editor it finds; set `WM_EDITOR=cursor` to limit it to one:

```bash
curl -fsSL https://raw.githubusercontent.com/Azure12355/weilanx-mind-map/main/scripts/install.sh | bash
```

**Option B, step by step** (works on any OS):

```bash
curl -fL -o weilanx-mind-map.vsix https://github.com/Azure12355/weilanx-mind-map/releases/latest/download/weilanx-mind-map.vsix
code --install-extension weilanx-mind-map.vsix --force
```

**Option C, build from source:**

```bash
git clone https://github.com/Azure12355/weilanx-mind-map.git
cd weilanx-mind-map
npm install
npm run package          # produces weilanx-mind-map.vsix
code --install-extension weilanx-mind-map.vsix --force
```

## 3. Verify

```bash
code --list-extensions | grep -i weilanx.weilanx-mind-map
```

The command must print `weilanx.weilanx-mind-map`.

## 4. Tell the user

- Run **Developer: Reload Window**.
- Open any `.wmind` file, right-click a folder → **Create Mind Map (.wmind)**, or right-click a Markdown file → **Convert to Mind Map (.wmind)**.
- Sample maps are in `examples/` of the repository.

## Obsidian

1. Find the vault path, i.e. the folder that contains `.obsidian/`.
2. **macOS / Linux:**

   ```bash
   curl -fsSL https://raw.githubusercontent.com/Azure12355/weilanx-mind-map/main/scripts/install.sh | bash -s -- --obsidian "/path/to/vault"
   ```

   **Manual install:** download `main.js`, `manifest.json` and `styles.css` from `https://github.com/Azure12355/weilanx-mind-map/releases/latest/download/<file>` into `<vault>/.obsidian/plugins/weilanx-mind-map/`. Then add `"weilanx-mind-map"` to the JSON array in `<vault>/.obsidian/community-plugins.json`.
3. **Verify:** the three files are in the plugin folder, and `community-plugins.json` contains the id.
4. **Tell the user:** restart Obsidian, or toggle the plugin under Settings → Community plugins. If Restricted mode is on, they need to turn it off first.

## Agent skill

```bash
curl -fsSL https://raw.githubusercontent.com/Azure12355/weilanx-mind-map/main/scripts/install.sh | bash -s -- --skill
```

This installs to `~/.claude/skills/weilanx-mind-map`. For another agent, pass its skills folder: `... | bash -s -- --skill /path/to/skills`. The CLI needs Node.js 18+.

**Verify:**

```bash
node ~/.claude/skills/weilanx-mind-map/scripts/wm.mjs help
```

## Uninstall

```bash
code --uninstall-extension weilanx.weilanx-mind-map           # VS Code
rm -rf "/path/to/vault/.obsidian/plugins/weilanx-mind-map"    # Obsidian (also remove the id from community-plugins.json)
rm -rf ~/.claude/skills/weilanx-mind-map                      # skill
```
