# Contributing

Thanks for your interest in improving Obsidian Dynamic Wallpaper. This guide walks you through setting up a local development environment so you can build, test, and iterate on the plugin in your own vault.

## Prerequisites

- [Node.js](https://nodejs.org/) (v18 or newer recommended)
- [Obsidian](https://obsidian.md/) installed on your machine
- An Obsidian vault where you can safely load unofficial plugins

## 1. Clone the repository

```bash
git clone https://github.com/<your-username>/obsidian-dynamic-wallpapers.git
cd obsidian-dynamic-wallpapers
npm install
```

## 2. Create the plugin folder in your vault

Inside your Obsidian vault, create a folder for the plugin under `.obsidian/plugins/`. Obsidian loads whatever folder contains a valid `manifest.json`, so the name you pick is up to you; this guide uses `dynamic-wallpapers-plugin` (the plugin id) for consistency:

```bash
mkdir -p "<path-to-your-vault>/.obsidian/plugins/dynamic-wallpapers-plugin"
```

Replace `<path-to-your-vault>` with the absolute path to your vault (for example, `~/Documents/MyVault`). If you already have a plugin folder under a different name (e.g. `obsidian-dynamic-wallpapers`) with a working symlink, just reuse it.

## 3. Remove the existing `build` directory

The build script writes to a `build/` folder inside the project. Before you can replace it with a symbolic link, the folder must not exist as a real directory:

```bash
rm -rf build
```

If you cloned fresh, this folder may not exist yet, in which case the `rm` is a no-op.

## 4. Create a symbolic link to the vault

Link the project's `build/` directory to your vault's plugin folder so every rebuild is picked up by Obsidian:

```bash
ln -s "$(pwd)/build" "<path-to-your-vault>/.obsidian/plugins/dynamic-wallpapers-plugin"
```

Verify the symlink points the right way:

```bash
ls -la build
# build -> /path/to/your/vault/.obsidian/plugins/dynamic-wallpapers-plugin
```

> ⚠️ If you ever accidentally create the vault folder as a real directory, Obsidian will load it instead of the symlink target. If wallpapers stop loading after pulling changes, double-check that the symlink in step 4 still resolves to your vault and that you haven't overwritten it with a real folder.

## 5. Install the Hot-Reload plugin (highly recommended)

Obsidian normally requires a full restart (or a reload of the plugin) after every change. Install **[Hot-Reload](https://github.com/pjeby/hot-reload)** from Community Plugins to have your changes appear automatically:

1. Open Obsidian → Settings → Community Plugins → Browse.
2. Search for **Hot-Reload** by pjeby and install it.
3. Enable the plugin.

With Hot-Reload enabled, every time you save a file, the plugin will be rebuilt and reloaded in Obsidian without needing to restart the app.

## 6. Run the dev build

Start the watch-mode build from the project root:

```bash
npm run dev
```

This runs esbuild in watch mode and writes the bundled output into `build/`. Thanks to the symlink, the updated `main.js`, `manifest.json`, and `styles.css` show up immediately in your vault and are picked up by Hot-Reload.

To create a one-off production build (for a release), run:

```bash
npm run build
```

This first type-checks the TypeScript sources, then bundles a minified `main.js`.

## 7. Verify in Obsidian

1. Open your vault in Obsidian.
2. Go to Settings → Community Plugins.
3. Make sure Restricted Mode is off, then enable **Dynamic Wallpaper** (it should appear in the list because of the symlink).
4. Edit a note to add a `wallpaper` frontmatter property, or open the Wallpaper Picker from the command palette.

If anything looks wrong, check the developer console (`Ctrl/Cmd + Shift + I`) for errors.

## Troubleshooting

- **Plugin doesn't appear in the Community Plugins list** — confirm the symlink resolves correctly and that `build/manifest.json` exists. Run `cat <path-to-your-vault>/.obsidian/plugins/dynamic-wallpapers-plugin/manifest.json` to verify.
- **Build errors after pulling new changes** — delete `node_modules` and run `npm install` again, then `npm run build` once to refresh `build/`.
- **Hot-Reload isn't reloading** — make sure Hot-Reload itself is enabled, and that the plugin you are editing is enabled in Community Plugins. Some structural changes (e.g. adding/removing commands) still require a full reload.

## Project conventions

See [`AGENTS.md`](./AGENTS.md) for the full agent and contributor guidelines, including the TypeScript/Svelte style rules, naming conventions, and the `store.ts` pattern used for plugin settings.
