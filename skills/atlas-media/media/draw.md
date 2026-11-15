# Hand-drawn — sketches, whiteboards, diagrams that draw themselves

For an explanation that should look made by a hand: a system drawn box by box, a whiteboard
that follows a voice, an illustration that appears stroke by stroke.

## A diagram that stays editable

A diagram someone will want to change is an Excalidraw file: `.excalidraw` is plain JSON
(elements with a type, a position, a size, text, the ids they are bound to), written
directly and opened at excalidraw.com or in the editor plug-in, with nothing installed.
Positions are assigned on a grid and then checked: no two boxes overlap, no label is wider
than its box, every arrow starts and ends on an element that exists. One colour for ink and
at most one accent. The animated version is the same file passed through
`excalidraw-animate`, which gives an SVG that draws itself in the order of the elements, so
the order of the elements in the file is the order of the explanation.
(muthuishere/hand-drawn-diagrams, MIT.)

## A whiteboard film

Drawn from vector outlines only: a path can be drawn on, a bitmap can only fade in. A scene
holds one idea and at most eight objects; every object that is seen has its own entrance,
written down (drawn, written, moved in, faded), and none simply is there at the cut.
Drawing follows the voice: the stroke ends when the word that names the thing ends.
Movement, turning and scaling are for directing the eye, used a few times in a piece.
(ToBeWin/HandDraw-Skill, MIT.)

## An illustration that appears

The order is the order of the craft: an ink drawing goes from light construction to the dark
line, a watercolour from the wash to the detail, and a film of it is the picture being made
in that order, not a wipe across a finished image. First draw, then move: nothing animates
until it has been drawn. Every picture is a function of its inputs with a seeded random
source, so a frame rendered twice is the same frame. (alexgreensh/anidoodle, Apache-2.0.)

## The look, proved on one still

Before any motion: one still, rendered and looked at, against the list of what goes wrong
in that style: lines too even to be a hand, fills that reach exactly to the edge, a wobble
that changes on every frame where the line should hold, text set in a font that pretends to
be handwriting beside strokes that are not. Two to four rounds of render, look, correct.
Only an approved still is animated. (The loop: cloveric/claude-drawing-skill, MIT; the list
is ours.)
