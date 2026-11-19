# Kinds of piece with the studio — the construction that held up

Each kind below was built once with the studio from its command line, ten seconds long,
and put beside a frame of the same kind made with a mainstream tool. What is written here
is the construction that worked and where it fell short. It is read after `studio.md`,
for the kind being made; the rules of the kind itself (pace, script, look) stay in their
own files.

Common to all of them: the piece's own program computes positions and keys from the data
or the timings and writes one steps file; the engine plays the keys. A slow push-in of two
or three per cent on a parent null keeps a held frame alive.

## Type that moves

One word at a time, large and centred: each word its own text layer, scaled from 150 to
100 per cent in about a fifth of a second with the layer's motion blur on, the word before
it shrinking and fading underneath so the two share a few frames. A sentence revealed word
by word is one text layer and a text animator: range selector, units by index, based on
words, its start keyed at the times the words are said. A second animator colours or
enlarges one word; an enlarged word does not push its neighbours, so it is given a position
offset on the same animator.
Short of the mainstream look: the weight. The fonts are few and none is variable; a heavy
condensed face is imitated with bold and a horizontal scale.

## One number

The count is keys on the source text, one per frame, eased out so the last digits crawl,
with tabular figures so the digits do not shake. Number and unit stay centred as a pair
through expressions on the measured width of the text. A text layer scales from its
baseline origin: what sits beside it follows through the same expression, or the gap
closes during a pulse.

## Charts

No chart primitive: every bar, gridline, label and value is a layer placed from the data.
A bar is a rectangle moved inside its own layer so the layer's origin is on the baseline;
a key on the vertical scale then grows it upward. Bars start half a second apart; each
value appears as its bar lands. After the growth, everything but the bar that matters
dims to under half. This kind matched its reference.

## A graph that draws itself

Grid lines are two-point paths revealed by a trim. The curve is one path whose points and
tangents come from the function and its derivative; its trim end is keyed once per frame
from a table of arc length, and a dot is keyed from the same table, so it rides the tip of
the stroke. Labels are text.
Short of the mainstream look: typeset mathematics. A stacked fraction or a formula in a
mathematical face cannot be set; say so before the plan, and offer Manim when it is
installed and the formulas are the content.

## Whiteboard

One shape layer per stroke: box, then its text, then the arrow to the next box, in reading
order. The paths are computed with a small seeded wobble and an overshoot where a box
closes; each has a trim keyed from nothing to whole, and its layer starts when its stroke
starts. Lettering is a hand-like font of the machine revealed left to right by a soft
linear wipe.
Short of the mainstream look: the lettering is revealed, not written, and the line has one
weight.

## Pencil doodle

Many loose paths per object, drawn in the order of the craft: faint construction lines,
the darker contour, then hatching computed by the program and stopped short of the edges.
The trim draws the strokes of a layer one after another. The lines stay alive by a wiggle
on the paths whose seed changes twelve times a second through an expression, with the
layer's time stepped to the same rate. Roughened edges give grain and multiply render
time: about three minutes for ten seconds.
Short of the mainstream look: hatching that is too regular, no pressure, thin colour. It
reads as the style at a glance and not on a second look; say that.

## A simple character

A rig of layers: a null at the feet, the body with its anchor at its base so a squash keeps
the feet down, legs on the null, arms anchored at the shoulder and eyes on the body, a
blurred shadow that shrinks with height. Every principle is in the program, not in the
engine: anticipation, stretch, a ballistic arc, squash, a damped settle, arms as springs
that lag the body. All of it keyed on every frame.
Short of the mainstream look: flat fills where the reference is painted. Fit for geometry
with a face; not for a drawn character.

## Cut-paper collage

Torn edges from a seeded random walk on the path, roughened, then a soft drop shadow that
grows with nearness. Pieces arrive one at a time with an overshoot and a small settling
turn, then drift at a speed set by their depth. A noise layer multiplied over everything
is the paper.
Short of the mainstream look, and by a lot: that look is made of printed photographs in
halftone. Without images supplied by the person the pieces are flat shapes, and there is
no dot screen. With their images it is a different piece: ask for them.

## Lower third and callout

Everything of the bar on one null that slides in, holds, and leaves before the cut; the
second line a beat after the first. The callout: a dot, a ring that expands, a line drawn
dot to elbow to label by a trim, the label last. Kept inside the title-safe margin and off
the subject. Nothing was missing for this kind.

## Interface demo

The interface is one composition; a second one holds it as a layer with the anchor on the
thing being shown, and position and scale are keyed together to zoom in and back out, with
the collapse switch on so the enlarged text is redrawn sharp. The pointer is a small drawn
path whose tip is the layer's origin; a click is a dip of the pointer and the button and a
ring from the click point.
For a real app the recording comes first (`demo.md`); the studio adds the zoom, the
callouts and the edit. A window floating on a backdrop with a shadow was not built.

## Transitions and a grade

In the montage editor. A transition is applied at a cut with its length in frames; the
push is asked for with its motion blur at zero. A grade is the colour effect on the clip,
its parameters addressed by the effect's position on the clip, read from the sequence
first. Before and after is two copies of the same shot with a wipe held between them.
`look.md` gives the numbers to aim at; they are applied here.

## Depth and a camera

Flat layers switched to three dimensions and spread in depth, each sized to cover the
frame for the whole move; a two-node camera that mostly trucks and dollies a little, its
point of interest travelling a part of the way. Parallax is then real and is checked by
measuring how far near and far layers moved between the first and last still. Depth of
field with the iris changed from the default; one still, then one second, before the rest.
The look depends on what is on the layers: dark greys on black give planes that barely
separate.

## Logo sting

The mark is built from shapes that arrive one by one and settle; the word follows; one
accent closes it. A light sweep is applied once, to the layer that holds the whole lockup:
one per layer puts the band in a different place on each. Its intensity is keyed from
nothing, up, and back to nothing around the pass, or the band sits on the mark from the
first frame. Wide tracking adds space after the last letter, so a centred word is nudged
back by half of it.
Short of the mainstream look: a coloured bloom and ready-made logo presets; a white halo
stands in.

## Map

No map data and no projection: the coast, the borders and the places are paths and points
the piece's own program writes, from real coordinates it projects or from an invented
land. One region highlighted by its fill, pins that drop with a small overshoot, labels
after their pins, a route drawn by a trim with a dot keyed along it frame by frame, a slow
push-in. A child does not take its parent's opacity: a pin's parts each get their own
keys.
Short of the mainstream look: real geography with many places is a data job done outside
the engine first.

## Headline or post as a card

A card that enters, an avatar circle, a name, text revealed line by line, one phrase
highlighted, a count that ticks up. The highlighted phrase is a layer of its own placed by
expressions on the measured text, because the engine cannot say where a phrase falls
inside a line. Invented content, no platform's logo. This kind matched its reference.

## A deck as video

Each slide is a composition; a parent composition moves them in turn with the same push.
A nested composition's background is not drawn: each slide gets a full-frame rectangle of
the paper colour, and the parent's own background is the same colour, or a line of the
wrong colour shows where two slides meet. The time each slide stays comes from the
legibility rule in `method.md`, not from the length asked for: three slides do not fit in
ten seconds, and that is said before the plan. This kind matched its reference.

## Captions that follow a voice

The montage editor's captions are whole blocks. Captions that light up word by word are
built in the effects editor: one text layer per phrase and a text animator whose range
selector, based on words, has its end keyed once per word. The voice gives no word times:
the phrases come from the pauses measured in the file, and the words inside a phrase are
estimated from how long each takes when spoken alone. That estimate is said in the report;
a transcriber with word times, when one is installed, replaces it. The natural voices
speak English: a line in another language sits under the lit one as a translation.

## Cut to the beat

The grid of `music.md` first. A tempo whose beat is a whole number of frames (120 beats a
minute at 30 frames a second is 15 frames) lands every cut exactly; any other tempo is
rounded beat by beat from the grid, never accumulated. Cuts on the bars, hits (a scale
pulse, a flash, a colour change) on the beats between. Checked by measuring the frame of
each cut against the beat in the exported file. A freeze frame and a speed ramp were not
built.

## Vertical short

A 1080×1920 sequence and compositions of the same size. The hook is on screen within the
first second; everything that matters stays inside the safe zones of `export.md`; captions
sit low but above the platform's interface. The caption size is asked for smaller than on
a horizontal piece and checked on a still, because it is scaled with the height of the
frame. A still with the safe zones drawn over it is part of the check.

## A look on footage

The grade of `look.md` is applied with the colour effect on the clip: the wheels are
colours whose neutral is mid grey, shadows pushed one way and highlights the other. The
result is measured, not judged by eye: the same patches before and after, in a colour
space where the shift has a number. Before and after as a wipe held between two copies of
the shot. A gentle look reads as a correction; the numbers of the reference say how far to
go.
