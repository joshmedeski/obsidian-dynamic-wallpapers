import type { TFile } from 'obsidian';

export type InheritanceTier =
  | 'direct'
  | 'inheritance-property'
  | 'frontmatter-links'
  | 'body-links'
  | 'backlinks';

export interface RelatedWallpaperItem {
  /** The resolved wallpaper file, or null if the raw value didn't
   * resolve to an attachment in the vault. */
  wallpaperFile: TFile | null;
  /** URL for the thumbnail (app:// resource path) or null if missing. */
  url: string | null;
  /** The raw frontmatter string (e.g. "[[foo.png]]" or a path). */
  rawValue: string;
  /** Human-friendly name to show under the thumbnail. */
  displayName: string;
  /** The note that caused this wallpaper to be picked. Always a TFile. */
  sourceFile: TFile;
  /** Path used for backlinking; defaults to sourceFile.path. */
  sourcePath: string;
  /** Which tier produced this wallpaper. */
  tier: InheritanceTier;
}

export interface RelatedWallpaperGroup {
  tier: InheritanceTier;
  label: string;
  description: string;
  items: RelatedWallpaperItem[];
}