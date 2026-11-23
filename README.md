# Twitch Full Chat

A Chromium extension that displays Twitch chat over the video when the player is
fullscreen.

## Install in Chrome or Brave

1. Download the latest ZIP from the
   [GitHub Releases page](https://github.com/mrmaandi/twitch-full-chat/releases).
2. Extract it.
3. Open `chrome://extensions` in Chrome or `brave://extensions` in Brave.
4. Turn on **Developer mode**, choose **Load unpacked**, and select the extracted
   `twitch-fs-chat` folder.

## Chat settings

Press **Alt+V** in fullscreen to open the settings over the video. Enable **Keep
messages on screen** to keep messages visible until newer messages push them
out at the configured maximum. Disable it to resume the usual timed fade.

## Releases

Each published release includes a ZIP ready to extract and load unpacked. New
release versions use `MAJOR.MINOR.PATCH` numbering and are published from GitHub
Actions when a matching `vMAJOR.MINOR.PATCH` tag is pushed.
