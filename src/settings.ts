export interface PluginSettings {
  wallpaperProperty: string;
  wallpapersProperty: string;
  wallpapersPath: string;
  overlayOpacityLight: number;
  overlayOpacityDark: number;
  inheritanceProperty: string;
  inheritFromFrontmatterLinks: boolean;
  inheritFromBodyLinks: boolean;
  inheritFromBacklinks: boolean;
  keepExistingWallpaper: boolean;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  wallpaperProperty: "wallpaper",
  wallpapersProperty: "wallpapers",
  wallpapersPath: "/",
  overlayOpacityLight: 0.8,
  overlayOpacityDark: 0.6,
  inheritanceProperty: "",
  inheritFromFrontmatterLinks: true,
  inheritFromBodyLinks: true,
  inheritFromBacklinks: true,
  keepExistingWallpaper: true,
};
