# 1.7.2

Pegmatite 1.7.2 improves PlantUML rendering on GitLab and strengthens the release package.

## Changes

* Support current and older GitLab PlantUML code block structures.
* Preserve indentation and empty lines when extracting multi-line diagrams.
* Render GitLab content added dynamically without processing unchanged blocks more than once.
* Defer conversion while GitLab content is still loading.
* Add automated tests and run them in CI.
* Remove the unused `tabs` permission and include the extension icon in the package.
* Document local PlantUML server configuration and data handling.

**Full Changelog**: https://github.com/Hondarer/pegmatite/compare/1.7.1...1.7.2
