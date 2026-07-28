# Behavioral Guidelines (Agent Code of Conduct)

To ensure high-quality code evolution and system stability, you must strictly adhere to the following protocols:

1. **Risk-First Assessment**: Before implementing any change, perform a proactive impact analysis to identify potential side effects, regression risks, or breaking changes in dependent modules.
2. **Commentary Standards**:
   - Write comprehensive, context-aware comments explaining the "why" behind complex logic.
   - Routinely audit and prune obsolete comments to ensure documentation reflects current implementation.
3. **Research-Discussion Cycle (Mandatory)**:
   - Do not begin implementation without thorough research into existing logic.
   - Post-research, summarize your findings and proposed plan to the user.
   - If a requirement is ambiguous or has multiple architectural trade-offs, pause and ask the user for clarification before proceeding.
4. **Functional Integrity & Globalization (l10n)**:
   - Every addition or modification must trigger a dependency check.
   - Specifically for l10n strings: Any addition, removal, or modification of keys must be synchronized across all supported language files. Do not leave "orphaned" or missing translations.
5. **Strict Language Policy**: You must respond strictly in the language used by the user. Do not switch languages unless explicitly requested.

## Project Structure

```
tree-enhancer/
├── src/
│   ├── calculator/          # Folder size calculation logic
│   │   ├── calculateFolderCommand.ts  # Command handler for folder calculation
│   │   ├── folderCalculator.ts        # Core calculation engine
│   │   └── index.ts                   # Barrel exports
│   ├── provider/            # File decoration provider
│   │   ├── provider.ts      # FileDecorationProvider implementation
│   │   └── index.ts         # Barrel exports
│   ├── utils/               # Utility modules
│   │   ├── file.ts          # File system utilities
│   │   ├── fileWatcher.ts   # FileWatcherManager for monitoring file changes
│   │   ├── formatters.ts    # Display formatting helpers
│   │   ├── func.ts          # Re-exports for backward compatibility
│   │   └── logger.ts        # Logger implementation
│   ├── config.ts            # ConfigManager — centralized configuration access
│   ├── extension.ts         # Extension activation entry point
│   ├── selectionMonitor.ts  # SelectionMonitor for tracking active file selection
│   ├── statusBarManager.ts  # StatusBarManager — unified status bar item management
│   └── types.ts             # Shared type definitions
├── package.json
├── tsconfig.json
└── ...
```

## Code Style & Conventions

- **Language**: TypeScript with strict mode enabled.
- **Imports**: Use relative imports for intra-project references. Prefer barrel exports (`index.ts`) for directory-level modules.
- **Path Aliases**: The project supports `@/` as a path alias for `src/` (e.g., `import { ConfigManager } from "@/config"`). Use this for deep or cross-directory imports to improve readability.
- **Error Handling**: Use typed error handling. Avoid bare `catch` blocks without logging or re-throwing.
- **Async Patterns**: Prefer `async/await` over raw `.then()/.catch()`. Use cancellation tokens or flags for long-running operations (e.g., folder calculation).

## Testing Requirements

- All new features and bug fixes should include corresponding unit tests.
- Test files should be placed in a `__tests__/` directory mirroring the source structure.
- Use the project's configured test runner (check `package.json` for details).
- Ensure tests pass before submitting changes: `npm test` or the equivalent.

## Git Commit Convention

Use **English** for commit messages, even if the user communicates in another language. This ensures clarity and consistency in the project's version history.

- Use conventional commit format: `type: description`
- Types: `feat`, `fix`, `refactor`, `perf`, `docs`, `chore`, `test`, `style`
- Keep commits atomic and semantically scoped

## Dependency Management

- The project uses Renovate for automated dependency updates (see `renovate.json`).
- When adding new dependencies, evaluate whether they are strictly necessary. Prefer VS Code built-in APIs over external libraries where possible.
- Keep `@types/*` packages in sync with their corresponding runtime packages
