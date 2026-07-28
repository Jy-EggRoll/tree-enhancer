# Contributing

## Development Setup

1. Clone the repository.
2. Run `pnpm install` to install dependencies.
3. Open the project in VSCode and press `F5` to start debugging.

## Project Structure

```
src/
  extension.ts          # Extension entry point
  config.ts             # Configuration manager
  types.ts              # Type definitions
  provider/
    provider.ts         # File decoration provider
  calculator/
    folderCalculator.ts # Folder size calculation logic
    calculateFolderCommand.ts # Folder calculation command handler
  utils/
    logger.ts           # Logger with caller location tracking
    file.ts             # File system utilities
    fileWatcher.ts      # Smart file watcher
    formatters.ts       # Data formatting utilities
```

## Adding Features

### 1. Adding a new configuration option

1. Define the type in `src/types.ts` if needed.
2. Add the configuration property in `package.json` under `contributes.configuration.properties`.
3. Add a getter method in `src/config.ts` (ConfigManager class).
4. Add the `%description.key%` reference in `package.json` and update `package.nls.json` / `package.nls.zh-cn.json`.

### 2. Adding or modifying l10n strings

1. Update the string in the source code using `vscode.l10n.t()`.
2. Run `pnpm run gen-l10n` to regenerate `l10n/bundle.l10n.json`.
3. Manually update `l10n/bundle.l10n.zh-cn.json` with the corresponding Chinese translations.
4. Ensure no keys are orphaned or missing across all language files.

## Code Style

- Use TypeScript with strict type checking.
- Comments must be in English.
- Use meaningful variable and function names.
- Keep functions small and focused.

## Debugging

1. Open the project in VSCode.
2. Go to **Run and Debug** (Ctrl+Shift+D).
3. Select **Run Extension** and press F5.

## Pull Request Process

1. Ensure all checks pass (type check, build).
2. Update CHANGELOG.md with the changes.
3. Update documentation if needed.
4. Create a pull request with a clear description of the changes.
