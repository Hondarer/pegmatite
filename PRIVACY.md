# Privacy Policy

Last updated: August 5, 2026

Pegmatite-gitbucket renders PlantUML source code found in supported web pages as diagram images.

## Data processed

The extension processes:

* PlantUML source text contained in supported code blocks.
* The Base URL of the PlantUML rendering server selected in the extension options.

The Base URL is stored locally with the Chrome storage API. Pegmatite does not transmit the user's browsing history, account credentials, or the Base URL to the extension developer.

## Rendering requests

To render a diagram, Pegmatite compresses the PlantUML source and sends it as part of an image request to the configured rendering server. The default server is:

`https://www.plantuml.com/plantuml/img/`

Users may configure another server, including a server they operate themselves. The configured server receives the diagram source and may retain network or application logs according to the server operator's own policy. Users should select a rendering server they trust and should prefer HTTPS except when connecting to a local server they control.

## Collection, retention, and use

The extension developer does not collect, retain, sell, or use PlantUML source, browsing history, or the configured Base URL for advertising, analytics, credit decisions, or purposes unrelated to diagram rendering. Pegmatite retains only the Base URL in local extension storage until the user changes it or removes the extension data.

## Limited use

Data access is limited to providing and improving the extension's single purpose: rendering PlantUML diagrams on supported pages. Data is transferred only to the rendering server selected for that purpose.

## Contact

For privacy questions, contact t-honda@hondarer-soft.com.
