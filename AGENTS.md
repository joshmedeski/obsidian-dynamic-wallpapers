# Agent Guidelines

## Commands
- **Build**: `npm run build` (Type check + Production build)
- **Dev**: `npm run dev` (Watch mode)
- **Test**: No automated tests. Manual verification in Obsidian required.

## Code Style
- **Language**: TypeScript (Strict: `noImplicitAny`, `strictNullChecks`).
- **Frameworks**: Obsidian API, Svelte 5 (use `mount`/`unmount` API).
- **Formatting**: 2 spaces indent, single quotes preferred.
- **Imports**: Group imports by source (`obsidian`, `svelte`, local).
- **Naming**: PascalCase for Classes/Components, camelCase for vars/funcs.
- **Error Handling**: Use `try/catch` for I/O; use `new Notice('msg')` for user feedback.

## Conventions
- Use `svelte/store` for state management (`writable`).
- Manipulate DOM via Svelte components where possible, or `this.app` for Vault/Workspace.
- Plugin settings managed via `store.ts` pattern.
- Dependencies: standalone npm project; versions pinned directly in `package.json`.
