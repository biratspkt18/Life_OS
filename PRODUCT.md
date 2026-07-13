# Product

## Register

product

## Users

One person: the developer himself (junior front-end dev, ADHD brain), using it
daily on a desktop browser and as an installed PWA on his phone. He's always
mid-task when he's in the app — capturing a thought, placing a block of work,
checking what's next. Sessions are short and frequent; the phone is often
one-handed.

## Product Purpose

A single-user, scheduling-first task manager. You add a task; the app finds a
time you're actually free (dodging your other tasks and Google Calendar
events), mirrors it to Google Calendar, and pings you before it starts. The
app proposes; you decide. Success = nothing falls through the cracks and the
app never makes you feel bad about what slipped.

## Brand Personality

Calm, warm, forgiving. Warm-paper "Cue" aesthetic — never stark white, never
harsh red, never urgency-theater. Slipped tasks get a "gentle catch-up", not a
guilt trip. Micro-interactions are springy and tactile (checking a task off
should feel satisfying), but motion always conveys state, never decoration.

## Anti-references

- Productivity apps that punish: red overdue badges, streak guilt, alarm-red
  everything. This app uses warm terracotta for "danger" and calls missed
  tasks "loose ends".
- Dense power-user dashboards (Jira, Notion-as-a-wall-of-databases). One
  screen = one job.
- Manual time entry. The app never offers a time you can't actually take —
  pickers show only real free slots.

## Design Principles

1. **The app proposes; you decide.** Surfaces suggest (free slots, catch-up
   plans); the user always gets the final tap.
2. **Never offer the impossible.** No past times, no double-booking, no dead
   ends — options shown are options that work.
3. **Calm over urgency.** Slippage is met with gentle re-homing, not alarm.
4. **One thing at a time.** Spotlight one task; show the next 3, not thirty.
5. **Tactile, quick, optimistic.** Mutations feel instant; springs give taps
   a physical "give"; nothing waits on the network to respond.

## Accessibility & Inclusion

No formal WCAG target, but: keyboard-friendly controls (duration wheel, `n`
to capture, Escape closes overlays), visible indigo focus rings everywhere,
44px-class touch targets on mobile, and `prefers-reduced-motion` should be
respected as motion work continues. Single user, so no i18n.
