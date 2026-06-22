# Obsidian Dynamic Wallpaper Plugin

Set per-note background wallpapers in Obsidian using frontmatter properties. Wallpapers can be inherited from linked notes, picked from a gallery, or randomized.

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
| Flip Current Wallpaper (Horizontal) | Mirror the current wallpaper image (requires FFmpeg) |
| Refresh Wallpaper | Re-apply the wallpaper for the current note |

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| Wallpaper Property | `wallpaper` | Frontmatter property name used to specify a wallpaper |
| Wallpapers Path | `/` | Vault folder containing wallpaper images |
| FFmpeg Path | `ffmpeg` | Path to FFmpeg binary (for thumbnails and image flipping) |
| Overlay Opacity (Light) | `0.8` | Overlay opacity in light mode (0-1) |
| Overlay Opacity (Dark) | `0.6` | Overlay opacity in dark mode (0-1) |
| Inheritance Property | _(empty)_ | Specific frontmatter property to check for wallpaper inheritance |
| Inherit from Frontmatter Links | `true` | Look up wallpapers from all frontmatter-linked notes |
| Inherit from Body Links | `true` | Look up wallpapers from notes linked in the body |
| Keep Existing Wallpaper | `true` | Retain the wallpaper when navigating to a note without one |

## Filesystem and External Tool Disclosure

This plugin accesses the filesystem and optionally runs an external tool beyond what Obsidian's standard vault APIs provide:

- **Thumbnail cache** - Creates a `.cache` directory inside the plugin's own folder (`<vault>/.obsidian/plugins/obsidian-dynamic-wallpaper/.cache/`) to store generated wallpaper thumbnails. No files outside the vault are created.
- **FFmpeg execution** - If FFmpeg is available, the plugin invokes it via `child_process.exec()` to generate thumbnail images and to horizontally flip wallpaper files. The FFmpeg path is configurable in settings. FFmpeg is optional; the plugin works without it (thumbnails fall back to full-size images).
- **Node.js `fs` APIs** - Used for reading/writing thumbnail cache files and for the image flip operation. All file operations stay within the vault directory.
