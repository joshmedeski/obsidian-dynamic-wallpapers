import { writable } from "svelte/store";
import type DynamicWallpaperPlugin from "./main";

export interface PluginSettings {
  wallpaperProperty: string;
  wallpapersPath: string;
  ffmpegPath: string;
  overlayOpacityLight: number;
  overlayOpacityDark: number;
  inheritanceProperty: string;
  inheritFromFrontmatterLinks: boolean;
  inheritFromBodyLinks: boolean;
  keepExistingWallpaper: boolean;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  wallpaperProperty: "wallpaper",
  wallpapersPath: "/",
  ffmpegPath: "ffmpeg",
  overlayOpacityLight: 0.8,
  overlayOpacityDark: 0.6,
  inheritanceProperty: "",
  inheritFromFrontmatterLinks: true,
  inheritFromBodyLinks: true,
  keepExistingWallpaper: true,
};

export const pluginSettings = writable<PluginSettings>(DEFAULT_SETTINGS);

let plugin: DynamicWallpaperPlugin;

export function initStore(p: DynamicWallpaperPlugin) {
  plugin = p;
  pluginSettings.set(plugin.settings);
}

pluginSettings.subscribe((value) => {
  if (plugin) {
    plugin.settings = value;
    plugin.saveSettings();
  }
});
