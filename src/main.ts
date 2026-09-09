import { AbstractInputSuggest, type App, FileSystemAdapter, MetadataCache, Notice, Plugin, PluginSettingTab, type Setting, type SettingDefinitionItem, TFile, TFolder, type TAbstractFile } from 'obsidian';
import { DEFAULT_SETTINGS, type PluginSettings } from './settings';
import { WallpaperModal } from './WallpaperModal';
import { RelatedWallpapersModal } from './RelatedWallpapersModal';
import type {
  InheritanceTier,
  RelatedWallpaperGroup,
  RelatedWallpaperItem,
} from './RelatedWallpapersList.types';
import { WallpaperCache } from './WallpaperCache';

/**
 * Type-ahead over every frontmatter key used anywhere in the vault. The
 * declarative `text` control has no suggest hook, which is why the two
 * property-name settings use a `render` callback instead of a `control`.
 */
class FrontmatterPropertySuggest extends AbstractInputSuggest<string> {
  constructor(
    app: App,
    inputEl: HTMLInputElement,
    private readonly onPick: (value: string) => void
  ) {
    super(app, inputEl);
  }

  protected getSuggestions(query: string): string[] {
    const keys = new Set<string>();
    for (const file of this.app.vault.getMarkdownFiles()) {
      const frontmatter =
        this.app.metadataCache.getFileCache(file)?.frontmatter;
      if (!frontmatter) continue;
      for (const key of Object.keys(frontmatter)) {
        if (key !== 'position') keys.add(key);
      }
    }

    const lowerQuery = query.toLowerCase();
    return [...keys]
      .filter((key) => key.toLowerCase().includes(lowerQuery))
      .sort()
      .slice(0, 10);
  }

  renderSuggestion(value: string, el: HTMLElement): void {
    el.setText(value);
  }

  selectSuggestion(value: string): void {
    // setValue() writes straight to the input element, so the TextComponent
    // sees the new text but its onChange never fires — persist it ourselves.
    this.setValue(value);
    this.onPick(value);
    this.close();
  }
}

class DynamicWallpaperSettingTab extends PluginSettingTab {
  plugin: DynamicWallpaperPlugin;

  constructor(app: App, plugin: DynamicWallpaperPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  getSettingDefinitions(): SettingDefinitionItem<keyof PluginSettings & string>[] {
    return [
      {
        name: 'Wallpaper property',
        desc: "The frontmatter property name used to set a note's wallpaper.",
        render: (setting) =>
          this.renderPropertyInput(
            setting,
            'wallpaperProperty',
            'e.g. wallpaper'
          ),
      },
      {
        name: 'Wallpapers property',
        desc: 'The frontmatter property name holding a list of wallpapers. When a note has this list, one entry is picked at random every time the note is opened. Takes priority over the single wallpaper property.',
        render: (setting) =>
          this.renderPropertyInput(
            setting,
            'wallpapersProperty',
            'e.g. wallpapers'
          ),
      },
      {
        name: 'Wallpapers directory',
        desc: 'The folder containing your wallpapers.',
        control: {
          type: 'folder',
          key: 'wallpapersPath',
          placeholder: 'e.g. Extras/Wallpapers',
          includeRoot: true,
        },
      },
      {
        name: 'Keep existing wallpaper',
        desc: 'When enabled, the last wallpaper remains visible if the current note has no wallpaper set. When disabled, notes without a wallpaper show a blank background.',
        control: { type: 'toggle', key: 'keepExistingWallpaper' },
      },
      {
        type: 'group',
        heading: 'Inheritance',
        items: [
          {
            name: 'Inheritance property',
            desc: 'Check outlinks in this specific frontmatter property for wallpapers.',
            render: (setting) =>
              this.renderPropertyInput(
                setting,
                'inheritanceProperty',
                'e.g. areas'
              ),
          },
          {
            name: 'Inherit from all frontmatter links',
            desc: 'Check all frontmatter outlinks for wallpapers.',
            control: { type: 'toggle', key: 'inheritFromFrontmatterLinks' },
          },
          {
            name: 'Inherit from body links',
            desc: 'Check inline body links for wallpapers (last link checked first).',
            control: { type: 'toggle', key: 'inheritFromBodyLinks' },
          },
          {
            name: 'Inherit from backlinks',
            desc: 'After all outgoing link sources are exhausted, check notes that link to this one for a wallpaper. This is the lowest priority.',
            control: { type: 'toggle', key: 'inheritFromBacklinks' },
          },
        ],
      },
      {
        type: 'group',
        heading: 'Overlay',
        items: [
          {
            name: 'Overlay opacity (light mode)',
            desc: 'The opacity of the overlay on top of the wallpaper in light mode.',
            control: {
              type: 'slider',
              key: 'overlayOpacityLight',
              min: 0,
              max: 1,
              step: 0.05,
            },
          },
          {
            name: 'Overlay opacity (dark mode)',
            desc: 'The opacity of the overlay on top of the wallpaper in dark mode.',
            control: {
              type: 'slider',
              key: 'overlayOpacityDark',
              min: 0,
              max: 1,
              step: 0.05,
            },
          },
        ],
      },
    ];
  }

  /**
   * Mutates and persists `plugin.settings` for declarative `control`
   * definitions. The inherited implementation writes the value but doesn't
   * go through `saveSettings()`, so the wallpaper and overlay CSS variables
   * would only catch up on the next note switch.
   */
  async setControlValue(key: string, value: unknown): Promise<void> {
    Object.assign(this.plugin.settings, { [key]: value });
    await this.plugin.saveSettings();
  }

  private renderPropertyInput(
    setting: Setting,
    key: 'wallpaperProperty' | 'wallpapersProperty' | 'inheritanceProperty',
    placeholder: string
  ): void {
    setting.addText((text) => {
      const persist = (value: string) => {
        this.plugin.settings[key] = value;
        void this.plugin.saveSettings();
      };

      text
        .setPlaceholder(placeholder)
        .setValue(this.plugin.settings[key])
        .onChange(persist);

      new FrontmatterPropertySuggest(this.app, text.inputEl, persist);
    });
  }
}

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg'];

function isImageFile(file: TFile): boolean {
  return IMAGE_EXTENSIONS.includes(file.extension.toLowerCase());
}

/**
 * Normalize a frontmatter value to a list of non-empty strings. A scalar
 * becomes a one-element list; anything that isn't a string is dropped.
 */
function toStringList(value: unknown): string[] {
  const entries = Array.isArray(value) ? value : [value];
  return entries.filter(
    (entry): entry is string =>
      typeof entry === 'string' && entry.trim().length > 0
  );
}

/** Fisher-Yates shuffle over a copy of `items`. */
function shuffle<T>(items: T[]): T[] {
  const shuffled = items.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * `frontmatterLinks` flattens list-valued properties, so a link under
 * `areas` arrives keyed `areas.0`. Match both the bare key and the
 * indexed form.
 */
function frontmatterKeyMatches(key: string, property: string): boolean {
  if (!property) return false;
  return key === property || key.startsWith(`${property}.`);
}

/** A single wallpaper choice: the raw frontmatter value plus the file it
 * resolved to (null when the value doesn't name anything in the vault). */
interface WallpaperPick {
  file: TFile | null;
  rawValue: string;
}

const TIER_META: Record<
  InheritanceTier,
  { label: string; description: string }
> = {
  direct: {
    label: 'Direct',
    description: 'Wallpaper property set directly on this note.',
  },
  'inheritance-property': {
    label: 'Inheritance Property',
    description:
      'Notes linked from the configured inheritance frontmatter key.',
  },
  'frontmatter-links': {
    label: 'Frontmatter Links',
    description:
      'Wallpapers found on notes linked in any other frontmatter property.',
  },
  'body-links': {
    label: 'Body Links',
    description:
      'Wallpapers found on notes linked inline in the note body (last link wins).',
  },
  backlinks: {
    label: 'Backlinks',
    description:
      'Notes that link to this one and have their own wallpaper set.',
  },
};

export default class DynamicWallpaperPlugin extends Plugin {
  settings: PluginSettings = DEFAULT_SETTINGS;
  private opacityNoticeTimeout: number | null = null;
  private currentWallpaper: TFile | null = null;
  /**
   * Path of the note the on-screen wallpaper was chosen for. While this
   * stays the active note, edits to it don't re-roll the pick — see
   * `updateWallpaper`.
   */
  private currentWallpaperNotePath: string | null = null;
  private wallpaperCache!: WallpaperCache;
  private syncDebounceTimer: number | null = null;

  async onload() {
    await this.loadSettings();

    if (this.manifest.dir) {
      this.wallpaperCache = new WallpaperCache(this.app, this.manifest.dir);
    }

    this.addSettingTab(new DynamicWallpaperSettingTab(this.app, this));

    // Initial Sync
    void this.syncWallpapers();

    this.registerEvent(
      this.app.vault.on('modify', (file) => this.handleFileEvent(file))
    );
    this.registerEvent(
      this.app.vault.on('create', (file) => this.handleFileEvent(file))
    );
    this.registerEvent(
      this.app.vault.on('delete', (file) => this.handleFileEvent(file))
    );

    this.addCommand({
      id: 'pick-random-wallpaper',
      name: 'Pick random wallpaper',
      callback: () => {
        void this.pickRandomWallpaper();
      },
    });

    this.addCommand({
      id: 'view-related-wallpapers',
      name: 'View related wallpapers',
      callback: () => {
        void this.viewRelatedWallpapers();
      },
    });

    this.addCommand({
      id: 'pick-random-related-wallpaper',
      name: 'Pick random related wallpaper',
      callback: () => {
        void this.pickRandomRelatedWallpaper();
      },
    });

    this.addCommand({
      id: 'choose-wallpaper',
      name: 'Choose wallpaper',
      callback: () => {
        void this.openWallpaperPicker();
      },
    });

    this.addCommand({
      id: 'clear-thumbnail-cache',
      name: 'Clear thumbnail cache',
      callback: async () => {
        if (!this.wallpaperCache) {
          new Notice('Cache is not available.');
          return;
        }
        const removed = await this.wallpaperCache.clearCache();
        if (removed === 0) {
          new Notice('Thumbnail cache is already empty.');
        } else {
          new Notice(`Cleared ${removed} thumbnail${removed === 1 ? '' : 's'}.`);
        }
        // The picker (and related modals) call getCachedUrl() on every
        // render, which falls back to the original resource path when no
        // cache file exists — so open dialogs immediately reflect the
        // cleared state without us doing anything else.
      },
    });

    this.addCommand({
      id: 'rebuild-thumbnail-cache',
      name: 'Rebuild thumbnail cache',
      callback: async () => {
        if (!this.wallpaperCache) {
          new Notice('Cache is not available.');
          return;
        }
        const folder = this.getWallpapersFolder();
        if (!folder) {
          new Notice('Wallpaper directory not found.');
          return;
        }
        // rebuildCache() clears first, then re-syncs. It returns the
        // number of items queued so we can skip the Notice when the
        // source folder has no images (nothing to rebuild).
        const queued = await this.wallpaperCache.rebuildCache(folder);
        if (queued === 0) {
          new Notice('No images to cache in the wallpapers folder.');
        }
        // When queued > 0, WallpaperCache's own progress Notice ("Generating
        // thumbnails: 0/N") already communicates what's happening, so we
        // intentionally don't pile a second Notice on top.
      },
    });

    this.addCommand({
      id: 'increase-overlay-opacity',
      name: 'Increase overlay opacity',
      callback: () => {
        this.changeOverlayOpacity(0.05);
      },
    });

    this.addCommand({
      id: 'decrease-overlay-opacity',
      name: 'Decrease overlay opacity',
      callback: () => {
        this.changeOverlayOpacity(-0.05);
      },
    });

    this.addCommand({
      id: 'set-current-wallpaper-to-note',
      name: 'Set current wallpaper to note',
      callback: async () => {
        const wallpaper = this.currentWallpaper;
        if (!wallpaper) {
          new Notice('No wallpaper currently set.');
          return;
        }
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile) {
          const link = `[[${wallpaper.name}]]`;
          // Boxed so TypeScript doesn't narrow it to the initial value —
          // it can't see that processFrontMatter runs the callback.
          const result: { outcome: 'set' | 'appended' | 'already-in-pool' } = {
            outcome: 'set',
          };
          try {
            await this.app.fileManager.processFrontMatter(
              activeFile,
              (frontmatter: Record<string, unknown>) => {
                const property = this.settings.wallpapersProperty;
                const raw = property ? frontmatter[property] : undefined;
                const pool = toStringList(raw);

                if (pool.length === 0) {
                  frontmatter[this.settings.wallpaperProperty] = link;
                  return;
                }

                // A non-empty pool wins over the singular property, so
                // writing the scalar here would have no visible effect —
                // add the wallpaper to the pool instead.
                const alreadyInPool = pool.some(
                  (value) =>
                    this.resolveWallpaperValue(value, activeFile.path)
                      ?.path === wallpaper.path
                );
                if (alreadyInPool) {
                  result.outcome = 'already-in-pool';
                  return;
                }

                result.outcome = 'appended';
                if (Array.isArray(raw)) {
                  raw.push(link);
                } else {
                  frontmatter[property] = [...pool, link];
                }
              }
            );
            if (result.outcome === 'already-in-pool') {
              new Notice(`${link} is already in this note's wallpapers.`);
            } else if (result.outcome === 'appended') {
              new Notice(`Added ${link} to this note's wallpapers.`);
            } else {
              new Notice(`Wallpaper updated to ${link}`);
            }
          } catch (err) {
            console.error('Failed to update frontmatter', err);
            new Notice('Failed to update wallpaper in frontmatter.');
          }
        } else {
          new Notice('No active file.');
        }
      },
    });

    this.addCommand({
      id: 'refresh-wallpaper',
      name: 'Refresh wallpaper',
      callback: () => {
        this.updateWallpaper({ reroll: true });
      },
    });

    this.addCommand({
      id: 'flip-current-wallpaper',
      name: 'Flip current wallpaper (horizontal)',
      callback: async () => {
        if (!this.currentWallpaper) {
          new Notice('No wallpaper currently set.');
          return;
        }

        const adapter = this.app.vault.adapter;
        if (!(adapter instanceof FileSystemAdapter)) {
          new Notice('Cannot determine file path.');
          return;
        }

        try {
          // Read source into memory, decode, draw mirrored into a canvas,
          // then write the resulting bytes back through the vault adapter.
          // This mirrors the original ffmpeg-based flip behavior — the
          // source image is overwritten in place — without needing an
          // external binary.
          const bytes = await adapter.readBinary(this.currentWallpaper.path);
          const blob = new Blob([bytes]);
          const probe = await createImageBitmap(blob);
          const canvas = activeDocument.createElement('canvas');
          canvas.width = probe.width;
          canvas.height = probe.height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            new Notice('Failed to acquire canvas context.');
            probe.close();
            return;
          }
          // Mirror: translate, then scale x by -1, then draw the image
          // at its negative width so the unflipped original lands
          // reflected on the canvas.
          ctx.translate(canvas.width, 0);
          ctx.scale(-1, 1);
          ctx.drawImage(probe, 0, 0);
          probe.close();

          const flipped = await new Promise<Blob | null>((resolve) =>
            canvas.toBlob(resolve, 'image/png')
          );
          if (!flipped) {
            new Notice('Failed to encode flipped image.');
            return;
          }
          const arrayBuffer = await flipped.arrayBuffer();
          await adapter.writeBinary(this.currentWallpaper.path, arrayBuffer);

          new Notice('Image flipped successfully!');
          // Wait a bit for the file system to settle and Obsidian to detect the change
          window.setTimeout(() => {
            this.updateWallpaper();
          }, 500);
        } catch (err) {
          console.error('Error flipping image:', err);
          new Notice('Error flipping image.');
        }
      },
    });

    this.updateWallpaper();

    // Listen for active file changes
    this.registerEvent(
      this.app.workspace.on('active-leaf-change', () => {
        this.updateWallpaper();
      })
    );

    // Listen for file modifications
    this.registerEvent(
      this.app.metadataCache.on('changed', (file: TFile) => {
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile && activeFile.path === file.path) {
          this.updateWallpaper();
        }
      })
    );
  }

  async loadSettings() {
    const loaded = (await this.loadData()) as Partial<PluginSettings> | null;
    this.settings = { ...DEFAULT_SETTINGS, ...(loaded ?? {}) };
  }

  async saveSettings() {
    await this.saveData(this.settings);
    this.updateWallpaper(); // Update wallpaper immediately when settings change
  }

  syncWallpapers() {
    if (this.syncDebounceTimer) {
      window.clearTimeout(this.syncDebounceTimer);
    }

    this.syncDebounceTimer = window.setTimeout(() => {
      void (async () => {
        const { wallpapersPath } = this.settings;
        const folder = this.app.vault.getAbstractFileByPath(wallpapersPath);
        if (folder instanceof TFolder && this.wallpaperCache) {
          await this.wallpaperCache.sync(folder);
        }
        this.syncDebounceTimer = null;
      })();
    }, 1000);
  }

  handleFileEvent(file: TAbstractFile) {
    if (file.path.startsWith(this.settings.wallpapersPath)) {
      this.syncWallpapers();
    }
  }

  changeOverlayOpacity(delta: number) {
    const isDarkMode = activeDocument.body.classList.contains('theme-dark');
    const key = isDarkMode ? 'overlayOpacityDark' : 'overlayOpacityLight';

    // Round to 2 decimal places
    const newOpacity =
      Math.round(
        Math.max(0, Math.min(1, this.settings[key] + delta)) * 100
      ) / 100;

    this.settings[key] = newOpacity;
    void this.saveSettings();

    if (this.opacityNoticeTimeout) {
      window.clearTimeout(this.opacityNoticeTimeout);
    }

    this.opacityNoticeTimeout = window.setTimeout(() => {
      new Notice(
        `${isDarkMode ? 'Dark' : 'Light'} Mode Opacity: ${newOpacity}`
      );
    }, 500);
  }

  async openWallpaperPicker() {
    const { wallpapersPath } = this.settings;
    const folder = this.app.vault.getAbstractFileByPath(wallpapersPath);

    if (folder instanceof TFolder) {
      if (this.wallpaperCache) {
        await this.wallpaperCache.sync(folder);
      }

      const wallpapers = folder.children
        .filter(
          (file): file is TFile => file instanceof TFile && isImageFile(file)
        )
        .map((file) => ({
          file,
          url: this.wallpaperCache
            ? this.wallpaperCache.getCachedUrl(file)
            : this.app.vault.getResourcePath(file),
        }));

      if (wallpapers.length > 0) {
        new WallpaperModal(this.app, wallpapers, (file) => {
          this.pinWallpaper(file);
          const wallpaperUrl = this.app.vault.getResourcePath(file);
          activeDocument.body.style.setProperty(
            '--background-image',
            `url("${wallpaperUrl}")`
          );
        }).open();
      } else {
        new Notice('No images found in the specified wallpaper directory.');
      }
    } else {
      new Notice('Wallpaper directory not found.');
    }
  }

  /**
   * Resolve the configured Wallpapers Directory to a TFolder. Used by the
   * cache-management commands (Clear / Rebuild) to know which source folder
   * to operate against. Returns null when the path is missing or doesn't
   * point at a folder — callers should surface a Notice in that case.
   */
  private getWallpapersFolder(): TFolder | null {
    const folder = this.app.vault.getAbstractFileByPath(
      this.settings.wallpapersPath
    );
    return folder instanceof TFolder ? folder : null;
  }

  async pickRandomWallpaper() {
    // "Pick random wallpaper" draws from the whole Wallpapers Directory —
    // every image in the configured folder is a candidate, regardless of
    // what the active note links to. (For a draw restricted to the active
    // note's inheritance chain, use "Pick random related wallpaper".) We
    // never reuse the wallpaper that's already on screen; if it's the only
    // image in the folder we leave the current selection alone.
    const folder = this.getWallpapersFolder();
    if (!folder) {
      new Notice('Wallpaper directory not found.');
      return;
    }

    const wallpapers = folder.children.filter(
      (file): file is TFile => file instanceof TFile && isImageFile(file)
    );

    if (wallpapers.length === 0) {
      new Notice('No images found in the specified wallpaper directory.');
      return;
    }

    const currentPath = this.currentWallpaper?.path ?? null;
    // Shuffle so every non-current image is equally likely, then take the
    // first pick that isn't already displayed.
    const picked = shuffle(wallpapers).find((f) => f.path !== currentPath);
    if (!picked) {
      new Notice('Current wallpaper is the only wallpaper available.');
      return;
    }

    this.pinWallpaper(picked);
    const wallpaperUrl = this.app.vault.getResourcePath(picked);
    activeDocument.body.style.setProperty(
      '--background-image',
      `url("${wallpaperUrl}")`
    );
    new Notice(`Picked: ${picked.name}`);
  }

  async viewRelatedWallpapers() {
    // Show every wallpaper that could possibly apply to the active note,
    // grouped by which inheritance tier produced it. Each card links back
    // to the note that contributed the wallpaper so the user can jump to it.
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) {
      new Notice('No active note.');
      return;
    }

    const groups = this.collectRelatedWallpapers(activeFile);
    const totalCount = groups.reduce((sum, g) => sum + g.items.length, 0);

    if (totalCount === 0) {
      new Notice('No related wallpapers found for this note.');
      return;
    }

    new RelatedWallpapersModal(
      this.app,
      groups,
      (sourcePath) => {
        const target = this.app.vault.getAbstractFileByPath(sourcePath);
        if (target instanceof TFile) {
          const leaf = this.app.workspace.getLeaf(false);
          if (leaf) {
            void leaf.openFile(target);
          }
        }
      },
      (item, file) => {
        if (!file) {
          // The card was clicked but its raw frontmatter value didn't
          // resolve to an attachment in the vault — there's nothing we
          // can put on screen. Surface a Notice so the click isn't
          // silently swallowed.
          new Notice(`Couldn't resolve "${item.rawValue}" to a file.`);
          return;
        }
        // Same handler the picker uses: track the new current, apply it.
        this.pinWallpaper(file);
        const wallpaperUrl = this.app.vault.getResourcePath(file);
        activeDocument.body.style.setProperty(
          '--background-image',
          `url("${wallpaperUrl}")`,
        );
        new Notice(`Wallpaper set to ${file.name}`);
      },
    ).open();
  }

  async pickRandomRelatedWallpaper() {
    // Pick a random wallpaper from the SAME pool that
    // `viewRelatedWallpapers` displays (every tier, deduped by resolved
    // file). Unlike `pickRandomWallpaper`, this never falls back to
    // anything outside the related set: if there are no related
    // wallpapers, or the only candidate resolves to the wallpaper that's
    // already on screen, we just notify and leave things alone.
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) {
      new Notice('No active note.');
      return;
    }

    const groups = this.collectRelatedWallpapers(activeFile);
    const candidates: TFile[] = [];
    const seen = new Set<string>(); // dedupe by resolved file path
    for (const group of groups) {
      for (const item of group.items) {
        if (!(item.wallpaperFile instanceof TFile)) continue;
        if (seen.has(item.wallpaperFile.path)) continue;
        seen.add(item.wallpaperFile.path);
        candidates.push(item.wallpaperFile);
      }
    }

    if (candidates.length === 0) {
      new Notice('No related wallpapers found for this note.');
      return;
    }

    const currentPath = this.currentWallpaper?.path ?? null;
    // If every candidate is the wallpaper already on screen, there's
    // nothing different to pick — don't churn the current selection.
    if (currentPath && candidates.every((f) => f.path === currentPath)) {
      new Notice('Current wallpaper is the only related wallpaper.');
      return;
    }

    // Shuffle so any of the non-current candidates is equally likely,
    // then pick the first one that differs from the wallpaper currently
    // displayed. Every entry of a `wallpapers` list is its own candidate,
    // so a note offering three wallpapers carries three times the weight.
    const picked = shuffle(candidates).find((f) => f.path !== currentPath);
    if (!picked) return; // unreachable given the early-return above, but
                          // keeps the type-narrowing explicit.

    this.pinWallpaper(picked);
    const wallpaperUrl = this.app.vault.getResourcePath(picked);
    activeDocument.body.style.setProperty(
      '--background-image',
      `url("${wallpaperUrl}")`
    );
    new Notice(`Picked: ${picked.name}`);
  }

  /**
   * Walk every inheritance tier for `targetFile` independently (no
   * short-circuiting) and collect each wallpaper with the note that caused
   * it to be picked. Returns groups in priority order.
   */
  private collectRelatedWallpapers(targetFile: TFile): RelatedWallpaperGroup[] {
    const groups: RelatedWallpaperGroup[] = [];

    // Tier 1: direct frontmatter on the active note itself.
    const direct = this.collectTierWallpapers(targetFile, 'direct', () =>
      // Each entry of a `wallpapers` list becomes its own card.
      this.readWallpaperValues(targetFile).map((link) => ({ link }))
    );
    groups.push(direct);

    // Tier 2: inheritance property (frontmatter links under a specific key).
    if (this.settings.inheritanceProperty) {
      const items = this.collectTierWallpapers(
        targetFile,
        'inheritance-property',
        () => {
          const meta = this.app.metadataCache.getFileCache(targetFile);
          return (meta?.frontmatterLinks ?? []).filter((l) =>
            frontmatterKeyMatches(l.key, this.settings.inheritanceProperty)
          );
        }
      );
      groups.push(items);
    }

    // Tier 3: any other frontmatter links.
    if (this.settings.inheritFromFrontmatterLinks) {
      const items = this.collectTierWallpapers(
        targetFile,
        'frontmatter-links',
        () => {
          const meta = this.app.metadataCache.getFileCache(targetFile);
          return this.inheritableFrontmatterLinks(meta?.frontmatterLinks ?? []);
        }
      );
      groups.push(items);
    }

    // Tier 4: body links (last link checked first, matching resolveWallpaperForFile).
    if (this.settings.inheritFromBodyLinks) {
      const items = this.collectTierWallpapers(
        targetFile,
        'body-links',
        () => {
          const meta = this.app.metadataCache.getFileCache(targetFile);
          return (meta?.links ?? []).slice().reverse();
        }
      );
      groups.push(items);
    }

    // Tier 5: backlinks.
    if (this.settings.inheritFromBacklinks) {
      const items = this.collectTierWallpapers(targetFile, 'backlinks', () => {
        const resolvedLinks = this.app.metadataCache.resolvedLinks;
        const backlinks: { link: string }[] = [];
        for (const [sourcePath, destinations] of Object.entries(
          resolvedLinks
        )) {
          if (targetFile.path in destinations) {
            backlinks.push({ link: sourcePath });
          }
        }
        return backlinks;
      });
      groups.push(items);
    }

    return groups.filter((g) => g.items.length > 0);
  }

  /**
   * For one tier, build the items array by reading the tier's links and
   * turning each one into a RelatedWallpaperItem. `tier` picks which label
   * and description to use; `getLinks` returns the relevant link cache for
   * the active note.
   */
  private collectTierWallpapers(
    activeFile: TFile,
    tier: InheritanceTier,
    getLinks: () => { link: string }[]
  ): RelatedWallpaperGroup {
    const meta = TIER_META[tier];
    const items: RelatedWallpaperItem[] = [];
    const seen = new Set<string>(); // dedupe by rawValue|sourcePath

    for (const entry of getLinks()) {
      // The direct tier's "link" is the wallpaper value itself, not an
      // outgoing link to follow. The source note is the active note.
      if (tier === 'direct') {
        const wallpaperValue = String(entry.link);
        const cleanValue = wallpaperValue.replace(/\[\[|\]\]/g, '');
        const dedupeKey = `${cleanValue}|${activeFile.path}|direct`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);

        const wallpaperFile = this.app.metadataCache.getFirstLinkpathDest(
          cleanValue,
          activeFile.path
        );

        items.push({
          wallpaperFile: wallpaperFile instanceof TFile ? wallpaperFile : null,
          url:
            wallpaperFile instanceof TFile
              ? this.app.vault.getResourcePath(wallpaperFile)
              : null,
          rawValue: wallpaperValue,
          displayName: this.cleanWallpaperLabel(wallpaperValue),
          sourceFile: activeFile,
          sourcePath: activeFile.path,
          tier,
        });
        continue;
      }

      // Outgoing-link tiers resolve the link target itself; the source note
      // is the active note. The backlinks tier is the inverse: the link
      // points AT the active note, so the link *is* the source.
      const isBacklinkTier = tier === 'backlinks';

      const sourceFile = isBacklinkTier
        ? this.resolveBacklinkSource(entry.link)
        : activeFile;
      if (!sourceFile) continue;

      // The actual wallpaper values come from the source note's
      // frontmatter. A `wallpapers` list contributes one card per entry.
      const wallpaperValues = isBacklinkTier
        ? this.readWallpaperValues(sourceFile)
        : this.readWallpaperValuesFromLink(entry.link, sourceFile.path);

      for (const wallpaperValue of wallpaperValues) {
        const cleanValue = wallpaperValue.replace(/\[\[|\]\]/g, '');
        const dedupeKey = `${cleanValue}|${sourceFile.path}|${tier}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);

        const wallpaperFile = this.app.metadataCache.getFirstLinkpathDest(
          cleanValue,
          sourceFile.path
        );

        items.push({
          wallpaperFile: wallpaperFile instanceof TFile ? wallpaperFile : null,
          url:
            wallpaperFile instanceof TFile
              ? this.app.vault.getResourcePath(wallpaperFile)
              : null,
          rawValue: wallpaperValue,
          displayName: this.cleanWallpaperLabel(wallpaperValue),
          sourceFile,
          sourcePath: sourceFile.path,
          tier,
        });
      }
    }

    return {
      tier,
      label: meta.label,
      description: meta.description,
      items,
    };
  }

  /**
   * Resolve a backlink entry's source path back to a TFile in the vault.
   */
  private resolveBacklinkSource(sourcePath: string): TFile | null {
    const file = this.app.vault.getAbstractFileByPath(sourcePath);
    return file instanceof TFile ? file : null;
  }

  /**
   * Strip wiki-link brackets (and any aliased `|alias` or `#heading` suffix)
   * so the card label reads as a clean filename.
   */
  private cleanWallpaperLabel(raw: string): string {
    let s = raw.replace(/\[\[|\]\]/g, '').trim();
    const pipe = s.indexOf('|');
    if (pipe >= 0) s = s.slice(0, pipe);
    const hash = s.indexOf('#');
    if (hash >= 0) s = s.slice(0, hash);
    const slash = s.lastIndexOf('/');
    if (slash >= 0) s = s.slice(slash + 1);
    return s || raw;
  }

  private collectBacklinkPaths(activeFile: TFile): string[] {
    // Prefer the private getBacklinksForFile API which walks the latest
    // link cache on every call (a true re-scan). Fall back to resolvedLinks
    // if the API is unavailable.
    const cache = this.app.metadataCache as MetadataCache & {
      getBacklinksForFile?: (file: TFile) => { keys(): IterableIterator<string> };
    };

    if (typeof cache.getBacklinksForFile === 'function') {
      const backlinks = cache.getBacklinksForFile(activeFile);
      const paths: string[] = [];
      for (const sourcePath of backlinks.keys()) {
        paths.push(sourcePath);
      }
      return paths;
    }

    const resolvedLinks = this.app.metadataCache.resolvedLinks;
    const paths: string[] = [];
    for (const [sourcePath, destinations] of Object.entries(resolvedLinks)) {
      if (activeFile.path in destinations) {
        paths.push(sourcePath);
      }
    }
    return paths;
  }

  /**
   * Read a file's wallpaper values as a flat list. The list property
   * (`wallpapers`) wins over the singular one (`wallpaper`); a scalar
   * normalizes to a one-element list and non-string entries are dropped.
   * Every frontmatter read goes through here so the array handling lives
   * in one place instead of at each call site.
   */
  private readWallpaperValues(file: TFile): string[] {
    const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
    if (!frontmatter) return [];

    const list = this.settings.wallpapersProperty
      ? toStringList(frontmatter[this.settings.wallpapersProperty])
      : [];
    if (list.length > 0) return list;

    return this.settings.wallpaperProperty
      ? toStringList(frontmatter[this.settings.wallpaperProperty])
      : [];
  }

  /**
   * Read the wallpaper values off a note reached via an outgoing link.
   * Returns an empty list if the target doesn't exist or has no wallpaper.
   */
  private readWallpaperValuesFromLink(
    link: string,
    sourcePath: string
  ): string[] {
    const linkedFile = this.app.metadataCache.getFirstLinkpathDest(
      link,
      sourcePath
    );
    return linkedFile instanceof TFile
      ? this.readWallpaperValues(linkedFile)
      : [];
  }

  /** Resolve a raw frontmatter value (`[[foo.png]]` or a path) to a file. */
  private resolveWallpaperValue(
    rawValue: string,
    sourcePath: string
  ): TFile | null {
    const clean = rawValue.replace(/\[\[|\]\]/g, '');
    const file = this.app.metadataCache.getFirstLinkpathDest(clean, sourcePath);
    return file instanceof TFile ? file : null;
  }

  /**
   * Pick one wallpaper out of a candidate list, re-rolled on every call
   * unless `stickyPath` is still among the entries — in that case the pick
   * that's already on screen wins, so editing a note doesn't shuffle its
   * wallpaper out from under the user.
   * Entries that don't resolve to a file are skipped rather than counted as
   * a failed pick, so a typo'd link can't blank the wallpaper 1-in-N times.
   * When nothing resolves the first raw value comes back as an unresolved
   * pick — callers keep it only as a last-resort fallback. Returns null for
   * an empty list.
   */
  private pickWallpaper(
    values: string[],
    sourcePath: string,
    stickyPath: string | null = null
  ): WallpaperPick | null {
    if (values.length === 0) return null;

    if (stickyPath) {
      for (const rawValue of values) {
        const file = this.resolveWallpaperValue(rawValue, sourcePath);
        if (file?.path === stickyPath) return { file, rawValue };
      }
    }

    for (const rawValue of shuffle(values)) {
      const file = this.resolveWallpaperValue(rawValue, sourcePath);
      if (file) return { file, rawValue };
    }

    return { file: null, rawValue: values[0] };
  }

  /**
   * Frontmatter links that are worth following for inheritance — i.e. every
   * link except the ones under the wallpaper properties themselves, which
   * point at images rather than at notes to inherit from.
   */
  private inheritableFrontmatterLinks<T extends { key: string }>(
    links: T[]
  ): T[] {
    return links.filter(
      (link) =>
        !frontmatterKeyMatches(link.key, this.settings.wallpaperProperty) &&
        !frontmatterKeyMatches(link.key, this.settings.wallpapersProperty)
    );
  }

  /**
   * Follow each link in turn and return the first pick that resolves to a
   * real file. Unresolvable values are stashed in `fallback` (first one
   * wins) so the search can keep walking the chain instead of stopping on
   * a broken link.
   */
  private findWallpaperFromLinks(
    links: { link: string }[],
    sourcePath: string,
    fallback: { pick: WallpaperPick | null },
    stickyPath: string | null = null
  ): WallpaperPick | null {
    for (const entry of links) {
      const linkedFile = this.app.metadataCache.getFirstLinkpathDest(
        entry.link, sourcePath
      );
      if (!(linkedFile instanceof TFile)) continue;

      const pick = this.pickWallpaper(
        this.readWallpaperValues(linkedFile),
        linkedFile.path,
        stickyPath
      );
      if (!pick) continue;
      if (pick.file) return pick;
      fallback.pick ??= pick;
    }
    return null;
  }

  /**
   * Resolve a wallpaper for an arbitrary note using the full priority chain
   * (direct → inheritance property → frontmatter links → body links →
   * backlinks of `targetFile`). Notes offering a `wallpapers` list get one
   * random entry per call, so every note activation re-rolls. Pass
   * `stickyPath` to keep that wallpaper whenever the winning tier still
   * offers it, instead of re-rolling. Returns null when no tier offers
   * anything at all.
   */
  private resolveWallpaperForFile(
    targetFile: TFile,
    stickyPath: string | null = null
  ): WallpaperPick | null {
    const metadata = this.app.metadataCache.getFileCache(targetFile);
    // Values that named a file we couldn't find. We keep the first one and
    // only fall back to it once every tier has come up empty, matching the
    // old behavior of rendering an unresolvable value as a raw CSS url.
    const fallback: { pick: WallpaperPick | null } = { pick: null };

    const direct = this.pickWallpaper(
      this.readWallpaperValues(targetFile),
      targetFile.path,
      stickyPath
    );
    if (direct?.file) return direct;
    if (direct) fallback.pick = direct;

    const tiers: { link: string }[][] = [];

    if (this.settings.inheritanceProperty) {
      tiers.push(
        (metadata?.frontmatterLinks ?? []).filter((l) =>
          frontmatterKeyMatches(l.key, this.settings.inheritanceProperty)
        )
      );
    }

    if (this.settings.inheritFromFrontmatterLinks) {
      tiers.push(
        this.inheritableFrontmatterLinks(metadata?.frontmatterLinks ?? [])
      );
    }

    if (this.settings.inheritFromBodyLinks) {
      tiers.push((metadata?.links ?? []).slice().reverse());
    }

    if (this.settings.inheritFromBacklinks) {
      tiers.push(
        this.collectBacklinkPaths(targetFile).map((link) => ({ link }))
      );
    }

    for (const links of tiers) {
      const pick = this.findWallpaperFromLinks(
        links,
        targetFile.path,
        fallback,
        stickyPath
      );
      if (pick) return pick;
    }

    return fallback.pick;
  }

  /**
   * Record a manually chosen wallpaper as the one on screen, keyed to the
   * active note so subsequent edits to that note don't re-roll past it.
   */
  private pinWallpaper(file: TFile | null) {
    this.currentWallpaper = file;
    this.currentWallpaperNotePath =
      this.app.workspace.getActiveFile()?.path ?? null;
  }

  /**
   * Re-resolve and apply the wallpaper for the active note. By default the
   * wallpaper already on screen is held onto whenever it's still a valid
   * candidate for that same note, so typing in a note doesn't cycle its
   * `wallpapers` pool on every keystroke. Switching notes re-rolls (the
   * held pick is keyed to the note it was chosen for), and
   * `{ reroll: true }` forces a fresh draw for the *Refresh wallpaper*
   * command.
   */
  private updateWallpaper(options?: { reroll?: boolean }) {
    // Update overlay opacity CSS variables
    activeDocument.body.style.setProperty(
      '--background-overlay-opacity-light',
      this.settings.overlayOpacityLight.toString()
    );
    activeDocument.body.style.setProperty(
      '--background-overlay-opacity-dark',
      this.settings.overlayOpacityDark.toString()
    );

    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) return;

    const stickyPath =
      options?.reroll || activeFile.path !== this.currentWallpaperNotePath
        ? null
        : this.currentWallpaper?.path ?? null;

    const pick = this.resolveWallpaperForFile(activeFile, stickyPath);
    this.currentWallpaperNotePath = activeFile.path;

    if (pick?.file) {
      this.currentWallpaper = pick.file;
      const wallpaperUrl = this.app.vault.getResourcePath(pick.file);
      activeDocument.body.style.setProperty(
        '--background-image',
        `url("${wallpaperUrl}")`
      );
    } else if (pick) {
      // The value didn't resolve to an attachment — fall back to using it
      // as a raw url, stripped of any wiki-link brackets.
      this.currentWallpaper = null;
      activeDocument.body.style.setProperty(
        '--background-image',
        `url("${pick.rawValue.replace(/\[\[|\]\]/g, '')}")`
      );
    } else if (!this.settings.keepExistingWallpaper) {
      this.currentWallpaper = null;
      activeDocument.body.style.removeProperty('--background-image');
    }
  }
}
