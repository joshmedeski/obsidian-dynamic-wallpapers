import { type App, Modal, type TFile } from 'obsidian';
import { mount, unmount } from 'svelte';
import RelatedWallpapersList from './RelatedWallpapersList.svelte';
import type {
  RelatedWallpaperGroup,
  RelatedWallpaperItem,
} from './RelatedWallpapersList.types';

export class RelatedWallpapersModal extends Modal {
  private component: any;
  private groups: RelatedWallpaperGroup[];
  private onSelectSource: (sourcePath: string) => void;
  private onSelectWallpaper: (
    item: RelatedWallpaperItem,
    file: TFile | null,
  ) => void;

  constructor(
    app: App,
    groups: RelatedWallpaperGroup[],
    onSelectSource: (sourcePath: string) => void,
    onSelectWallpaper: (item: RelatedWallpaperItem, file: TFile | null) => void
  ) {
    super(app);
    this.groups = groups;
    this.onSelectSource = onSelectSource;
    this.onSelectWallpaper = onSelectWallpaper;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    this.modalEl.addClass('related-wallpapers-modal');
    this.modalEl.style.setProperty('--dialog-width', '90vw');

    this.titleEl.setText('Related Wallpapers');

    this.component = mount(RelatedWallpapersList, {
      target: contentEl,
      props: {
        groups: this.groups,
        onSelectSource: (sourcePath: string) => {
          this.onSelectSource(sourcePath);
          this.close();
        },
        onSelectWallpaper: (item: RelatedWallpaperItem, file: TFile | null) => {
          this.onSelectWallpaper(item, file);
          this.close();
        },
      },
    });
  }

  onClose() {
    if (this.component) {
      unmount(this.component);
    }
    this.contentEl.empty();
  }
}