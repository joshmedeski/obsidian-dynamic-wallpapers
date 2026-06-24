import {
  type App,
  type DataAdapter,
  Notice,
  normalizePath,
  TFile,
  TFolder,
} from 'obsidian';

interface QueueItem {
  sourceFile: TFile;
  destPath: string;
}

// Output thumbnail dimensions. 16:9 to match the picker card aspect
// ratio so the cached image is already cropped — no second pass in the
// picker UI. The old ffmpeg command used 480x270 with the same
// scale-then-crop filter chain, so the picker cache layout is unchanged.
const THUMB_WIDTH = 480;
const THUMB_HEIGHT = 270;
const THUMB_QUALITY = 0.82;

const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
};

export class WallpaperCache {
  private app: App;
  private cacheDir: string;
  private queue: QueueItem[] = [];
  private isProcessing = false;
  private totalItemsToProcess = 0;
  private processedItemsCount = 0;
  private progressNotice: Notice | null = null;
  // In-memory mirror of the cache directory's filenames. Kept in sync by
  // sync()/clearCache()/generateThumbnail() so getCachedUrl() can answer
  // synchronously on every picker render without touching the disk (the
  // vault adapter is async, so a per-render await is not an option).
  private cachedFilenames = new Set<string>();

  constructor(app: App, manifestDir: string) {
    this.app = app;
    // Paths are relative to the vault root — the same root the adapter's
    // exists/list/stat/writeBinary/remove operate on. No absolute paths and
    // no getBasePath(), so this works on every platform Obsidian supports,
    // including mobile.
    this.cacheDir = normalizePath(`${manifestDir}/.cache`);
  }

  private get adapter(): DataAdapter {
    return this.app.vault.adapter;
  }

  private cachePathFor(filename: string): string {
    return normalizePath(`${this.cacheDir}/${filename}`);
  }

  private async ensureCacheDir(): Promise<void> {
    if (!(await this.adapter.exists(this.cacheDir))) {
      await this.adapter.mkdir(this.cacheDir);
    }
  }

  /**
   * Synchronizes the cache folder with the source wallpaper folder.
   */
  async sync(wallpaperFolder: TFolder): Promise<void> {
    await this.ensureCacheDir();

    const sourceFiles = wallpaperFolder.children.filter(
      (f) => f instanceof TFile && this.isImage(f)
    ) as TFile[];
    const sourceIds = new Set<string>();

    const itemsToProcess: QueueItem[] = [];

    for (const file of sourceFiles) {
      const cacheKey = this.getCacheFilename(file);
      sourceIds.add(cacheKey);

      const cachePath = this.cachePathFor(cacheKey);

      // Check if cache needs update
      let needsUpdate = true;
      if (await this.adapter.exists(cachePath)) {
        const cacheStat = await this.adapter.stat(cachePath);
        // If cache is newer than source, we are good.
        if (cacheStat && cacheStat.mtime > file.stat.mtime) {
          needsUpdate = false;
        }
      }

      if (needsUpdate) {
        itemsToProcess.push({ sourceFile: file, destPath: cachePath });
      }
    }

    // Cleanup orphans and rebuild the in-memory mirror from what's actually
    // on disk — files that survive cleanup are valid and must be visible to
    // getCachedUrl(), including ones that predate this session.
    if (await this.adapter.exists(this.cacheDir)) {
      const { files } = await this.adapter.list(this.cacheDir);
      for (const filePath of files) {
        const filename = filePath.split('/').pop() ?? filePath;
        if (!sourceIds.has(filename)) {
          try {
            await this.adapter.remove(filePath);
            this.cachedFilenames.delete(filename);
          } catch (e) {
            console.error(
              `Failed to remove orphaned cache file: ${filename}`,
              e
            );
          }
        } else {
          this.cachedFilenames.add(filename);
        }
      }
    }

    if (itemsToProcess.length > 0) {
      this.addToQueue(itemsToProcess);
    }
  }

  /**
   * Wipe every file in the cache directory. Used by the "Clear cache" and
   * "Rebuild cache" commands. Returns the number of files removed so the
   * caller can show a meaningful Notice on an empty cache.
   *
   * Safe to call while a queue is mid-flight — we drop pending items; the
   * in-flight item finishes on its own and its output is harmless (it
   * just recreates one cache file that sync() will regenerate again
   * later if needed).
   */
  async clearCache(): Promise<number> {
    if (!(await this.adapter.exists(this.cacheDir))) {
      // Still reset pending work even if the dir is missing, so a stale
      // queue can't outlive the cache it was writing to.
      this.queue = [];
      this.cachedFilenames.clear();
      return 0;
    }

    let removed = 0;
    const { files } = await this.adapter.list(this.cacheDir);
    for (const filePath of files) {
      const filename = filePath.split('/').pop() ?? filePath;
      try {
        await this.adapter.remove(filePath);
        this.cachedFilenames.delete(filename);
        removed++;
      } catch (e) {
        console.error(`Failed to remove cache file: ${filename}`, e);
      }
    }

    // Drop pending work — their destination paths no longer exist. Leave
    // the in-flight item alone; processQueue() finishes it then resets
    // counters when it sees the queue is empty.
    this.queue = [];

    return removed;
  }

  /**
   * Convenience helper for the "Rebuild cache" command — clears and then
   * re-runs a sync against the supplied folder. Returns the number of
   * files queued for regeneration (including any one already in flight)
   * so the caller can show a meaningful Notice.
   */
  async rebuildCache(wallpaperFolder: TFolder): Promise<number> {
    await this.clearCache();
    await this.sync(wallpaperFolder);

    // After sync() pushes its work, this.queue holds everything still
    // pending. The in-flight item, if any, is counted via isProcessing.
    return this.queue.length + (this.isProcessing ? 1 : 0);
  }

  /**
   * Returns the URL for the cached image to be used in the UI
   * Falls back to the original resource path if cache doesn't exist
   */
  getCachedUrl(file: TFile): string {
    const filename = this.getCacheFilename(file);

    // Synchronous check against the in-memory mirror — no disk access, so
    // this stays cheap on every picker render.
    if (this.cachedFilenames.has(filename)) {
      return this.adapter.getResourcePath(this.cachePathFor(filename));
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
      void this.processQueue();
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
        void this.processQueue();
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
    // Read the source bytes through the vault adapter (works on every
    // platform Obsidian supports, including mobile). Then decode via the
    // browser's built-in image stack instead of shelling out to ffmpeg.
    const bytes = await this.app.vault.adapter.readBinary(sourceFile.path);
    const mime = MIME_BY_EXT[sourceFile.extension.toLowerCase()] ?? 'image/png';
    const blob = new Blob([bytes], { type: mime });

    const bitmap = await this.decodeBitmap(blob, mime);

    const canvas = activeDocument.createElement('canvas');
    canvas.width = THUMB_WIDTH;
    canvas.height = THUMB_HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to acquire 2D canvas context');

    // Fill with black so transparent PNGs don't render as a checkerboard
    // through JPEG's lack of an alpha channel.
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, THUMB_WIDTH, THUMB_HEIGHT);
    ctx.drawImage(bitmap, 0, 0, THUMB_WIDTH, THUMB_HEIGHT);
    bitmap.close?.();

    const jpegBlob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', THUMB_QUALITY)
    );
    if (!jpegBlob) throw new Error('Canvas toBlob returned null');

    const arrayBuffer = await jpegBlob.arrayBuffer();
    // Write through the vault adapter (cross-platform, incl. mobile). The
    // .cache directory still lives under the plugin dir, so it stays
    // invisible to Obsidian's own sync/indexing.
    await this.adapter.writeBinary(destPath, arrayBuffer);
    this.cachedFilenames.add(destPath.split('/').pop() ?? destPath);
  }

  /**
   * Decode a wallpaper into an ImageBitmap sized to cover THUMB_WIDTH x
   * THUMB_HEIGHT. createImageBitmap handles raster formats (png/jpg/webp/
   * gif/bmp) directly from a Blob; SVGs need to be loaded via an <img>
   * element first because not every Chromium build accepts SVG Blobs in
   * createImageBitmap. The crop+resize options give us the same
   * "scale to cover, then center-crop" behavior the old ffmpeg filter
   * used, in one step.
   */
  private async decodeBitmap(blob: Blob, mime: string): Promise<ImageBitmap> {
    // Fast path: raster image → createImageBitmap with crop+resize.
    if (mime !== 'image/svg+xml') {
      try {
        return await this.createCoverBitmap(blob);
      } catch (e) {
        console.warn(
          '[WallpaperCache] createImageBitmap failed, falling back to <img>:',
          e
        );
      }
    }

    // Fallback (also used for SVG): load via an Image element, then
    // createImageBitmap from the element so we still get a GPU-friendly
    // bitmap for the canvas draw.
    const url = URL.createObjectURL(blob);
    try {
      const img = await this.loadImage(url);
      const intrinsicW = img.naturalWidth || img.width;
      const intrinsicH = img.naturalHeight || img.height;
      const { sx, sy, sw, sh } = this.coverCropRect(intrinsicW, intrinsicH);
      return await createImageBitmap(img, sx, sy, sw, sh, {
        resizeWidth: THUMB_WIDTH,
        resizeHeight: THUMB_HEIGHT,
        resizeQuality: 'high',
      });
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  private async createCoverBitmap(blob: Blob): Promise<ImageBitmap> {
    const probe = await createImageBitmap(blob);
    const { sx, sy, sw, sh } = this.coverCropRect(probe.width, probe.height);
    const resized = await createImageBitmap(blob, sx, sy, sw, sh, {
      resizeWidth: THUMB_WIDTH,
      resizeHeight: THUMB_HEIGHT,
      resizeQuality: 'high',
    });
    probe.close?.();
    return resized;
  }

  private coverCropRect(
    width: number,
    height: number
  ): { sx: number; sy: number; sw: number; sh: number } {
    // "Cover" crop: scale so the smaller dimension matches THUMB, then take
    // the centered window. Matches ffmpeg's
    // force_original_aspect_ratio=increase + centered crop.
    const targetRatio = THUMB_WIDTH / THUMB_HEIGHT;
    const sourceRatio = width / height;
    let sw = width;
    let sh = height;
    if (sourceRatio > targetRatio) {
      // Source is wider than target — crop horizontally.
      sw = Math.round(height * targetRatio);
    } else {
      // Source is taller (or equal) — crop vertically.
      sh = Math.round(width / targetRatio);
    }
    const sx = Math.round((width - sw) / 2);
    const sy = Math.round((height - sh) / 2);
    return { sx, sy, sw, sh };
  }

  private loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
      img.src = src;
    });
  }
}
