# Releasing KubeViewer

Step-by-step procedure for cutting a new release.

## 1. Prepare the release

```bash
# Ensure you are on main with a clean working tree
git checkout main && git pull && git status

# Run the full check suite
make lint test
```

## 2. Bump versions

Update the version string in both locations:

- **`wails.json`** -- `info.productVersion` field
- **`ui/package.json`** -- `version` field

Both must match (e.g., `0.2.0`).

## 3. Update CHANGELOG.md

- Replace `## [X.Y.Z] - Unreleased` with `## [X.Y.Z] - YYYY-MM-DD` (today's date).
- Add a new `## [Unreleased]` section above it for future changes.
- Review entries for accuracy and completeness.

## 4. Commit and tag

```bash
git add wails.json ui/package.json CHANGELOG.md
git commit -m "Release vX.Y.Z"
git tag vX.Y.Z
```

## 5. Push

```bash
git push origin main --tags
```

## 6. CI builds release artifacts

The `cross-platform-build` CI job will automatically build binaries for macOS, Windows, and Linux. Build artifacts are uploaded and available from the workflow run.

## 7. Create GitHub Release

```bash
gh release create vX.Y.Z --title "vX.Y.Z" --notes-file - <<< "$(sed -n '/## \[X.Y.Z\]/,/## \[/p' CHANGELOG.md | head -n -1)"
```

Upload platform artifacts from CI to the release, or let the CI workflow handle it.
