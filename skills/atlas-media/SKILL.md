---
name: atlas-media
description: >
  Makes videos, slides and demos with tools on this machine, nothing sent out. Video is
  quality first: the studio, an editor driven by commands that comes with this plugin on
  Windows (headless, or in its window so the work can be watched and notes left on it), else
  the best framework installed (HyperFrames, Remotion, Manim), its rules read before a line
  is written. Also HTML slide decks, a Playwright walkthrough of a web app, Blender scene
  checks by numbers, the look of reference footage as a grade and a cut. Plans first, renders
  small before well, gates on-screen text on legibility. Use for "atlas media", "make a
  video", "a short", "an explainer", "animate this concept", "build slides", "record a
  demo", "check this Blender animation", "match the look of this clip", "resolve the notes"
  — in any language.
---

Everything here is code that renders locally. No generation service, no upload, no API
key. A request that needs one (generated footage, a cloned voice, stock media) is said to
be outside this skill, in one line.

## Video: quality first, tokens second

The compression dial governs what is said in the conversation, not what is read or built
for a video. For a video the rule is the reverse of the rest of this plugin: the best
tool installed on the machine is used in full, its own documentation is read before the
first line of code, and the tokens that costs are spent without being counted. A video
made with less than what was available is the failure this section exists to prevent;
a video that cost more tokens is not.

Before the plan, the inventory, every time:

0. The studio: `node media/tools/studio-get.mjs where` (beside this file; it looks at the
   environment variable `STUDIO_CLI`, the PATH and `~/.atlas/studio/`) → `studio.md`. The
   studio owns the video when it is there: picture built by commands in its effects editor,
   edit, voice, music and subtitles in its montage editor, and two project files a person
   can open and change afterwards. Not there, on Windows: it is offered once, in one line,
   with the size and the address (`studio-get.mjs about`), and fetched with `studio-get.mjs
   install` only after a yes. Declined, or another system: the rungs below. A named
   ready-made visual it does not have is said, and HyperFrames, when installed, offered
   for that piece.
1. `~/.claude/skills/hyperframes*`, a `hyperframes` plugin, or `npx hyperframes --version`
   → `hyperframes.md`. Without the studio, HyperFrames owns every video: shorts, motion
   graphics, explainers, product videos, captioned clips, montages. Not only when the
   person names it.
2. A `remotion` dependency in the project or on the path → `react-video.md`.
3. `manim --version` → `explainer.md`, for mathematics and algorithms only.
4. Nothing installed: say so in one line, name what would be installed and why it would
   be better, and build with a browser and `ffmpeg` only after the person chooses that.

A hand-written renderer (a canvas drawn by `render(t)`, frames screenshotted into
`ffmpeg`) is the last rung, never the first, and never while rung 0, 1 or 2 is on the machine.

## What to read

Everything below lives in the `media/` folder beside this file.

1. `media/method.md`, always: the plan before the code, draft renders, where the long
   output goes, what is checked before saying it is done.
2. The framework file the inventory chose, when the piece is a video:
   the studio → `studio.md`, then `studio-styles.md` for the kind of piece;
   HyperFrames installed → `hyperframes.md`, then the framework's own skills in the
   order that file gives;
   Remotion → `react-video.md`; Manim → `explainer.md`.
3. One more file by what is being made:
   "slides", "deck", "presentation", "convert this PowerPoint" → `slides.md`
   "demo", "walkthrough", "screen recording", "record the app" → `demo.md`
   "script", "narration", "voice-over", "storyboard", "captions", "how long" → `script.md`
   "music", "to the beat", "the track", "bpm", "cut to the song" → `music.md`
   "pacing", "rhythm", "cuts", "transitions", "it drags", "too fast" → `cut.md`
   "hand-drawn", "whiteboard", "sketch", "doodle", "a diagram that draws itself" → `draw.md`
   "export", "format", "for YouTube / Instagram / a slide", "file too big", "ffmpeg" → `export.md`
   "Blender", "rig", "walk cycle", "retarget", "feet sliding", "facing the wrong way" →
   `blender.md`
   "match the look", "grade like", "same style as this clip", "cut rhythm" → `look.md`

The tool must be installed: check with its version command first. Missing: say which and
how it is installed, and stop; nothing is installed without a yes.

## With the other skills

Renders and recordings run through the `atlas-runner` subagent when it exists: the log
stays out of the conversation and only the verdict and the output path come back. Looking
at a page before recording it: `atlas-browser`. Motion inside a product's interface is
`atlas-ui`, not this.

## Form

The active compression level governs what is said here. Words that appear on screen
(titles, captions, slide text) are written for the audience, in their language.
