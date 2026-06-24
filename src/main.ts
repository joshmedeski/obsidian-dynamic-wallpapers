import { type App, FileSystemAdapter, MetadataCache, Notice, Plugin, PluginSettingTab, TFile, TFolder, type TAbstractFile } from 'obsidian';
import { mount, unmount } from 'svelte';
import SettingsTab from './SettingsTab.svelte';
import {
  DEFAULT_SETTINGS,
  initStore,
  type PluginSettings,
  pluginSettings,
} from './store';
import { WallpaperModal } from './WallpaperModal';
import { RelatedWallpapersModal } from './RelatedWallpapersModal';
import type {
  InheritanceTier,
  RelatedWallpaperGroup,
  RelatedWallpaperItem,
} from './RelatedWallpapersList.types';
import { WallpaperCache } from './WallpaperCache';

class DynamicWallpaperSettingTab extends PluginSettingTab {
  component: any;
  plugin: DynamicWallpaperPlugin;

  constructor(app: App, plugin: DynamicWallpaperPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    this.component = mount(SettingsTab, {
      target: containerEl,
      props: {
        app: this.app,
      },
    });
  }

  hide() {
    if (this.component) {
      unmount(this.component);
    }
  }
}

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg'];

function isImageFile(file: TFile): boolean {
  return IMAGE_EXTENSIONS.includes(file.extension.toLowerCase());
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
  private opacityNoticeTimeout: NodeJS.Timeout | null = null;
  private currentWallpaper: TFile | null = null;
  private wallpaperCache!: WallpaperCache;
  private syncDebounceTimer: NodeJS.Timeout | null = null;

  async onload() {
    await this.loadSettings();
    initStore(this);

    if (this.manifest.dir) {
      this.wallpaperCache = new WallpaperCache(this.app, this.manifest.dir);
    }

    this.addSettingTab(new DynamicWallpaperSettingTab(this.app, this));

    // Initial Sync
    this.syncWallpapers();

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
      name: 'Pick Random Wallpaper',
      callback: () => {
        this.pickRandomWallpaper();
      },
    });

    this.addCommand({
      id: 'view-related-wallpapers',
      name: 'View Related Wallpapers',
      callback: () => {
        this.viewRelatedWallpapers();
      },
    });

    this.addCommand({
      id: 'pick-random-related-wallpaper',
      name: 'Pick Random Related Wallpaper',
      callback: () => {
        this.pickRandomRelatedWallpaper();
      },
    });

    this.addCommand({
      id: 'choose-wallpaper',
      name: 'Choose Wallpaper',
      callback: () => {
        this.openWallpaperPicker();
      },
    });

    this.addCommand({
      id: 'clear-thumbnail-cache',
      name: 'Clear Thumbnail Cache',
      callback: async () => {
        if (!this.wallpaperCache) {
          new Notice('Cache is not available.');
          return;
        }
        const removed = this.wallpaperCache.clearCache();
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
      name: 'Rebuild Thumbnail Cache',
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
      name: 'Increase Overlay Opacity',
      callback: () => {
        this.changeOverlayOpacity(0.05);
      },
    });

    this.addCommand({
      id: 'decrease-overlay-opacity',
      name: 'Decrease Overlay Opacity',
      callback: () => {
        this.changeOverlayOpacity(-0.05);
      },
    });

    this.addCommand({
      id: 'set-current-wallpaper-to-note',
      name: 'Set Current Wallpaper to Note',
      callback: async () => {
        const wallpaper = this.currentWallpaper;
        if (!wallpaper) {
          new Notice('No wallpaper currently set.');
          return;
        }
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile) {
          try {
            await this.app.fileManager.processFrontMatter(
              activeFile,
              (frontmatter) => {
                frontmatter[this.settings.wallpaperProperty] = `[[${wallpaper.name}]]`;
              }
            );
            new Notice(`Wallpaper updated to [[${wallpaper.name}]]`);
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
      name: 'Refresh Wallpaper',
      callback: () => {
        this.updateWallpaper();
      },
    });

    this.addCommand({
      id: 'flip-current-wallpaper',
      name: 'Flip Current Wallpaper (Horizontal)',
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
          const canvas = document.createElement('canvas');
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
          setTimeout(() => {
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
    this.settings = { ...DEFAULT_SETTINGS, ...(await this.loadData()) };
  }

  async saveSettings() {
    await this.saveData(this.settings);
    this.updateWallpaper(); // Update wallpaper immediately when settings change
  }

  async syncWallpapers() {
    if (this.syncDebounceTimer) {
      clearTimeout(this.syncDebounceTimer);
    }

    this.syncDebounceTimer = setTimeout(async () => {
      const { wallpapersPath } = this.settings;
      const folder = this.app.vault.getAbstractFileByPath(wallpapersPath);
      if (folder instanceof TFolder && this.wallpaperCache) {
        await this.wallpaperCache.sync(folder);
      }
      this.syncDebounceTimer = null;
    }, 1000);
  }

  async handleFileEvent(file: TAbstractFile) {
    if (file.path.startsWith(this.settings.wallpapersPath)) {
      this.syncWallpapers();
    }
  }

  changeOverlayOpacity(delta: number) {
    const isDarkMode = document.body.classList.contains('theme-dark');
    pluginSettings.update((settings) => {
      let newOpacity: number;
      if (isDarkMode) {
        newOpacity = settings.overlayOpacityDark + delta;
        newOpacity = Math.max(0, Math.min(1, newOpacity));
        // Round to 2 decimal places
        newOpacity = Math.round(newOpacity * 100) / 100;

        if (this.opacityNoticeTimeout) {
          clearTimeout(this.opacityNoticeTimeout);
        }

        this.opacityNoticeTimeout = setTimeout(() => {
          new Notice(`Dark Mode Opacity: ${newOpacity}`);
        }, 500);

        return { ...settings, overlayOpacityDark: newOpacity };
      }
      newOpacity = settings.overlayOpacityLight + delta;
      newOpacity = Math.max(0, Math.min(1, newOpacity));
      // Round to 2 decimal places
      newOpacity = Math.round(newOpacity * 100) / 100;

      if (this.opacityNoticeTimeout) {
        clearTimeout(this.opacityNoticeTimeout);
      }

      this.opacityNoticeTimeout = setTimeout(() => {
        new Notice(`Light Mode Opacity: ${newOpacity}`);
      }, 500);

      return { ...settings, overlayOpacityLight: newOpacity };
    });
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
          file: file as TFile,
          url: this.wallpaperCache
            ? this.wallpaperCache.getCachedUrl(file as TFile)
            : this.app.vault.getResourcePath(file as TFile),
        }));

      if (wallpapers.length > 0) {
        new WallpaperModal(this.app, wallpapers, (file) => {
          this.currentWallpaper = file;
          const wallpaperUrl = this.app.vault.getResourcePath(file);
          document.body.style.setProperty(
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
    // "Pick random wallpaper" picks a random *backlink note* of the active
    // file and resolves that note's wallpaper through the same priority
    // chain. We never reuse the wallpaper that's currently displayed, and if
    // there is only one candidate we leave the current wallpaper untouched.
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) {
      new Notice('No active note.');
      return;
    }

    // Force a fresh re-scan of backlinks for the active file so we don't
    // rely on a stale resolvedLinks snapshot (e.g. when the user just edited
    // a backlink and immediately runs this command). getBacklinksForFile
    // walks the latest cached links every call rather than returning the
    // precomputed resolvedLinks map.
    const backlinkPaths = this.collectBacklinkPaths(activeFile);

    if (backlinkPaths.length === 0) {
      new Notice('No backlinks found for this note.');
      return;
    }

    // Shuffle backlinks (Fisher–Yates) so we can short-circuit on the first
    // candidate whose resolved wallpaper differs from the current one.
    const shuffled = backlinkPaths.slice();
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    const currentPath = this.currentWallpaper?.path ?? null;

    for (const sourcePath of shuffled) {
      const backlinkFile = this.app.vault.getAbstractFileByPath(sourcePath);
      if (!(backlinkFile instanceof TFile)) continue;

      const resolved = this.resolveWallpaperForFile(backlinkFile);
      if (!resolved) continue;

      // `resolved` may be a wiki link (e.g. "[[foo.png]]") or a raw path.
      // Compare against the *file* we'd resolve it to, since that's what
      // ends up displayed as the current wallpaper.
      const cleanResolved = resolved.replace(/\[\[|\]\]/g, '');
      const resolvedFile = this.app.metadataCache.getFirstLinkpathDest(
        cleanResolved,
        backlinkFile.path
      );

      // Skip if it points at the wallpaper that's already on screen.
      if (resolvedFile && currentPath && resolvedFile.path === currentPath) {
        continue;
      }

      // Found a new candidate — apply it.
      if (resolvedFile instanceof TFile) {
        this.currentWallpaper = resolvedFile;
        const wallpaperUrl = this.app.vault.getResourcePath(resolvedFile);
        document.body.style.setProperty(
          '--background-image',
          `url("${wallpaperUrl}")`
        );
      } else {
        // Fallback: raw value didn't resolve to an attachment file.
        this.currentWallpaper = null;
        document.body.style.setProperty(
          '--background-image',
          `url("${cleanResolved}")`
        );
      }
      return;
    }

    // Every backlink resolved to the wallpaper that's already displayed (or
    // every backlink had no wallpaper at all and there was nothing to pick).
    new Notice('No other wallpaper available from backlinks.');
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
            leaf.openFile(target);
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
        this.currentWallpaper = file;
        const wallpaperUrl = this.app.vault.getResourcePath(file);
        document.body.style.setProperty(
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

    // Fisher–Yates shuffle so any of the non-current candidates is
    // equally likely, then pick the first one that differs from the
    // wallpaper currently displayed.
    const shuffled = candidates.slice();
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    const picked = shuffled.find((f) => f.path !== currentPath);
    if (!picked) return; // unreachable given the early-return above, but
                          // keeps the type-narrowing explicit.

    this.currentWallpaper = picked;
    const wallpaperUrl = this.app.vault.getResourcePath(picked);
    document.body.style.setProperty(
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
    const direct = this.collectTierWallpapers(targetFile, 'direct', () => {
      const meta = this.app.metadataCache.getFileCache(targetFile);
      const wp = meta?.frontmatter?.[this.settings.wallpaperProperty];
      return wp ? [{ link: wp }] : [];
    });
    groups.push(direct);

    // Tier 2: inheritance property (frontmatter links under a specific key).
    if (this.settings.inheritanceProperty) {
      const items = this.collectTierWallpapers(
        targetFile,
        'inheritance-property',
        () => {
          const meta = this.app.metadataCache.getFileCache(targetFile);
          return (meta?.frontmatterLinks ?? []).filter(
            (l) => l.key === this.settings.inheritanceProperty
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
          return meta?.frontmatterLinks ?? [];
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

      // The actual wallpaper value comes from the source note's frontmatter.
      const wallpaperValue = isBacklinkTier
        ? this.app.metadataCache.getFileCache(sourceFile)?.frontmatter?.[
            this.settings.wallpaperProperty
          ]
        : this.readWallpaperFromLinkedNote(entry.link, sourceFile.path);

      if (!wallpaperValue) continue;

      const cleanValue = String(wallpaperValue).replace(/\[\[|\]\]/g, '');
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
        rawValue: String(wallpaperValue),
        displayName: this.cleanWallpaperLabel(String(wallpaperValue)),
        sourceFile,
        sourcePath: sourceFile.path,
        tier,
      });
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
   * Read the wallpaper property from a note reached via an outgoing link.
   * Returns undefined if the target doesn't exist or has no wallpaper.
   */
  private readWallpaperFromLinkedNote(
    link: string,
    sourcePath: string
  ): string | undefined {
    const linkedFile = this.app.metadataCache.getFirstLinkpathDest(
      link,
      sourcePath
    );
    if (!linkedFile) return undefined;
    const linkedMeta = this.app.metadataCache.getFileCache(linkedFile);
    return linkedMeta?.frontmatter?.[this.settings.wallpaperProperty];
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

  private findWallpaperFromLinks(
    links: { link: string }[],
    sourcePath: string
  ): string | undefined {
    for (const entry of links) {
      const linkedFile = this.app.metadataCache.getFirstLinkpathDest(
        entry.link, sourcePath
      );
      if (linkedFile) {
        const linkedMeta = this.app.metadataCache.getFileCache(linkedFile);
        const wp = linkedMeta?.frontmatter?.[this.settings.wallpaperProperty];
        if (wp) return wp;
      }
    }
    return undefined;
  }

  /**
   * Resolve a wallpaper string for an arbitrary note using the full priority
   * chain (direct → inheritance property → frontmatter links → body links →
   * backlinks of `targetFile`). Returns the raw frontmatter value (may include
   * `[[brackets]]`) or `undefined` if no wallpaper is found.
   */
  private resolveWallpaperForFile(targetFile: TFile): string | undefined {
    const metadata = this.app.metadataCache.getFileCache(targetFile);
    let wallpaper = metadata?.frontmatter?.[this.settings.wallpaperProperty];

    if (!wallpaper && this.settings.inheritanceProperty) {
      const fmLinks = (metadata?.frontmatterLinks ?? [])
        .filter(l => l.key === this.settings.inheritanceProperty);
      wallpaper = this.findWallpaperFromLinks(fmLinks, targetFile.path);
    }

    if (!wallpaper && this.settings.inheritFromFrontmatterLinks) {
      const fmLinks = metadata?.frontmatterLinks ?? [];
      wallpaper = this.findWallpaperFromLinks(fmLinks, targetFile.path);
    }

    if (!wallpaper && this.settings.inheritFromBodyLinks) {
      const links = (metadata?.links ?? []).slice().reverse();
      wallpaper = this.findWallpaperFromLinks(links, targetFile.path);
    }

    if (!wallpaper && this.settings.inheritFromBacklinks) {
      const resolvedLinks = this.app.metadataCache.resolvedLinks;
      const backlinkFiles: { link: string }[] = [];
      for (const [sourcePath, destinations] of Object.entries(resolvedLinks)) {
        if (targetFile.path in destinations) {
          backlinkFiles.push({ link: sourcePath });
        }
      }
      if (backlinkFiles.length > 0) {
        wallpaper = this.findWallpaperFromLinks(backlinkFiles, targetFile.path);
      }
    }

    return wallpaper;
  }

  private updateWallpaper() {
    // Update overlay opacity CSS variables
    document.body.style.setProperty(
      '--background-overlay-opacity-light',
      this.settings.overlayOpacityLight.toString()
    );
    document.body.style.setProperty(
      '--background-overlay-opacity-dark',
      this.settings.overlayOpacityDark.toString()
    );

    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) return;

    const wallpaper = this.resolveWallpaperForFile(activeFile);

    if (wallpaper) {
      // Strip wiki link brackets if present
      const cleanWallpaper = wallpaper.replace(/\[\[|\]\]/g, '');

      // Resolve attachment to get the app:// URL
      const wallpaperFile = this.app.metadataCache.getFirstLinkpathDest(
        cleanWallpaper,
        activeFile.path
      );

      if (wallpaperFile) {
        this.currentWallpaper = wallpaperFile;
        const wallpaperUrl = this.app.vault.getResourcePath(wallpaperFile);
        document.body.style.setProperty(
          '--background-image',
          `url("${wallpaperUrl}")`
        );
      } else {
        // Fallback to original value if not found as attachment
        document.body.style.setProperty(
          '--background-image',
          `url("${cleanWallpaper}")`
        );
      }
    } else if (!this.settings.keepExistingWallpaper) {
      this.currentWallpaper = null;
      document.body.style.removeProperty('--background-image');
    }
  }
}
