# DOCTOR / ELIZA chatbot

A browser-based, dependency-free recreation of the classic Rogerian "DOCTOR" chatbot.

- `engine.js` – script parser + ELIZA engine (keyword ranks, `*` wildcards with captures, `@synonym` groups, pre/post substitution, reply rotation, `goto`, `newkey`, `$` memory rules, clause splitting, fallbacks).
- `doctor.script` – the dialogue script. **A recreated, DOCTOR-style script – not the original 1966 script.**
- `index.html`, `style.css`, `app.js` – the UI (textContent rendering only, relative paths, works on GitHub Pages).

Run: serve this folder over http (e.g. `python3 -m http.server`) and open `index.html`. `eliza.html` is a single-file build that also works when opened directly.

Not a medical tool. It only reflects your words back as questions.
