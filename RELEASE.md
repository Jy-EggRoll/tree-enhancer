# Release

This project publishes stable versions to the Visual Studio Marketplace from GitHub Actions.

## Marketplace token

Create an Azure DevOps Personal Access Token with Marketplace `Manage` scope, then add it to the GitHub repository as an Actions secret named `VSCE_TOKEN`.

VS Code's official CI guidance recommends `VSCE_PAT` because `vsce` reads this environment variable automatically during `vsce publish`.

References:

- https://code.visualstudio.com/api/working-with-extensions/publishing-extension
- https://code.visualstudio.com/api/working-with-extensions/continuous-integration

## Stable release

1. Update `version` in `package.json`.
2. Update `CHANGELOG.md` with the changes.
3. Run local checks:

```sh
pnpm install
pnpm run check-types
pnpm run package
```

4. Commit the changes.
5. Create and push a SemVer tag that matches `package.json` exactly:

```sh
git tag 1.10.2
git push origin 1.10.2
```

The `Publish Extension` workflow will:

- verify that the tag equals `package.json` version
- package a `.vsix`
- publish to the VS Code Marketplace using `VSCE_TOKEN`
- create a GitHub Release with auto-generated release notes from CHANGELOG.md
- attach the `.vsix` to the release

## Development package

Push a development tag like `1.10.2.dev.1`, or run the `Package Extension` workflow manually. Development packages are uploaded to GitHub artifacts/releases only and are not published to the Marketplace.
