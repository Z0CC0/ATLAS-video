# Video with the studio — when it is installed, it owns the video

The studio is two editors behind one command line: an effects editor, where a picture is
built from text, shapes, footage and keyframes, and a montage editor, where pictures,
voice, music, sounds and subtitles become a film. `studio-cli` drives both without a
window: every action of either editor is a command with a name, a project is a text file,
and a script of commands runs in one call. What comes out is two project files a person
can open in the studio's window and change by hand, and the film.

It has no catalogue of ready-made blocks. Every scene is built from the primitives; a
named ready-made visual (a glitch, a particular transition pack) is a reason to say so
and, when HyperFrames is installed too, to ask which the person wants.

## Found how

`node tools/studio-get.mjs where`, beside this file, prints the path of `studio-cli`: it
looks at the environment variable `STUDIO_CLI`, the PATH and `~/.atlas/studio/`. Found →
this file, and the piece is made with it even when the person does not name it. Not found,
on Windows: the offer and the download are in the skill's inventory. Below, `studio-cli`
stands for that path. `STUDIO_DATA=<folder>` makes it keep its settings and caches
somewhere else than the person's own, for a test.

## Two ways to work

**Without a window**, the default: everything below, and the person sees the stills and
the film.

**In the window**, when the person asks to watch, to follow the work, or to leave notes
while it is made: the same commands, sent to the open app, which shows each one as it
lands. Ask once which way when the request does not say and the piece is more than a
trivial one; do not open a window nobody asked for.

```
studio-cli live open                      starts the window, returns when it answers
studio-cli fx run --commands steps.jsonl --live --pace 300
studio-cli fx exec file.saveAs --params '{"path":"C:/work/piece.ecproj"}' --live
studio-cli film run edit.jsonl --live
studio-cli film exec file.saveAs '{"path":"C:/work/piece.fcproj"}' --live
studio-cli notes list --live
studio-cli film export C:/work/out.mp4 --format h264 --live
studio-cli live close                     refused while a project is unsaved; --discard to drop it
```

`--live` goes on `film` and `fx` verbs and on `notes`. A script run live waits after every
step that changes something (`--pace`, in milliseconds; a third of a second unless told
otherwise), so a person can follow it; each command is one step of the window's own undo.
The window opens the editor being changed, unless the person has just chosen a page. The
flags that name a file (`--project`, `--save`, `--save-as`, `--empty`) are refused live:
a project is opened and saved with the `file.open`, `file.save` and `file.saveAs` commands.
An effects project is saved before a composition of it is linked. `live status` says
whether a window is listening, `live page film|fx|note|export` shows a page, `live shot
f.png` gives a picture of the window (after `live front` when it is covered). Stills for
the contact sheet are still rendered without the window, from the saved project.
The person may click while commands arrive, and may place notes at any moment: `notes list
--live` sees a note the moment it is placed, without a save. The window is left open when
the work is done only if the person is using it; otherwise it is closed and said.

## Read, before writing

The commands are the documentation, and they are read, not guessed: a parameter the
command does not know is refused with the names it accepts.

1. `studio-cli fx commands` and `studio-cli film commands`: the lists, one line each, with
   the parameters. Search them for the verb needed before assuming it is missing.
2. One command in full, before it is used the first time. The two editors spell it
   differently: `studio-cli film describe <id>`, and
   `studio-cli fx exec command.describe --params '{"command":"<id>"}'`.
3. The effects by name, with their parameters: `studio-cli fx exec effect.list` with a
   `filter`. `fx info` gives only how many there are.

## The order of the work

**Voice, when there is one, first.** `film exec tts.voices` lists what is installed;
natural voices are a package the engine downloads once, after a yes, with
`tts.downloadVoices`. One file per spoken line: `film exec tts.preview` with the text, the
voice and a path. The length of each file, measured, sets the length of its scene. The
voice returns no word timings: the cues inside a line come from its pauses, found by
measuring the silence in the file. A line starts and ends with a little silence and comes
out quiet; both are measured, not assumed.

**Picture in the effects editor.** One composition per scene. A small program of the
piece's own (any language) writes the steps to one file, one JSON object per line, from
the timings; nothing is typed by hand twice. Then one call builds the whole project:
`fx run --commands steps.jsonl --empty --save-as piece.ecproj`. The handful that carries
most pieces: `comp.new`, `layer.newText` (a `position` for a line, a `box` for a
paragraph), `layer.newShape`, `prop.set`, `prop.addKey`, `keys.setEase`,
`layer.setTrackMatte`. Properties are addressed by path: `transform/opacity`,
`transform/position`, `text/sourceText`. A text that changes (typing, a counter) is
keys on its source text.

**Stills before any video.** `fx render-frame --project piece.ecproj --comp NAME --time T
--max-side 640 --out f.png` for the first, middle and last frame of every scene, tiled on
one sheet and looked at. What the sheet shows is fixed in the steps file, and the project
rebuilt.

**Edit in the montage editor.** A new sequence at the piece's size and rate
(`file.newSequence`), the audio imported (`file.import`), then one script through
`film run`: each composition placed as a linked clip (`link.addComp`, with the effects
project, the composition, the track and the time), the voice, the music and the sounds
placed (`timeline.place`), levels set (`clip.audioGain`), the music lowered under the
voice by the engine (`essentialSound.setType` on both, then `essentialSound.generateDucking`),
subtitles on a caption track (`captions.newTrack`, `captions.setStyle`, `captions.add`).
A linked clip follows its composition: saving the effects project again changes the film,
with nothing re-imported.

**Export.** `film --project piece.fcproj exec file.exportMedia` with the path, the format,
the range, `wait`, and when wanted `burnCaptions`, `captionSidecar`, `loudnessLufs`,
`scale`. The draft is the same call at half scale; the delivery render is made once.

One program of the piece's own runs all of it in order, so the film is rebuilt from its
sources with one command and comes out the same.

## Known traps

- Times snap to the frame grid. Keys are computed on the grid, or a value asked at one
  second lands a frame later and a cue drifts.
- A mask moves with its layer. To show a moving thing through a fixed window (text that
  scrolls inside a card), use a track matte.
- Two subtitles may not touch: each ends before the next begins.
- A font style that is not there is replaced without a word. Ask for a style, render a
  still, and look, before building on it.
- The loudness target is a parameter of the export command itself, not one of its
  settings, and so is the ceiling of its limiter (`truePeakDb`). The ceiling is applied
  before the encoder, which can overshoot it: the true peak is measured in the file.
- A linked clip carries the picture of its composition, not its sound: sound belongs on
  the montage timeline. The link remembers where the effects project was: the two project
  files stay together.
- A clip larger or smaller than the sequence is placed at its own size, not fitted.
- Footage with ten bits a channel in H.264 is imported without a word and cannot be read:
  it is converted to eight bits with `ffmpeg` first, and a still of every imported clip is
  looked at before the edit.
- Sizes are even numbers: an odd width or height is exported one pixel smaller.
- A caption's size is given for a frame 1080 lines high and scaled with the height: the
  same number is nearly twice as large in a vertical piece.
- Burnt-in captions draw Chinese, Japanese and Korean characters and emoji as empty boxes;
  for those the captions go in the sidecar file, or the text is built in the effects
  editor with a font of the machine that has them.
- The built-in voices are robotic and the natural ones speak English only; another
  language is subtitles.
- A shape asked for with a stroke and no fill is given a fill anyway: the fill is switched
  off by name.
- A new null sits at the centre of the composition with its anchor at its own centre.
  Children parented to it are placed from there: set the null's position and anchor first,
  or what hangs from it lands somewhere else, sometimes outside the frame, with no error.
- A path is added to the shape layer that is selected, not to a new one: make the empty
  shape layer first and name it in the call.
- A composition used inside another and enlarged is enlarged as a picture and goes soft,
  unless the layer's collapse switch is on.
- Property paths are read, not guessed: `fx props` lists them. The anchor is
  `transform/anchor`, a camera's point of interest `transform/poi`, and the colour of a
  text is set with the text command, not as a property.
- Names are not always what was typed: a text animator is addressed by the name the engine
  gave it, an effect on a montage clip by its position on the clip. Both are read back from
  the project before the first key is written; a wrong path can be accepted in silence.
- Some defaults draw badly and are changed on purpose: the motion blur of the push and
  slide transitions (copies, not blur), the iris shape of a camera with depth of field
  (square highlights).
- Roughened edges and depth of field multiply render time; they are tried on one still,
  then on one second, before the whole piece.
- A path drawn in the composition's space keeps its points measured from the centre of the
  frame. An anchor set on that layer is given the same way, or the shape jumps to a corner
  with no error.
- A child follows its parent's position, scale and rotation, not its opacity: what fades
  with its parent has opacity keys of its own.
- The background of a composition is not drawn when that composition is a layer of
  another: a full-frame shape of that colour is its background. A composition linked into
  the montage keeps its background, unless the link is made transparent on purpose.
- An effect that sweeps or scans is applied once to the layer holding the whole subject,
  and its strength is keyed to nothing outside the pass; before its first key it shows at
  that key's value.
- A render from the effects editor with sound asked for and no sound layer writes a silent
  track a few milliseconds longer than the picture: sound is off, or the length is checked.

## What it cannot draw yet

Said to the person before the plan, when the piece asks for one of them: typeset
mathematics; a stroke with the grain of a pencil or a brush; handwriting written stroke by
stroke; a halftone or dot screen; painted fills; a character rig (bones, springs, squash
on contact). Counters, charts, plotted curves, cursors and hatching exist only as layers
and keys the piece's own program computes. The fonts are the few it ships and those of the
machine.

## Notes left by the person

A note is a marker with a comment, placed in either editor where the work is.
`studio-cli notes list --film piece.fcproj --fx piece.ecproj` prints every open note, one
line each: which project, where, the time, the text, an id. "Resolve the notes" is that
one read, the work each asks for, and `notes resolve <id> --with "<what was done>"` for
each. A note that cannot be done is left open and said.

## Check

The checks of `method.md`, on the file: size, rate, length and streams; loudness and true
peak; black frames; a still from the middle of every scene, opened; the last seconds, for
an ending cut short. What nobody listened to or watched at speed is said.

## Report

```
made     out/piece-v2.mp4  1920×1080 · 30 fps · 0:49 · voice, music, subtitles
source   src/build (6 scenes, one steps file, one edit script); piece.ecproj, piece.fcproj
looked   contact sheet of 18 stills; 24 frames of the final file; the last second
not      not listened to; subtitles not proof-read by a speaker
```
