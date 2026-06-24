<script lang="ts">
  import type { TFile } from "obsidian";
  import type {
    InheritanceTier,
    RelatedWallpaperGroup,
    RelatedWallpaperItem,
  } from "./RelatedWallpapersList.types";

  export let groups: RelatedWallpaperGroup[] = [];
  export let onSelectSource: (sourcePath: string) => void = () => {};

  let searchTerm = "";
  let debouncedSearchTerm = "";
  let timer: NodeJS.Timeout;

  $: {
    clearTimeout(timer);
    timer = setTimeout(() => {
      debouncedSearchTerm = searchTerm;
    }, 200);
  }

  function basename(path: string): string {
    const slash = path.lastIndexOf("/");
    return slash >= 0 ? path.slice(slash + 1) : path;
  }

  function matchesSearch(item: RelatedWallpaperItem, term: string): boolean {
    if (!term) return true;
    const t = term.toLowerCase();
    return (
      item.displayName.toLowerCase().includes(t) ||
      item.sourceFile.basename.toLowerCase().includes(t)
    );
  }

  $: filteredGroups = groups
    .map((group) => ({
      ...group,
      items: group.items
        .filter((item) => matchesSearch(item, debouncedSearchTerm))
        .sort((a, b) => a.displayName.localeCompare(b.displayName)),
    }))
    .filter((group) => group.items.length > 0);

  $: totalMatches = filteredGroups.reduce(
    (sum, group) => sum + group.items.length,
    0
  );

  function handleOpenSource(event: MouseEvent, sourcePath: string) {
    event.stopPropagation();
    onSelectSource(sourcePath);
  }
</script>

<div class="related-wallpapers">
  <div class="search-container">
    <input
      type="text"
      placeholder="Search wallpapers or source notes..."
      bind:value={searchTerm}
      class="search-input"
    />
  </div>

  {#if filteredGroups.length === 0}
    <div class="empty-state">
      {#if groups.length === 0}
        <p>No related wallpapers found for this note.</p>
        <p class="empty-hint">
          Add a wallpaper frontmatter property, link to notes that have
          wallpapers, or note a backlink source with a wallpaper.
        </p>
      {:else}
        <p>No matches for "{searchTerm}".</p>
      {/if}
    </div>
  {:else}
    <div class="groups-scroll">
      {#each filteredGroups as group (group.tier)}
        <section class="group">
          <header class="group-header">
            <h3 class="group-title">{group.label}</h3>
            <p class="group-description">{group.description}</p>
            <span class="group-count">
              {group.items.length}
              {group.items.length === 1 ? "wallpaper" : "wallpapers"}
            </span>
          </header>
          <div class="wallpaper-grid">
            {#each group.items as item (item.rawValue + "|" + item.sourcePath)}
              <div class="wallpaper-card">
                <div class="image-container">
                  {#if item.url}
                    <img src={item.url} alt={item.displayName} />
                  {:else}
                    <div class="image-fallback" title={item.rawValue}>
                      {basename(item.rawValue)}
                    </div>
                  {/if}
                </div>
                <div class="card-meta">
                  <div class="wallpaper-name" title={item.displayName}>
                    {item.displayName}
                  </div>
                  <!-- svelte-ignore a11y-click-events-have-key-events -->
                  <!-- svelte-ignore a11y-no-static-element-interactions -->
                  <div
                    class="source-link"
                    title={`Open ${item.sourceFile.basename}`}
                    on:click={(e) => handleOpenSource(e, item.sourcePath)}
                  >
                    <span class="source-icon" aria-hidden="true">↗</span>
                    <span class="source-name">
                      {item.sourceFile.basename}
                    </span>
                  </div>
                </div>
              </div>
            {/each}
          </div>
        </section>
      {/each}
    </div>
  {/if}
</div>

<style>
  .related-wallpapers {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .search-container {
    padding: 0 1rem 1rem 1rem;
  }

  .search-input {
    width: 100%;
  }

  .groups-scroll {
    overflow-y: auto;
    max-height: 80vh;
    padding: 0 1rem 1rem 1rem;
  }

  .empty-state {
    padding: 3rem 1rem;
    text-align: center;
    color: var(--text-muted);
  }

  .empty-state p {
    margin: 0.25rem 0;
  }

  .empty-hint {
    font-size: 0.9em;
    opacity: 0.8;
  }

  .group {
    margin-bottom: 1.75rem;
  }

  .group-header {
    margin-bottom: 0.75rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .group-title {
    margin: 0;
    font-size: 1.05rem;
    font-weight: 600;
    color: var(--text-normal);
  }

  .group-description {
    margin: 0.25rem 0 0;
    font-size: 0.85rem;
    color: var(--text-muted);
  }

  .group-count {
    display: inline-block;
    margin-top: 0.4rem;
    font-size: 0.75rem;
    color: var(--text-faint);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .wallpaper-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 1rem;
  }

  .wallpaper-card {
    display: flex;
    flex-direction: column;
    border-radius: 8px;
    background-color: var(--background-secondary);
    overflow: hidden;
    transition:
      transform 0.15s ease,
      box-shadow 0.15s ease;
  }

  .wallpaper-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  .image-container {
    width: 100%;
    aspect-ratio: 16/9;
    overflow: hidden;
    background-color: var(--background-primary);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .image-container img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .image-fallback {
    padding: 0.5rem 1rem;
    font-size: 0.85rem;
    color: var(--text-muted);
    text-align: center;
    word-break: break-all;
  }

  .card-meta {
    padding: 0.6rem 0.75rem 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .wallpaper-name {
    font-size: 0.9rem;
    color: var(--text-normal);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .source-link {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.8rem;
    color: var(--text-accent);
    cursor: pointer;
    width: fit-content;
    padding: 2px 6px;
    margin-left: -6px;
    border-radius: 4px;
    transition: background-color 0.15s ease;
  }

  .source-link:hover {
    background-color: var(--background-modifier-hover);
    text-decoration: underline;
  }

  .source-icon {
    font-size: 0.9em;
    line-height: 1;
  }

  .source-name {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 14rem;
  }
</style>