---
name: atlas-clip
description: >
  Records the screen and renders a video whose camera follows the cursor and zooms where you
  stop or type, with optional click and key sounds. Windows only, runs on this machine with
  ffmpeg. Keys are counted, never identified. Use for "atlas clip", "record my screen",
  "record a demo with zoom", "zoom this recording" — in any language.
---

Run `node "${CLAUDE_PLUGIN_ROOT}/tools/clip/src/cli.mjs"`. Four verbs:

```
make   <out.mp4> --seconds N [--countdown 3] [--scale 1.8] [--suoni]   all of it, the usual one
record <out.mp4> --seconds N                                           capture and cursor trace
plan   <in.mp4>  [--scale 1.8] [--no-follow]                           where the camera goes
render <in.mp4> <out.mp4> [--plan <file>] [--width W] [--height H] [--crf 18] [--suoni]
```

**Before recording, say what will happen and wait for a yes.** It captures the whole primary screen, so anything visible on it ends up in the file: name the output path and the seconds. Start only after the yes, and warn the person before the countdown ends.

`ffmpeg` must be on the PATH. If it is missing, give the install line and stop: `winget install Gyan.FFmpeg`. On a system other than Windows, say that recording is not available; `plan` and `render` still work on a recording that already has its `.cursor.json`.

Report the output path, the duration, and how many zoom regions the plan found. If it found none, say that the cursor never rested and the video has no zoom. Do not describe a video you have not seen as good.

The method and its limits are in the README of this build. For a video that is written rather than recorded, use `atlas-media`.
