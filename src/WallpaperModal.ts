import { type App, Modal, type TFile } from 'obsidian';
import { mount, unmount } from 'svelte';
import WallpaperSelect from './WallpaperSelect.svelte';

interface WallpaperItem {
  file: TFile;
  url: string;
}

export class WallpaperModal extends Modal {
  private component: Record<string, unknown> | undefined;
  private wallpapers: WallpaperItem[];
  private onSelect: (file: TFile) => void;

  constructor(
    app: App,
    wallpapers: WallpaperItem[],
    onSelect: (file: TFile) => void
  ) {
    super(app);
    this.wallpapers = wallpapers;
    this.onSelect = onSelect;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    this.modalEl.addClass('dynamic-wallpaper-modal');

    this.titleEl.setText('Choose wallpaper');

    this.component = mount(WallpaperSelect, {
      target: contentEl,
      props: {
        wallpapers: this.wallpapers,
        onSelect: (file: TFile) => {
          this.onSelect(file);
          this.close();
        },
      },
    });
  }

  onClose() {
    if (this.component) {
      void unmount(this.component);
    }
    this.contentEl.empty();
  }
}
