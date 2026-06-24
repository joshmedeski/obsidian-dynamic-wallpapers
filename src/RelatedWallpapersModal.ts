import { type App, Modal, type TFile } from 'obsidian';
import { mount, unmount } from 'svelte';
import RelatedWallpapersList from './RelatedWallpapersList.svelte';
import type {
  RelatedWallpaperGroup,
  RelatedWallpaperItem,
} from './RelatedWallpapersList.types';

export class RelatedWallpapersModal extends Modal {
  private component: Record<string, unknown> | undefined;
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

    this.titleEl.setText('Related wallpapers');

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
      void unmount(this.component);
    }
    this.contentEl.empty();
  }
}