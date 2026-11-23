# Twitch Full Chat

A Chromium extension that displays Twitch chat over the video when the player is
fullscreen.

## Install in Chrome or Brave

1. Download `twitch-full-chat-v1.0.1.zip` from the
   [latest GitHub release](https://github.com/mrmaandi/twitch-full-chat/releases/latest).
2. Extract the ZIP file.
3. Open `chrome://extensions` in Chrome or `brave://extensions` in Brave.
4. Turn on **Developer mode**, choose **Load unpacked**, and select the extracted
   `twitch-fs-chat` folder.

Chromium browsers do not install extension ZIP files by dropping them into the
browser. The extracted folder is loaded through the extensions page. A
drag-and-drop `.crx` package requires signing and is not produced by this
project.

## Build a ZIP locally

From the repository root in PowerShell:

```powershell
New-Item -ItemType Directory -Force dist | Out-Null
Compress-Archive -Path twitch-fs-chat\* -DestinationPath dist\twitch-full-chat-v1.0.1.zip -Force
```

The ZIP contains the extension files at its root.

## Publish a release

Each `v*` version tag creates a GitHub Release with a ZIP asset. The workflow
checks that the tag version matches `twitch-fs-chat/manifest.json`.

For a subsequent release:

1. Update the manifest version to the new `MAJOR.MINOR.PATCH` version.
2. Commit and push the changes to `main`.
3. Create and push a matching tag, for example:

   ```powershell
   git tag v1.0.2
   git push origin v1.0.2
   ```

The release will appear under the repository's GitHub Releases page when the
workflow completes. In fullscreen, press **Alt+V** to open the settings over
the video; press **Alt+V** or **Esc** to close them.
