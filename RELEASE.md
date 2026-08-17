# How to release

1. Update the version in all three places that pin it.

    * `pegmatite/manifest.json`
    * `package.json`
    * the `manifest.version` assertion in `test/manifest.test.js`

2. Rewrite `RELEASE_NOTES.md` for the new version, keeping the English and Japanese sections in sync.
3. Install dependencies, copy the rendering engine into `pegmatite/vendor/`, and run all checks.

    ```sh
    npm install --no-package-lock
    npm run vendor
    npm run lint
    npm test
    ```

    `pegmatite/vendor/` is not committed, so `npm run vendor` must run before the ZIP is created.
    Otherwise the packaged extension will fail to render.
    The same command copies LICENSE, NOTICE, README.md, each production
    dependency's LICENSE, and the third-party license texts in
    `third_party/` into the ZIP root (`pegmatite/`).

4. Create a ZIP whose root contains `manifest.json`. On PowerShell:

    ```powershell
    Compress-Archive -Path pegmatite\* -DestinationPath pegmatite-x.y.z.zip
    ```

    The ZIP file name uses the repository directory name `pegmatite`, not the Store display name
    PlantUML In-Place Preview.

5. Load the extracted ZIP in Microsoft Edge or Google Chrome.
   Complete the browser smoke test documented in `README.md`.
6. Commit the release, create a lightweight tag, and push only to `origin`.

    ```sh
    git commit -m "release: x.y.z"
    git tag x.y.z
    git push origin develop
    git push origin x.y.z
    ```

7. In the GitHub web UI, create a release from the tag and attach the verified ZIP.
8. Open the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole/).
   Select extension `gkdjfofhecooaojkhbohidojebbpcene` and upload the same ZIP.
9. Set the Store listing name to **PlantUML In-Place Preview** when it differs from the package.
   Review the Store listing and Privacy practices against `PRIVACY.md`, then submit for review and publish.

   Example review note for a display-name-only release:

   ```text
   Display name rename: Pegmatite-gitbucket → PlantUML In-Place Preview.
   Extension ID unchanged. No functional change beyond naming and docs.
   ```

Do not push release changes to `upstream` or `master`.
