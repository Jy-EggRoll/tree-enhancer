# Behavioral Guidelines (Agent Code of Conduct)

To ensure high-quality code evolution and system stability, you must strictly adhere to the following protocols:

1. **Risk-First Assessment**: Before implementing any change, perform a proactive impact analysis to identify potential side effects, regression risks, or breaking changes in dependent modules.
2. **Commentary Standards**:
   - Write comprehensive, context-aware comments explaining the "why" behind complex logic.
   - Routinely audit and prune obsolete comments to ensure documentation reflects current implementation.
3. **Research-Discussion Cycle**:
   - Do not begin implementation without thorough research into existing logic.
   - Post-research, summarize your findings and proposed plan to the user.
   - If a requirement is ambiguous or has multiple architectural trade-offs, pause and ask the user for clarification before proceeding.
4. **Functional Integrity & Globalization**:
   - Every addition or modification must trigger a dependency check.
   - Specifically for l10n strings: Any addition, removal, or modification of keys must be synchronized across all supported language files. Do not leave "orphaned" or missing translations.
5. **Strict Language Policy**: You must respond strictly in the language used by the user. Do not switch languages unless explicitly requested.
6. **Evidence-Backed Conclusions**: Any claim about built-in VSCode behavior (context keys, API semantics, menu/when-clause evaluation, default values) MUST cite the authoritative source — e.g., exact file path + line in the vscode source, or the official documentation URL. If a conclusion cannot be backed by a citation, explicitly label it as an inference ("推断") rather than stating it as fact.
7. **Confidence Disclosure**: When giving conclusions, always distinguish three levels of certainty: **verified** (backed by source code / docs), **inferred** (based on experience, not yet verified), and **unverified** (uncertain / pending validation). Never present an inference as a verified fact.
8. **Mandatory Verification Loop for UI/Behavior Changes**: For any change affecting UI behavior (button visibility, menu items, when-clause conditions, command triggering), do not rely on static reasoning alone. Either launch the extension host and verify, or explicitly state "not tested, please verify with F5" before claiming the change works.

## Git Commit Convention

This project follows the **Angular commit convention** combined with **gitmoji** emoji indicators.

### Commit Format

```txt
<emoji> <type>: <description>
```

Where `<type>` is one of the types listed below.

### Types

| Type     | Angular Convention                                          | gitmoji Definition                        |
| -------- | ----------------------------------------------------------- | ----------------------------------------- |
| 📦️ build | Changes affecting the build system or external dependencies | New or updated compiled files or packages |
| 👷 ci    | Changes to CI configuration files and scripts               | New or updated CI build system            |
| 📝 docs  | Documentation-only changes                                  | New or updated documentation              |
| ✨ feat  | A new feature                                               | Introducing new features                  |
| 🐛 fix   | A bug fix                                                   | Fixing a bug                              |
| ⚡️ perf  | Code changes that improve performance                       | Improving performance                     |
| ♻️ refac | Code refactoring (neither fixes a bug nor adds a feature)   | Refactoring code                          |
| ✅ test  | Adding missing or correcting existing tests                 | Adding, updating, or passing tests        |
| 🔖 tag   | Releasing a new version                                     | Release / Version tag                     |
| 💥 boom  | A breaking change                                           | Introducing breaking changes              |
| ⚗️ alem  | Experimental changes                                        | Conducting experimental research          |
| 🎉 tada  | Initializing a repository                                   | Beginning a project                       |
| 💄 appe  | UI or style updates                                         | Adding or updating UI or style files      |
| 🔨 chore | Miscellaneous changes not covered above                     | Adding or updating development scripts    |
