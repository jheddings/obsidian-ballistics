# CLAUDE.md - obsidian-ballistics

Obsidian plugin for embedding ballistics data in notes. The plugin is in early
scaffolding — concrete features (data formats, rendering, calculators) are TBD
and will be designed in a follow-up session.

## Architecture

Source files in `src/`:

- **main.ts** - Plugin lifecycle (`onload`/`onunload`), settings persistence
- **config.ts** - Settings interfaces
- **settings.ts** - Settings UI (obskit-based setting controls)

New responsibilities should go into their own single-responsibility module under
`src/` rather than growing existing files.

## Dependencies

- **obskit** (production) - Logger and settings UI base classes; shared across
  the author's Obsidian plugins.
- **obsidian** (dev/external) - Obsidian API, externalized from the bundle.

## Build & Tooling

| Command          | Purpose                                        |
| ---------------- | ---------------------------------------------- |
| `npm run dev`    | Watch mode with inline sourcemaps              |
| `npm run build`  | Type-check (`tsc -noEmit`) + production bundle |
| `just tidy`      | Auto-format + lint fix                         |
| `just check`     | Format + lint checks (no fix)                  |
| `just preflight` | build + format check + lint                    |
| `just release`   | preflight + repo-guard + version bump + push   |
| `just clean`     | Remove build artifacts                         |
| `just clobber`   | clean + remove data.json + remove node_modules |

- **Bundler**: esbuild targeting ES2018, CommonJS output to `main.js`
- **Externals**: obsidian, electron, @codemirror/\*, @lezer/\*, builtin-modules
- **Pre-commit hooks**: husky + lint-staged runs prettier --check and eslint
- **Lint**: eslint flat config with `eslint-plugin-obsidianmd` recommended rules

### Versioning

`just release <patch|minor|major>` bumps the version in package.json,
updates `manifest.json` and `versions.json`, commits, tags with the format
`X.Y.Z`, and pushes. The release GitHub workflow then builds and drafts a
release titled `obsidian-ballistics-X.Y.Z`.

## Code Conventions

- **Formatting**: prettier (4-space tabs, double quotes, 96-char width)
- **Linting**: eslint + eslint-plugin-obsidianmd
- **Logging**: one `Logger.getLogger("ClassName")` per module; global level
  controlled via settings.
- Settings changes persist immediately; no apply/cancel pattern.

## Commit Conventions

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>
```

Types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `style`, `perf`.

## Branch Naming

```
<type>/<short-description>
```

Examples: `feat/drag-table`, `fix/unit-conversion`, `chore/update-deps`.
