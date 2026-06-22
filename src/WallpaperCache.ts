import { type App, FileSystemAdapter, Notice, TFile, TFolder } from 'obsidian';
import { exec } from 'child_process';
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'fs';
import { join, relative } from 'path';

interface QueueItem {
  sourceFile: TFile;
  destPath: string;
}

export class WallpaperCache {
  private app: App;
  private pluginDir: string;
  private cacheDir: string;
  private ffmpegPath: string;
  private queue: QueueItem[] = [];
  private isProcessing = false;
  private totalItemsToProcess = 0;
  private processedItemsCount = 0;
  private progressNotice: Notice | null = null;

  constructor(app: App, manifestDir: string, ffmpegPath: string) {
    this.app = app;
    this.ffmpegPath = ffmpegPath;

    const adapter = this.app.vault.adapter;
    if (adapter instanceof FileSystemAdapter) {
      this.pluginDir = join(adapter.getBasePath(), manifestDir);
      this.cacheDir = join(this.pluginDir, '.cache');

      if (!existsSync(this.cacheDir)) {
        mkdirSync(this.cacheDir, { recursive: true });
      }
    } else {
      throw new Error('FileSystemAdapter required for caching');
    }
  }

  updateSettings(ffmpegPath: string) {
    this.ffmpegPath = ffmpegPath;
  }

  /**
   * Synchronizes the cache folder with the source wallpaper folder.
   */
  async sync(wallpaperFolder: TFolder): Promise<void> {
    const adapter = this.app.vault.adapter;
    if (!(adapter instanceof FileSystemAdapter)) return;

    const sourceFiles = wallpaperFolder.children.filter(
      (f) => f instanceof TFile && this.isImage(f)
    ) as TFile[];
    const sourceIds = new Set<string>();

    const itemsToProcess: QueueItem[] = [];

    for (const file of sourceFiles) {
      const cacheKey = this.getCacheFilename(file);
      sourceIds.add(cacheKey);

      const cachePath = join(this.cacheDir, cacheKey);

      // Check if cache needs update
      let needsUpdate = true;
      if (existsSync(cachePath)) {
        const cacheStat = statSync(cachePath);
        // If cache is newer than source, we are good
        // We add a small buffer (100ms) to avoid floating point/fs timing quirks
        if (cacheStat.mtimeMs > file.stat.mtime) {
          needsUpdate = false;
        }
      }

      if (needsUpdate) {
        itemsToProcess.push({ sourceFile: file, destPath: cachePath });
      }
    }

    // Cleanup orphans
    if (existsSync(this.cacheDir)) {
      const cachedFiles = readdirSync(this.cacheDir);
      for (const file of cachedFiles) {
        if (!sourceIds.has(file)) {
          try {
            unlinkSync(join(this.cacheDir, file));
          } catch (e) {
            console.error(`Failed to remove orphaned cache file: ${file}`, e);
          }
        }
      }
    }

    if (itemsToProcess.length > 0) {
      this.addToQueue(itemsToProcess);
    }
  }

  /**
   * Returns the URL for the cached image to be used in the UI
   * Falls back to the original resource path if cache doesn't exist
   */
  getCachedUrl(file: TFile): string {
    const cachePath = join(this.cacheDir, this.getCacheFilename(file));

    if (existsSync(cachePath)) {
      const adapter = this.app.vault.adapter;
      if (adapter instanceof FileSystemAdapter) {
        const relativePath = relative(adapter.getBasePath(), cachePath);
        return adapter.getResourcePath(relativePath);
      }
    }

    return this.app.vault.getResourcePath(file);
  }

  private getCacheFilename(file: TFile): string {
    // Use path to ensure uniqueness across folders, but flatten it
    // Using a simple replacement for now.
    // encodeURIComponent ensures we don't have invalid chars
    return `${file.name}.${file.stat.ctime}.cache.jpg`;
  }

  private isImage(file: TFile): boolean {
    const extensions = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg'];
    return extensions.includes(file.extension.toLowerCase());
  }

  private addToQueue(items: QueueItem[]) {
    this.queue.push(...items);
    this.totalItemsToProcess += items.length;

    if (!this.isProcessing) {
      this.processQueue();
    } else {
      this.updateProgressNotice();
    }
  }

  private async processQueue() {
    if (this.queue.length === 0) {
      this.isProcessing = false;
      this.totalItemsToProcess = 0;
      this.processedItemsCount = 0;
      if (this.progressNotice) {
        this.progressNotice.hide();
        this.progressNotice = null;
      }
      return;
    }

    this.isProcessing = true;
    this.updateProgressNotice();

    const item = this.queue.shift();
    if (item) {
      try {
        console.log('[WallpaperCache] Processing:', item.sourceFile.name);
        await this.generateThumbnail(item.sourceFile, item.destPath);
      } catch (e) {
        console.error(
          `Failed to generate thumbnail for ${item.sourceFile.path}`,
          e
        );
        new Notice(`Failed to generate thumbnail for ${item.sourceFile.name}`);
      } finally {
        this.processedItemsCount++;
        // recursive call to process next item
        this.processQueue();
      }
    }
  }

  private updateProgressNotice() {
    const message = `Generating thumbnails: ${this.processedItemsCount}/${this.totalItemsToProcess}`;
    if (!this.progressNotice) {
      this.progressNotice = new Notice(message, 0); // 0 duration means it stays until hidden
    } else {
      this.progressNotice.setMessage(message);
    }
  }

  private async generateThumbnail(
    sourceFile: TFile,
    destPath: string
  ): Promise<void> {
    const adapter = this.app.vault.adapter;
    if (!(adapter instanceof FileSystemAdapter)) return;

    const sourcePath = adapter.getFullPath(sourceFile.path);

    // FFmpeg command to resize to 480x270 while maintaining aspect ratio and cropping
    // scale=-1:270 (height fixed), crop=480:270
    // Added force_original_aspect_ratio=increase to ensure it covers the area before cropping
    const command = `"${this.ffmpegPath}" -i "${sourcePath}" -vf "scale=480:270:force_original_aspect_ratio=increase,crop=480:270" -y "${destPath}"`;

    return new Promise((resolve, reject) => {
      exec(command, (error, stdout, stderr) => {
        if (error) {
          // Log stderr for debugging
          console.warn(`FFmpeg stderr: ${stderr}`);
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }
}
