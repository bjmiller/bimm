# Brian's Idiosyncratic Music Manager

This is an app intended to help sort through a large catalog of locally stored music files, and quickly select some to listen to.

It expects the files to be organized into folders, with one folder being an album.  The folders generally have a naming convention that looks like this:
```
${artist} - {album_title} (${year})
```

The app will filter and sort based on genre/style, artist, album title, and running time.  In general, we want to use the files themselves, along with their metadata, as the source of truth for our data.  We need to calculate the album running time from the individual files, and we need some help from the internet to obtain somewhat-accurate genre information.

This app is being built using electron, with the hope that it can run both on Windows and Mac.  (It should also run on Linux, but I'm not going to test it there.)

## Building

You'll need Node.js 22 and npm installed.

```sh
# Install dependencies
npm ci

# Compile the app with webpack
npm run build

# Run it locally
npm start
```

For a fast feedback loop while developing, you can run webpack in watch mode in one terminal and `npm start` in another:

```sh
npm run build-watch
```

### Packaging installers

Packaging uses [electron-builder](https://www.electron.build/) and produces signed-but-adhoc installers in the `release/` directory. This step also downloads the Playwright browsers needed at runtime and bundles them as extra resources, so it can take a while.

```sh
# macOS (both arm64 and x64): dmg + zip
npm run package

# macOS for a single architecture
npm run package:mac:arm64
npm run package:mac:x64

# Windows (x64): NSIS installer
npm run package:win
```

Note that each target OS can only package installers for itself (e.g. you must be on a Mac to run `npm run package`); cross-platform builds happen in CI.

Before committing changes, run the linter and type checker:

```sh
npm run lint
npm run typecheck
```

## Creating releases

Releases are automated with [GitHub Actions](.github/workflows/build.yml). Every push to `main` is compiled and packaged for macOS and Windows, with the installers uploaded as build artifacts. When a `v*` tag is pushed, the same build runs and a GitHub release is created, with the installers attached as release assets.

To cut a release:

1. Pick a new [semver](https://semver.org/) version that is greater than the current `version` in `package.json`.
2. Run the release script, which bumps the version, commits `package.json`, and creates an annotated `v<version>` tag:

   ```sh
   npm run create-release -- 1.1.0
   ```

   (Everything after `--` is passed to the script; you can also use `--version 1.1.0`.)

3. Push the commit and the tag:

   ```sh
   git push && git push --tags
   ```

4. Wait for the "Build and release" workflow to finish. When it's done, the release will appear on the [Releases page](https://github.com/bjmiller/bimm/releases) with the macOS (`.dmg`/`.zip`) and Windows (`.exe`) installers attached. Installers are ad-hoc signed, so macOS may ask you to approve the app on first launch.

If you need to re-run the workflow or fix the release notes afterward, you can manage the release directly with the `gh` CLI, e.g. `gh release view v1.1.0` or `gh release edit`.
