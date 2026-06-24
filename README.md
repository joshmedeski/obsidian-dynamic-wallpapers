# Dynamic Wallpaper

Set per-note background wallpapers in Obsidian using frontmatter properties. Wallpapers can be inherited from linked notes, browsed in a gallery, or randomized from any combination of inheritance tiers.

> **Desktop-only.** This plugin uses Node.js `fs` APIs, which are not available on Obsidian Mobile.

## Installation

This plugin isn't in the Obsidian Community Plugins directory yet, so install it via one of the methods below.

### Option 1: BRAT (recommended for testing)

1. Install the [BRAT](https://github.com/TfTHacker/obsidian42-brat) plugin from Community Plugins.
2. In BRAT → "Add Beta plugin", paste: `joshmedeski/obsidian-dynamic-wallpapers`
3. Enable **Dynamic Wallpaper** in Settings → Community Plugins.

### Option 2: Manual install

1. Download the latest release from the [Releases](../../releases) page.
2. Extract the zip so you have `manifest.json`, `main.js`, and `styles.css`.
3. Move those three files into `<your-vault>/.obsidian/plugins/dynamic-wallpapers-plugin/`.
4. Enable **Dynamic Wallpaper** in Settings → Community Plugins (you may need to disable Restricted Mode first).

> Note: Obsidian loads any subfolder of `.obsidian/plugins/` that contains a valid `manifest.json`. For releases, name the folder after the plugin id (`dynamic-wallpapers-plugin`) so users get a predictable install path. For local development, the folder name is arbitrary — pick whatever's convenient.

## Features

- **Per-note wallpapers** - Set a `wallpaper` frontmatter property linking to an image in your vault
- **Wallpaper inheritance** - Notes without a wallpaper can inherit from linked notes (via a specific frontmatter property, all frontmatter links, body links, or backlinks)
- **Wallpaper picker** - Browse and select wallpapers from a visual gallery with thumbnail previews
- **Random wallpaper** - Pick a random wallpaper from the active note's backlink pool, or from the full set of related wallpapers
- **Related wallpapers modal** - See every wallpaper that could apply to the active note, grouped by which inheritance tier produced it
- **Thumbnail cache management** - Clear or rebuild the cached thumbnails that power the picker and related-wallpapers modal
- **Overlay opacity** - Adjust a color overlay per theme (light/dark) so text remains readable
- **Low-opacity legibility boost** - When overlay opacity drops below 0.2, apply a soft text shadow so body text stays readable on busy wallpapers
- **Flip wallpaper** - Horizontally flip the current wallpaper image
- **Set wallpaper to note** - Save the currently displayed wallpaper into the active note's frontmatter
- **Keep existing wallpaper** - Optionally retain the wallpaper when navigating to notes without one

## Commands

All commands are available from the Command Palette (`Cmd/Ctrl + P`).

- **Choose Wallpaper:** Open a visual gallery of every image in the Wallpapers Directory and click a thumbnail to apply it.
- **Pick Random Wallpaper:** Apply a random backlink's wallpaper (resolved through the full inheritance chain), skipping the one already on screen.
- **View Related Wallpapers:** Open a modal listing every wallpaper that could apply to the active note, grouped by inheritance tier.
- **Pick Random Related Wallpaper:** Apply a random wallpaper from the related set only, skipping the one already on screen.
- **Increase Overlay Opacity:** Raise the active theme's overlay opacity by 0.05.
- **Decrease Overlay Opacity:** Lower the active theme's overlay opacity by 0.05.
- **Set Current Wallpaper to Note:** Write the wallpaper currently on screen into the active note's frontmatter as a wiki link.
- **Refresh Wallpaper:** Re-run the full wallpaper resolution pipeline for the active note.
- **Clear Thumbnail Cache:** Delete every file in the plugin's `.cache` directory.
- **Rebuild Thumbnail Cache:** Wipe the cache and regenerate a thumbnail for every image in the Wallpapers Directory.
- **Flip Current Wallpaper (Horizontal):** Mirror the current wallpaper image in place (overwrites the source file — no undo).

## Related wallpapers & inheritance

A note doesn't have to set its own wallpaper. When the active note has no direct `wallpaper` frontmatter property, the plugin resolves one by following the note's links — so a wallpaper set on one note can cascade to everything connected to it.

### Resolution order

The plugin walks these tiers in order and applies the **first** wallpaper it finds (first match wins):

1. **Direct** — a wallpaper set on the active note itself via the configured *Wallpaper Property*.
2. **Inheritance Property** — frontmatter outlinks of the property named in *Inheritance Property* (e.g., an `areas:` list).
3. **Frontmatter Links** — every other wiki link found anywhere in the frontmatter.
4. **Body Links** — wiki links in the note body, with the **last** link checked first.
5. **Backlinks** — notes that link *to* the active note. Each backlink is resolved through its own priority chain; the first backlink that yields a wallpaper wins.

Tiers 2–5 can each be toggled off in [Settings](#settings). A backlink of a backlink (transitive backlinks) is **not** followed — only direct backlinks of the active note are checked.

### The "related" set

The **related** set is the full collection of wallpapers reachable through every enabled tier above, deduplicated by resolved file path. Two commands operate on it:

- **View Related Wallpapers** opens a modal listing every wallpaper in the set, grouped by the tier that produced it. Each card shows a thumbnail, the source note's name, and its tier. Click a card to apply that wallpaper; click the small `↗ source-name` link to open the source note in a new leaf instead. Tiers with no wallpapers are hidden.
- **Pick Random Related Wallpaper** applies a random wallpaper from this same set, skipping the one already on screen. Unlike *Pick Random Wallpaper* (which only considers backlinks), it never falls back outside the related set.

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| Wallpaper Property | `wallpaper` | Frontmatter property name used to specify a wallpaper |
| Wallpapers Directory | `/` | Vault folder containing wallpaper images |
| Keep existing wallpaper | `true` | Retain the wallpaper when navigating to a note without one |
| Inheritance Property | _(empty)_ | Specific frontmatter property whose outlinks are checked for wallpapers (priority 2) |
| Inherit from all frontmatter links | `true` | Check every frontmatter outlink for a wallpaper (priority 3) |
| Inherit from body links | `true` | Check inline body links for a wallpaper — last link checked first (priority 4) |
| Inherit from backlinks | `true` | Check notes that link TO the active note for a wallpaper (priority 5, lowest) |
| Overlay Opacity (Light Mode) | `0.8` | Overlay opacity in light mode (0-1) |
| Overlay Opacity (Dark Mode) | `0.6` | Overlay opacity in dark mode (0-1) |

For how the inheritance settings interact, see [Related wallpapers & inheritance](#related-wallpapers--inheritance) above.

### Supported image formats

The wallpaper picker, related-wallpapers modal, thumbnail cache, and random-pick commands only recognize: `png`, `jpg`, `jpeg`, `webp`, `gif`, `bmp`, and `svg`. Files with other extensions are silently skipped.

## Filesystem Disclosure

This plugin accesses the filesystem beyond what Obsidian's standard vault APIs provide:

- **Thumbnail cache** - Creates a `.cache` directory inside the plugin's own folder (`<vault>/.obsidian/plugins/dynamic-wallpapers-plugin/.cache/`) to store generated wallpaper thumbnails (480×270 cropped JPEGs). Thumbnails are generated from the original images via the browser's built-in canvas + `createImageBitmap` APIs — no external binary is required. No files outside the vault are created.
- **Node.js `fs` APIs** - Used for reading/writing thumbnail cache files. All file operations stay within the vault directory.

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for how to set up a local dev environment, including symlinking the `build/` output into your vault and using the [Hot-Reload](https://github.com/pjeby/hot-reload) plugin for fast iteration.

See [`AGENTS.md`](./AGENTS.md) for project conventions and style guidelines.