# Torque UI concept: "Night cluster"

Torque is the CX-5's maintenance memory, opened mostly in a parked car or a shop waiting room, one-handed, often at night. The design takes its cues from the car itself: the Signature trim's instrument cluster at night, satin-chrome bezels and the Soul Red paint. It does not borrow from generic app kits.

## Brief

- **Subject:** a single Mazda CX-5 Signature 2.5 Turbo and its service life.
- **Audience:** one owner, glancing between other things.
- **Primary job:** answer "what does the car need next, and when?" in one look, then make logging fast.
- **Constraints:** dark only, iPhone 390 px, works offline, 44 px targets, WCAG AA text contrast.

## Palette

| Name | Hex | Role |
| --- | --- | --- |
| Cabin | `#0E1317` | App background: a cool blue-graphite, like the cabin with the lights off |
| Dash | `#151C22` | Grouped surfaces (lists, sheets) |
| Bezel | `#26313A` | Hairlines, tracks, separators |
| Chrome | `#C5CED6` | Secondary text and icons, like satin trim |
| Gauge white | `#EEF2F5` | Primary text and numerals |
| Soul Red | `#D21F3C` | The needle and the start button. Nothing else. |

Status colours work like the cluster's warning lamps: green `#3DD68C` for fine, amber `#F5A524` for due soon, red `#F25C5C` for overdue, chrome-grey for inspect-only. They stay separate from Soul Red, so a warning never looks like decoration.

## Type

**Barlow** for everything, a grotesk drawn from highway signage and licence plates, which suits a car app. Numerals use **Barlow Condensed** with tabular figures, set wide like a trip meter: the odometer, intervals, costs and dates. One family, two widths, and the width change marks "this is a reading".

Scale (px): 13 caption, 15 secondary, 17 body, 20 row titles, 28 screen titles, 56 odometer. Sentence case throughout, with no all-caps eyebrow labels.

## Layout

The dashboard opens on the cluster, the one bold element. Everything else is quiet.

```
 CX-5                                   ● Synced
 2023 Signature Turbo

        ╭──────── ticks ────────╮
      ╱  ·  ·  ·  ·  ·  ·  ·  ·  ╲        240° arc, tick marks every 10
     │        52,480 mi           │       Soul Red needle at the health score
     │        est. · updated 3d   │       odometer in the hub (tap to update)
      ╲          health 80       ╱
        ───────────────────────

  ● 2 overdue   ● 1 due soon   ● 9 fine     <- lamp row (counts, tap opens Schedule)

  Up next
  ┌──────────────────────────────────────┐
  │ Engine oil and filter      Due soon  │  grouped list, hairline separators,
  │ ▮▮▮▮▮▮▮▮▯▯   in 640 mi · ~ Nov 9     │  not separate cards
  │──────────────────────────────────────│  segmented "fuel gauge" bar
  │ Tire rotation              Fine      │
  └──────────────────────────────────────┘
                                   ( + )   <- start button: dark disc,
 ─────────────────────────────────────────    Soul Red ring
  Home  Schedule  History  Costs  Settings  <- glass bar, needle dot on active tab
```

- Content is left aligned. Numbers are right aligned in rows, so readings line up.
- **Lists are iOS-style inset groups** with hairline separators. One container per group, instead of a card per row.
- **Progress is a segmented bar** of ten segments, like the fuel gauge. You read "how much is used" by counting segments, not by the colour alone.
- **Sheets** rise over a dimmed, blurred cabin and have a chrome hairline along the top edge.
- **The tab bar** is translucent glass. The active tab has a small Soul Red dot, echoing the needle.
- **The + button** is styled like the push-start button: a dark disc with a red ring.

## Principles

1. **One bold thing.** The cluster gauge is the signature. Everything else is calm, flat and aligned.
2. **Numbers are readings.** Any value you would read off a dash uses condensed tabular numerals.
3. **Colour means state.** Status lamps carry meaning and always have a text label. Soul Red is reserved for the needle and the primary action.
4. **Grouped, not carded.** Related rows share one surface, which keeps the screen quiet and dense enough to scan.
5. **Practical first.** 44 px targets, 17 px body text, inputs of 16 px or more, visible focus, and reduced motion respected.

## Review against generic defaults

| Default it could fall into | Where the first draft landed | Revision |
| --- | --- | --- |
| Near-black with a single bright accent | `#0E0F12` with a red accent everywhere | Blue-graphite cabin plus a chrome secondary tone. Red is limited to two elements, and status lamps carry the colour. |
| SaaS card kit | Every row its own rounded card | Inset grouped lists. Only the cluster and a few callouts stand alone. |
| All-caps tracked eyebrows | "UP NEXT", "BACKUP" section labels | Sentence-case section titles in Chrome. |
| Big number, small label, gradient | A plain stat ring | A real gauge with ticks and a needle, which is the subject's own instrument. |
| `A · B · C` meta strings | "CX-5 · 2023 Signature" | Two lines: name on the first, year and trim beneath. |
| Monospace data labels | n/a | Condensed Barlow numerals instead. |

## Motion

There is one orchestrated moment: on launch the needle sweeps from zero to the health score. It's skipped under reduced motion. Everything else moves only in response to a tap: sheets rise, the odometer digits roll, and segments fill when a service is logged.
