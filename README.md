# Dynamic Wallpaper

Set per-note background wallpapers in Obsidian using frontmatter properties. Wallpapers can be inherited from linked notes, browsed in a gallery, or randomized from any combination of inheritance tiers.

> **Desktop-only.** This plugin uses FFmpeg and Node.js `fs` APIs, which are not available on Obsidian Mobile.

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
- **Overlay opacity** - Adjust a color overlay per theme (light/dark) so text remains readable
- **Low-opacity legibility boost** - When overlay opacity drops below 0.2, apply a soft text shadow so body text stays readable on busy wallpapers
- **Flip wallpaper** - Horizontally flip the current wallpaper image (requires FFmpeg)
- **Set wallpaper to note** - Save the currently displayed wallpaper into the active note's frontmatter
- **Keep existing wallpaper** - Optionally retain the wallpaper when navigating to notes without one

## Commands

All commands are available from the Command Palette (`Cmd/Ctrl + P`).

### Choose Wallpaper

Opens a visual gallery of every image in the **Wallpapers Directory** (and any subfolders), with thumbnail previews. Click a thumbnail to apply that wallpaper immediately. No selection is saved — the wallpaper is applied for the current session but not written to any frontmatter.

- **Requires**: a valid Wallpapers Directory containing at least one image.
- **No-op when**: the directory is missing, empty, or contains no images with a recognized extension (see *Supported image formats* below).

### Pick Random Wallpaper

Picks a random **backlink** of the active note and applies that backlink's wallpaper (resolved through the full inheritance priority chain). The wallpaper currently on screen is skipped — if every backlink resolves to the wallpaper already displayed, or no backlinks have a wallpaper at all, the command leaves the current wallpaper untouched and shows a Notice.

- **Requires**: an active note with at least one backlink that resolves to a wallpaper.
- **No-op when**: there is no active note, there are no backlinks, or every backlink resolves to the current wallpaper (or has no wallpaper).

### View Related Wallpapers

Opens a modal listing **every** wallpaper that could possibly apply to the active note, grouped by inheritance tier:

1. **Direct** — wallpapers set on the active note itself via the configured frontmatter property.
2. **Inheritance Property** — wallpapers on notes linked from the configured *Inheritance Property* frontmatter key.
3. **Frontmatter Links** — wallpapers on notes linked from any other frontmatter property.
4. **Body Links** — wallpapers on notes linked inline in the note body (the **last** body link is checked first, matching resolution behavior).
5. **Backlinks** — wallpapers on notes that link *to* the active note.

Each card shows a thumbnail, the source note's name, and which tier produced it. Clicking a card opens the source note in a new leaf. Tiers with no wallpapers are hidden.

- **Requires**: an active note.
- **No-op when**: no related wallpapers are found for the active note.

### Pick Random Related Wallpaper

Picks a random wallpaper from the **same pool** that *View Related Wallpapers* displays — i.e., the entire inheritance set, deduplicated by resolved file path. The wallpaper currently on screen is skipped.

Unlike *Pick Random Wallpaper*, this command is **isolated to the related set**: it never falls back to anything outside of it. If the related pool is empty, or every candidate resolves to the wallpaper already on screen, the command leaves the current wallpaper untouched and shows a Notice.

- **Requires**: an active note with at least one related wallpaper that differs from the current one.
- **No-op when**: there is no active note, there are no related wallpapers, or the only related wallpaper is already on screen.

### Increase Overlay Opacity / Decrease Overlay Opacity

Adjusts the overlay opacity for the **active theme** by 0.05 per press (range 0-1, clamped and rounded to two decimals). The active note's wallpaper updates immediately. A Notice shows the new opacity value 500ms after the last change.

- **Requires**: nothing. Works on any active note.

### Set Current Wallpaper to Note

Writes the wallpaper currently displayed on screen into the active note's frontmatter, using the configured wallpaper property name. The value is written as a wiki link (`[[filename.ext]]`) so it round-trips with Obsidian's autocomplete and rename refactoring.

- **Requires**: an active note AND a wallpaper currently displayed (i.e., one was set via Choose Wallpaper, Pick Random, Refresh, etc.). If you navigated to a note whose wallpaper was resolved via inheritance and never explicitly selected, `currentWallpaper` may not reflect the visible image — pick it again via Choose Wallpaper first if needed.
- **No-op when**: there is no active file, or no wallpaper is currently set.

### Refresh Wallpaper

Re-runs the full wallpaper resolution pipeline for the active note. Useful after you've changed frontmatter on a linked note, or if you suspect the inheritance cache is stale. The result is the same wallpaper that would be resolved on a fresh page load.

- **Requires**: an active note.

### Flip Current Wallpaper (Horizontal)

Mirrors the current wallpaper image in place via FFmpeg. The image file is **overwritten** — there is no undo. After flipping, the wallpaper refreshes automatically.

> ⚠️ **This command overwrites the source image file in place.** Make a backup first if the original matters. Do not run it on a wallpaper that's stored outside the vault (e.g., a remote attachment that exists only by reference).

- **Requires**: FFmpeg available at the configured path (default: `ffmpeg` on `PATH`), and a wallpaper currently set as the plugin's `currentWallpaper`.
- **No-op when**: FFmpeg is missing, the path is invalid, or no wallpaper is currently set.

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
| Boost text legibility at low opacity | `true` | When the active theme's overlay opacity drops below 0.2, apply a soft text shadow on body text so it stays readable while the wallpaper shows through. Black halo in light mode, white halo in dark mode. |
| FFmpeg Binary Path | `ffmpeg` | Path to the FFmpeg executable (used for thumbnails and image flipping) |

### Wallpaper inheritance priority

When a note has no direct `wallpaper` frontmatter property, the plugin looks for one in this order (first match wins):

1. **Inheritance Property** — frontmatter outlinks of the property named in *Inheritance Property* (e.g., an `areas:` list in the example).
2. **All frontmatter links** — every wiki link found anywhere in the frontmatter.
3. **Body links** — wiki links in the note body, with the **last** link checked first.
4. **Backlinks** — notes that link *to* this one. Each backlink is resolved through its own priority chain; the first backlink that yields a wallpaper wins.

Any of these steps can be disabled via the corresponding setting. A backlink of a backlink (transitive backlinks) is **not** followed — only direct backlinks of the active note are checked.

### Supported image formats

The wallpaper picker, related-wallpapers modal, thumbnail cache, and random-pick commands only recognize: `png`, `jpg`, `jpeg`, `webp`, `gif`, `bmp`, and `svg`. Files with other extensions are silently skipped.

## Filesystem and External Tool Disclosure

This plugin accesses the filesystem and optionally runs an external tool beyond what Obsidian's standard vault APIs provide:

- **Thumbnail cache** - Creates a `.cache` directory inside the plugin's own folder (`<vault>/.obsidian/plugins/dynamic-wallpapers-plugin/.cache/`) to store generated wallpaper thumbnails (480×270 cropped JPEGs produced by FFmpeg). No files outside the vault are created.
- **FFmpeg execution** - If FFmpeg is available, the plugin invokes it via `child_process.exec()` to generate thumbnail images and to horizontally flip wallpaper files. The FFmpeg path is configurable in settings. FFmpeg is optional; the plugin works without it (thumbnails fall back to full-size images).
- **Node.js `fs` APIs** - Used for reading/writing thumbnail cache files and for the image flip operation. All file operations stay within the vault directory.

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for how to set up a local dev environment, including symlinking the `build/` output into your vault and using the [Hot-Reload](https://github.com/pjeby/hot-reload) plugin for fast iteration.

See [`AGENTS.md`](./AGENTS.md) for project conventions and style guidelines.