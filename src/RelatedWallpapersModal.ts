import { type App, Modal } from 'obsidian';
import { mount, unmount } from 'svelte';
import RelatedWallpapersList from './RelatedWallpapersList.svelte';
import type { RelatedWallpaperGroup } from './RelatedWallpapersList.types';

export class RelatedWallpapersModal extends Modal {
  private component: any;
  private groups: RelatedWallpaperGroup[];
  private onSelect: (sourcePath: string) => void;

  constructor(
    app: App,
    groups: RelatedWallpaperGroup[],
    onSelect: (sourcePath: string) => void
  ) {
    super(app);
    this.groups = groups;
    this.onSelect = onSelect;
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
          this.onSelect(sourcePath);
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