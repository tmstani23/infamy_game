# Usage rules

Rules for Claude threads working on this project, to keep usage low (agreed with Tim 2026-10-16).

- **Testing:** quick Node checks of the sim (`game/src/sim`) only. No headless-browser or Playwright runs, no screenshots. Tim checks the look in his own playtests.
- **Preview renders:** keep them to a minimum.
- **Replies:** only for results and blockers.
- **Project chat:** relays only blockers and finished results, no progress updates.
- **Threads:** close a thread as soon as its work is finished.
- **Models:** sprite exports and file sorting run in fresh threads on the cheaper Sonnet model. Code and combat work keeps the default model.
- **Big builds:** go in phases with a checklist in the plan file, ticked off as each phase lands, so work survives if usage runs out.
