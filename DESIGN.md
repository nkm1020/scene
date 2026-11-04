---
name: Scene
description: A group chat performed at a clay dining table; the chat log is the film the table is shooting.
colors:
  leader: "#120a06"
  base: "#3a1d0b"
  base-2: "#47240e"
  base-3: "#5a2f12"
  mask: "#b4561d"
  edge: "#ffcd57"
  edge-hover: "#ffd775"
  print-ink: "#1d0f07"
  ink: "#fff3e3"
  ink-2: "#e6c8a6"
  ink-3: "#bf9b76"
  tally: "#ff5a43"
  hair: "rgba(255,205,87,.2)"
  stage-black: "#000000"
  ribbon-1: "#8fd18a"
  ribbon-2: "#ff9a76"
  ribbon-3: "#8ec5ff"
  ribbon-4: "#d7a6ff"
  ribbon-5: "#6fd3c6"
  ribbon-6: "#f7a8c8"
typography:
  edge-print:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.07em"
    fontFeature: "tnum"
    fontVariation: "\"wdth\" 72"
  edge-print-small:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "10.5px"
    fontWeight: 600
    letterSpacing: "0.07em"
    fontVariation: "\"wdth\" 72"
  headline:
    fontFamily: "Archivo, Apple SD Gothic Neo, Noto Sans KR, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 650
  title:
    fontFamily: "Archivo, Apple SD Gothic Neo, Noto Sans KR, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 650
  dialogue:
    fontFamily: "Archivo, Apple SD Gothic Neo, Noto Sans KR, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.35
  body:
    fontFamily: "Archivo, Apple SD Gothic Neo, Noto Sans KR, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "Archivo, Apple SD Gothic Neo, Noto Sans KR, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
rounded:
  frame: "2px"
  tag: "6px"
  control: "10px"
  panel: "12px"
  sheet: "14px"
spacing:
  rail: "16px"
  gap-sm: "8px"
  gap-md: "10px"
  frame-pad: "12px"
  gutter: "14px"
components:
  button-talk:
    backgroundColor: "{colors.edge}"
    textColor: "{colors.print-ink}"
    typography: "{typography.title}"
    rounded: "{rounded.panel}"
    height: "58px"
  button-talk-hover:
    backgroundColor: "{colors.edge-hover}"
  button-talk-recording:
    backgroundColor: "{colors.tally}"
    textColor: "#ffffff"
  button-talk-disabled:
    backgroundColor: "{colors.base-2}"
    textColor: "{colors.ink-3}"
  button-primary:
    backgroundColor: "{colors.edge}"
    textColor: "{colors.print-ink}"
    rounded: "{rounded.control}"
    height: "48px"
    padding: "0 18px"
  button-ghost:
    backgroundColor: "{colors.base-3}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "40px"
    padding: "0 16px"
  missed-pill:
    backgroundColor: "{colors.edge}"
    textColor: "{colors.print-ink}"
    rounded: "{rounded.control}"
    height: "46px"
    padding: "0 16px 0 12px"
  slate:
    backgroundColor: "{colors.leader}"
    textColor: "{colors.edge}"
    rounded: "{rounded.control}"
    padding: "4px 4px 4px 12px"
  input-field:
    backgroundColor: "{colors.base-2}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "48px"
    padding: "0 16px"
  frame:
    backgroundColor: "{colors.base}"
    textColor: "{colors.ink}"
    rounded: "{rounded.frame}"
    padding: "12px 12px 13px"
  frame-playing:
    backgroundColor: "{colors.base-3}"
  name-tag:
    backgroundColor: "{colors.leader}"
    textColor: "{colors.ink-2}"
    typography: "{typography.edge-print}"
    rounded: "{rounded.tag}"
    padding: "4px 8px 4px 7px"
  speech-bubble:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.print-ink}"
    rounded: "{rounded.sheet}"
  caption:
    backgroundColor: "{colors.edge}"
    textColor: "{colors.print-ink}"
---

# Design System: Scene

## Overview

**Creative North Star: "The Developed Negative"**

The room is a strip of developed 35mm colour negative running past a lit table. The chat is the film itself: an amber-brown base with an orange-mask perforation rail punched along both long edges, every message a numbered exposure with yellow edge print along its top and bottom. Everything that is not film (the header, the controls, the slate over a replay) sits on black-brown leader, the opaque tail of a roll. The stage (the clay table, rendered in three.js) is the only lit picture, and the film never competes with it for light.

Density is that of a contact sheet: dialogue large, edge print small, condensed and dense, with tabular figures so frame numbers, times and running lengths line up down the strip. One saturated control colour exists, the edge-print yellow; recording turns it into a red tally. Each person at the table carries one ribbon colour on their stage name tag, their frames and their own chip. Nothing else on screen is coloured.

This system is derived from the shipped room screen. The landing page and the join flow have not moved onto it yet (see "Surfaces not yet on the film world" at the end).

**Key Characteristics:**
- Warm black-brown leader around an amber film base; no neutral greys in the room.
- A real perforated rail (punched holes that show what is behind) on every film surface.
- Condensed uppercase edge print with tabular figures carries all metadata.
- One bright control colour (edge yellow), one recording colour (tally red), one hairline weight.
- Per-person ribbon colours that stay identical between stage and strip.

## Colors

A warm, single-family palette of film-base browns lit by one edge-print yellow, with ribbon hues reserved for people.

### Primary
- **Edge-Print Yellow** (edge): the one bright control and the colour of all edge print. Fills the hold-to-talk bar, the send button, the missed pill, the live caption on stage, the countdown bar, focus rings, selection and caret. Hover lifts it to **Warm Highlight** (edge-hover).
- **Print Ink** (print-ink): the near-black brown that sits on yellow and on the cream bubble. Never use white or pure black on yellow.

### Secondary
- **Tally Red** (tally): recording only. The talk bar turns tally red while held, with pale label text. It is not an error colour and not decoration.

### Tertiary
- **Ribbon Set** (ribbon-1 to ribbon-6: green, coral, sky, lilac, teal, pink): one per seat, assigned by seat order and fixed for the session. Appears as the dot on a stage name tag, the speaker name in a frame's edge print, the strip peek's speaker, and the 3px underline of your own chip.

### Neutral
- **Leader** (leader): header, composer, slate, name tags, and the dark gaps between frames.
- **Film Base** (base): the strip, the floating sheets, the empty-table card.
- **Base Lift** (base-2): hovered frames, inputs, friend rows, disabled controls.
- **Base Exposed** (base-3): the frame currently playing, ghost buttons, the sending preview, scrollbar thumbs.
- **Orange Mask** (mask): the perforation rail, and nothing else.
- **Cream Ink** (ink): dialogue and primary text; also the speech bubble fill on stage.
- **Faded Ink** (ink-2): secondary text and resting icon buttons.
- **Edge Fade** (ink-3): times, addressees, placeholders, counts.
- **Hairline** (hair): the single 1px rule, yellow at 20% opacity.
- **Stage Black** (stage-black): behind the stage canvas while it loads.

### Named Rules
**The One Bright Control Rule.** Edge yellow is the only saturated fill a control may take. A second accent, a gradient, or a coloured secondary button breaks the film.

**The Ribbon Is a Person Rule.** Ribbon colours mark people and only people. A friend's colour is identical on stage and in the strip, and is never used for state, buttons or emphasis.

**The Mask Stays on the Rail Rule.** Orange mask colours the perforations alone; it is not a fill, a border or a text colour.

## Typography

**Edge-Print Font:** Archivo (variable, width axis), condensed to wdth 72
**Body and Dialogue Font:** Archivo at its normal width (with Apple SD Gothic Neo, Noto Sans KR, system-ui for Korean); one variable family, 100-900 weight and 62-125% width, so the film's record and its dialogue share a face

**Character:** A narrow industrial grotesque prints the film's technical record in uppercase; the dialogue sits in a plain, open sans at reading size, so what people said is always the biggest thing on the strip.

### Hierarchy
- **Headline** (650, 20px): sheet titles ("Add a friend", "You").
- **Title** (650, 17px): room name in the header; the hold-to-talk label.
- **Dialogue** (400, 17px, 1.35): a frame's line, the sending preview, and the stage bubbles and caption (17-18px). The largest text in the room on purpose.
- **Body** (400, 15px, 1.45): the strip peek line, missed-pill label (650), empty-state copy, friend names.
- **Label** (400, 14px): sheet sub-copy and friend descriptions, in faded or edge-fade ink.
- **Edge Print** (Archivo 600, 11px, 1.2, 0.07em, uppercase, tabular, wdth 72): frame number, speaker, addressee, clock time, running length, voice-check status, direction notes, room presence, slate text. **Edge Print Small** (10.5px) is the same voice on the stage's flags and the "AI-made" mark.

### Named Rules
**The Dialogue Large, Edge Print Small Rule.** What someone said is set at 15-18px; everything about it (who, to whom, when, how long, checked or not) is 10.5-11px condensed caps. Never swap them.

**The Tabular Figures Rule.** Every number in edge print uses tabular figures; frame numbers are zero-padded to three digits (001) and running time reads "2.4 S" under a minute, "1:05" past it.

## Layout

The room is a full-height column: a 54px leader header, the stage filling all remaining height, a 60px strip peek, and the composer on leader at the bottom (with the safe-area inset). On phones the strip is a bottom sheet up to 760px wide, pulled up by dragging or tapping its head; it opens over the stage with a 0.42s expo-out height transition. From 1024px the strip lies on the stage's bottom-left (440px wide, 16px from the left, 14px from the bottom) and the stage camera takes an off-centre view offset of 472px so the table is framed in the uncovered part instead of behind the film.

Spacing is measured from the rail. The perforation rail is 16px; content on film starts one gutter past it (strip head 28px/26px, sheets 30px horizontal padding). Frames pad 12px; rows inside controls gap 8-10px; the composer pads 10px 14px. Overlays on the stage sit 12-14px from its edges, the missed pill and slate centred at the top.

**The Stage Is the Picture Rule.** The table is never covered by more than the strip and one top-centred pill or slate; on wide screens the lens moves rather than letting the film hide a seat.

## Elevation & Depth

Depth comes from tone first: leader is the darkest plane, film base sits above it, base-2 and base-3 mark hover and playing. Shadows are soft, warm and only on things that float over the stage picture: never hard-offset, never on film resting on leader.

### Shadow Vocabulary
- **Float** (`box-shadow: 0 6px 18px rgba(10,5,2,.45)`): missed pill and slate over the stage.
- **Speech** (`box-shadow: 0 6px 16px rgba(10,5,2,.35)`): stage speech bubbles and caption (none on emoji-only bubbles).
- **Sheet Open** (`box-shadow: 0 -12px 34px rgba(10,5,2,.55)`): the strip once pulled up; at rest the same shadow is fully transparent.
- **Laid On Stage** (`box-shadow: 0 10px 30px rgba(10,5,2,.5)`): the wide-screen strip lying on the stage.
- **Ribbon Underline** (`box-shadow: inset 0 -3px 0 <ribbon>`): your own chip.
- **Scrim** (`rgba(8,4,2,.66)`): behind floating sheets.

### Named Rules
**The One Hairline Rule.** Rules are 1px in the hairline yellow-at-20%. The only heavier line is the 3px leader gap between frames, which is the film's own frame line, not a border.

## Shapes

Corners are modest and come in a short ladder: 2px on a frame (an exposure is nearly square-cornered), 6px on stage name tags, 10px on controls (pill, slate, inputs, send, ghost buttons), 12px on panels (strip sheet, talk bar, own chip, empty-table card, friend list), 14px on floating sheets and the stage bubble. The caption keeps one sharp corner (14px 14px 4px 14px) to point at its speaker, as does the sending preview (12px 12px 4px 12px). Perforations are rounded rectangles (9 x 6, 1.1px radius) on a 16 x 14 repeat, punched through with a mask so the stage shows through them on the strip, painted dark on sheets. Ribbons on name tags are 6px dots.

**The No Pills in the Room Rule.** Fully rounded 999px pills belong to the older landing and join styling; room controls use the 10-12px ladder.

## Components

### Buttons
Tactile, few, and yellow only when primary.
- **Hold to talk:** full-width bar, 58px, 12px radius, edge yellow with print-ink 17px/650 label and a smaller "or hold Space" hint (hidden on coarse pointers). Hover lifts to Warm Highlight. Held: tally red, white label, a "REC 0:07" edge-print counter, scale .985. Disabled: base-2 with edge-fade text, full opacity.
- **Primary (send, add a friend, sheet actions):** edge yellow, print ink, 10px radius, 48px tall in the composer, 650 weight.
- **Ghost:** base-3 fill, cream ink, 10px radius; hover deepens to a darker brown.
- **Icon buttons:** 40px circles, faded ink, base-2 on hover; icons are 1.5px-stroke line SVGs at 20px.
- **Press:** 0.12s scale with cubic-bezier(.2,.8,.2,1); everything is disabled under reduced motion.

### Missed Pill
Edge yellow, 46px, 10px radius, play icon, "Play 12 missed" at 15px/650 and the running time as edge print in a darker brown. Top-centre of the stage, Float shadow, lifts 1px on hover.

### Slate
The replay's clapperboard: leader with a hairline border, 10px radius, edge-print status ("FRAME 119 · 6/12 · SPARK DIRECTED · CHECKED · 23.5 S", frame number in cream) and two small text buttons for speed and skip. Pulses while Spark is directing; fades after four seconds when idle.

### The Strip (signature)
A vertical film strip, perforated down both sides. Its head shows either the latest frame on one line (frame number, speaker in ribbon, line) or, when open, "CHAT · 12 FRAMES · 12 MISSED" with the missed count in yellow, plus a chevron that turns over. Each frame is an exposure: an edge-print row (number, speaker, "to" addressee, time pushed right), the dialogue line, and a second edge-print row (MISSED and the voice-check status in yellow, then running length, expression and camera notes in edge fade). Frames are separated by 3px leader gaps; hover is base-2, the playing frame is base-3 with its number in cream. The list fades in under the head with a 14px mask.

### Inputs / Fields
Base-2 fill, 10px radius, 48px tall, cream text, edge-fade placeholder, yellow caret. Focus is a 2px edge-yellow outline offset 2px. The invite link field prints in condensed edge type at 12.5px in yellow.

### Stage Overlays
Name tags are leader chips in edge print with a ribbon dot; the speaker's tag turns yellow, an absent friend's fades. Speech bubbles are cream with print ink and a tail; the live caption is edge yellow. Flags and the "AI-made" mark are edge print small.

### Sheets
Add-a-friend and You float over a scrim as film base sheets up to 560px, 14px top radius, with the perforation rail painted down both sides. Sections divide on the hairline; the friend list is a hairline-gapped stack of base-2 rows with 52px faces; the cost receipt is a tabular table with hairline rows and right-aligned figures.

## Do's and Don'ts

### Do:
- **Do** put every piece of metadata in edge print: Archivo 600, 11px, wdth 72, 0.07em, uppercase, tabular.
- **Do** address messages by zero-padded frame number and show running time on every frame and on the missed pill.
- **Do** give each person one ribbon colour and use it in the same places on stage and in the strip.
- **Do** keep edge yellow for the primary control, edge print, focus and the live caption; set print ink (#1d0f07) on it.
- **Do** run the perforation rail down both long sides of any film surface, 16px wide in orange mask.
- **Do** move the lens (view offset) when the strip lies over the stage on wide screens.

### Don't:
- **Don't** introduce neutral greys, white pills or pure-white text into the room; inks are cream and browns.
- **Don't** add a second accent or use tally red for anything but recording.
- **Don't** draw borders heavier than the 1px hairline; the 3px leader frame line is the only exception.
- **Don't** use the orange mask outside the rail, or ribbon colours for anything but people.
- **Don't** put soft shadows on film resting on leader; shadows belong to things floating over the stage.

## Surfaces not yet on the film world

The landing page (`app/page.tsx`, `app/landing.css`) and the join flow (Join and FigureStudio cards) still use the earlier generic dark styling: the `:root` tokens in `app/globals.css` (ground #0e0d0c, white primary pills, 999px controls, 20px cards, Inter throughout). The stage engine's own default overlay styles (white bubbles, near-black pill name tags) also predate the film world and are overridden inside the room. These are the older system, not part of this one; move them onto the film tokens rather than extending them.
