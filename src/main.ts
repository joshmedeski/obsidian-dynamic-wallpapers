import { exec } from 'child_process';
import { readFileSync, unlinkSync, writeFileSync } from 'fs';
import {
  type App,
  FileSystemAdapter,
  Notice,
  Plugin,
  PluginSettingTab,
  TFile,
  TFolder,
  type TAbstractFile,
} from 'obsidian';
import { mount, unmount } from 'svelte';
import SettingsTab from './SettingsTab.svelte';
import {
  DEFAULT_SETTINGS,
  initStore,
  type PluginSettings,
  pluginSettings,
} from './store';
import { WallpaperModal } from './WallpaperModal';
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

export default class DynamicWallpaperPlugin extends Plugin {
  settings: PluginSettings = DEFAULT_SETTINGS;
  private opacityNoticeTimeout: NodeJS.Timeout | null = null;
  private currentWallpaper: TFile | null = null;
  private wallpaperCache: WallpaperCache;
  private syncDebounceTimer: NodeJS.Timeout | null = null;

  async onload() {
    await this.loadSettings();
    initStore(this);

    if (this.manifest.dir) {
      this.wallpaperCache = new WallpaperCache(
        this.app,
        this.manifest.dir,
        this.settings.ffmpegPath
      );
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
      id: 'choose-wallpaper',
      name: 'Choose Wallpaper',
      callback: () => {
        this.openWallpaperPicker();
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
      callback: () => {
        if (!this.currentWallpaper) {
          new Notice('No wallpaper currently set.');
          return;
        }

        const adapter = this.app.vault.adapter;
        if (!(adapter instanceof FileSystemAdapter)) {
          new Notice('Cannot determine file path.');
          return;
        }

        const absolutePath = adapter.getFullPath(this.currentWallpaper.path);
        const tempPath = `${absolutePath}.temp.${this.currentWallpaper.extension}`;
        const ffmpegPath = this.settings.ffmpegPath || 'ffmpeg';

        const command = `"${ffmpegPath}" -i "${absolutePath}" -vf hflip -y "${tempPath}"`;

        exec(command, (error, stdout, stderr) => {
          if (error) {
            console.error(`exec error: ${error}`);
            new Notice(
              `Error flipping image. Is ffmpeg installed and the path correct? (${ffmpegPath})`
            );
            return;
          }

          try {
            const data = readFileSync(tempPath);
            writeFileSync(absolutePath, data);
            unlinkSync(tempPath);
            new Notice('Image flipped successfully!');
            // Wait a bit for the file system to settle and Obsidian to detect the change
            setTimeout(() => {
              this.updateWallpaper();
            }, 500);
          } catch (err) {
            console.error('Error copying/cleaning up file:', err);
            new Notice('Error updating image file.');
          }
        });
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
    if (this.wallpaperCache) {
      this.wallpaperCache.updateSettings(this.settings.ffmpegPath);
    }
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

  async pickRandomWallpaper() {
    const { wallpapersPath } = this.settings;
    const folder = this.app.vault.getAbstractFileByPath(wallpapersPath);

    if (folder instanceof TFolder) {
      const images = folder.children.filter((file) => {
        if (file instanceof TFile) {
          return isImageFile(file);
        }
        return false;
      });

      if (images.length > 0) {
        const randomImage = images[Math.floor(Math.random() * images.length)];
        if (randomImage instanceof TFile) {
          this.currentWallpaper = randomImage;
          const wallpaperUrl = this.app.vault.getResourcePath(randomImage);
          document.body.style.setProperty(
            '--background-image',
            `url("${wallpaperUrl}")`
          );
        }
      } else {
        new Notice('No images found in the specified wallpaper directory.');
      }
    } else {
      new Notice('Wallpaper directory not found.');
    }
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

    const metadata = this.app.metadataCache.getFileCache(activeFile);
    let wallpaper = metadata?.frontmatter?.[this.settings.wallpaperProperty];

    // Priority 2: Inheritance property (specific frontmatter key)
    if (!wallpaper && this.settings.inheritanceProperty) {
      const fmLinks = (metadata?.frontmatterLinks ?? [])
        .filter(l => l.key === this.settings.inheritanceProperty);
      wallpaper = this.findWallpaperFromLinks(fmLinks, activeFile.path);
    }

    // Priority 3: All frontmatter links
    if (!wallpaper && this.settings.inheritFromFrontmatterLinks) {
      const fmLinks = metadata?.frontmatterLinks ?? [];
      wallpaper = this.findWallpaperFromLinks(fmLinks, activeFile.path);
    }

    // Priority 4: Body links (reverse order — last link wins)
    if (!wallpaper && this.settings.inheritFromBodyLinks) {
      const links = (metadata?.links ?? []).slice().reverse();
      wallpaper = this.findWallpaperFromLinks(links, activeFile.path);
    }

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
