# Dynamic Wallpaper

Set per-note background wallpapers in Obsidian using frontmatter properties. Wallpapers can be inherited from linked notes, picked from a gallery, or randomized.

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
- **Wallpaper inheritance** - Notes without a wallpaper can inherit from linked notes (via a specific frontmatter property, all frontmatter links, or body links)
- **Wallpaper picker** - Browse and select wallpapers from a visual gallery with thumbnail previews
- **Random wallpaper** - Pick a random wallpaper from your wallpapers folder
- **Overlay opacity** - Adjust a color overlay per theme (light/dark) so text remains readable
- **Flip wallpaper** - Horizontally flip the current wallpaper image (requires FFmpeg)
- **Set wallpaper to note** - Save the currently displayed wallpaper into the active note's frontmatter
- **Keep existing wallpaper** - Optionally retain the wallpaper when navigating to notes without one

## Commands

| Command | Description |
|---------|-------------|
| Choose Wallpaper | Open a visual picker to browse wallpapers |
| Pick Random Wallpaper | Set a random wallpaper from the wallpapers folder |
| Set Current Wallpaper to Note | Write the current wallpaper into the active note's frontmatter |
| Increase Overlay Opacity | Make the overlay more opaque (darker) |
| Decrease Overlay Opacity | Make the overlay more transparent |
| Flip Current Wallpaper (Horizontal) | Mirror the current wallpaper image in place (requires FFmpeg) |
| Refresh Wallpaper | Re-apply the wallpaper for the current note |

> ⚠️ **Flip Current Wallpaper overwrites the source image file in place.** Make a backup first if the original matters.

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| Wallpaper Property | `wallpaper` | Frontmatter property name used to specify a wallpaper |
| Wallpapers Directory | `/` | Vault folder containing wallpaper images |
| FFmpeg Binary Path | `ffmpeg` | Path to FFmpeg binary (for thumbnails and image flipping) |
| Overlay Opacity (Light) | `0.8` | Overlay opacity in light mode (0-1) |
| Overlay Opacity (Dark) | `0.6` | Overlay opacity in dark mode (0-1) |
| Inheritance Property | _(empty)_ | Specific frontmatter property to check for wallpaper inheritance |
| Inherit from all frontmatter links | `true` | Look up wallpapers from all frontmatter-linked notes |
| Inherit from body links | `true` | Look up wallpapers from notes linked in the body |
| Keep existing wallpaper | `true` | Retain the wallpaper when navigating to a note without one |

### Wallpaper inheritance priority

When a note has no direct `wallpaper` frontmatter property, the plugin looks for one in this order (first match wins):

1. **Specific inheritance property** — frontmatter outlinks of the property named in *Inheritance Property* (e.g., an `areas:` list in the example).
2. **All frontmatter links** — every wiki link found anywhere in the frontmatter.
3. **Body links** — wiki links in the note body, with the **last** link checked first.

Disable any of these steps by clearing the relevant setting.

### Supported image formats

The wallpaper picker, random command, and thumbnail cache only recognize: `png`, `jpg`, `jpeg`, `webp`, `gif`, `bmp`, and `svg`. Files with other extensions are silently skipped.

## Filesystem and External Tool Disclosure

This plugin accesses the filesystem and optionally runs an external tool beyond what Obsidian's standard vault APIs provide:

- **Thumbnail cache** - Creates a `.cache` directory inside the plugin's own folder (`<vault>/.obsidian/plugins/dynamic-wallpapers-plugin/.cache/`) to store generated wallpaper thumbnails (480×270 cropped JPEGs produced by FFmpeg). No files outside the vault are created.
- **FFmpeg execution** - If FFmpeg is available, the plugin invokes it via `child_process.exec()` to generate thumbnail images and to horizontally flip wallpaper files. The FFmpeg path is configurable in settings. FFmpeg is optional; the plugin works without it (thumbnails fall back to full-size images).
- **Node.js `fs` APIs** - Used for reading/writing thumbnail cache files and for the image flip operation. All file operations stay within the vault directory.

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for how to set up a local dev environment, including symlinking the `build/` output into your vault and using the [Hot-Reload](https://github.com/pjeby/hot-reload) plugin for fast iteration.

See [`AGENTS.md`](./AGENTS.md) for project conventions and style guidelines.
