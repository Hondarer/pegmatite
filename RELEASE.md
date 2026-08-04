# How to release

1. Update the version in `pegmatite/manifest.json` and `package.json`.
2. Install dependencies and run all checks.

    ```sh
    npm install --no-package-lock
    npm run lint
    npm test
    ```

3. Create a ZIP whose root contains `manifest.json`. On PowerShell:

    ```powershell
    Compress-Archive -Path pegmatite\* -DestinationPath pegmatite-x.y.z.zip
    ```

4. Load the extracted ZIP in Microsoft Edge or Google Chrome and complete the browser smoke test documented in `README.md`.
5. Commit the release, create a lightweight tag, and push only to `origin`.

    ```sh
    git commit -m "release: x.y.z"
    git tag x.y.z
    git push origin develop
    git push origin x.y.z
    ```

6. In the GitHub web UI, create a release from the tag and attach the verified ZIP.
7. Open the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole/), select extension `gkdjfofhecooaojkhbohidojebbpcene`, and upload the same ZIP.
8. Review the Store listing and Privacy practices against `PRIVACY.md`, then submit for review and publish.

Do not push release changes to `upstream` or `master`.
