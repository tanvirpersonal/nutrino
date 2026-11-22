# Nutrino

A static, browser-only AI chatbot. No server, no API, no dependencies. It runs on GitHub Pages.

Started as a DOCTOR/ELIZA recreation. Nutrino is being upgraded step by step into a smarter, more natural conversationalist.

**Not a medical tool.** It is a rule-based program, not a professional.

## Files

- `engine.js` - the dialogue engine (script parser, keyword matching, memory, replies)
- `doctor.script` - the dialogue script (rules and replies)
- `index.html`, `style.css`, `app.js` - the UI (works on GitHub Pages, relative paths)
- `eliza.html` - single-file build that also works when opened directly

Run: serve this folder (`python3 -m http.server`) and open `index.html`.

---

## ROADMAP

> **For Claude / any new session:** read this section first. Work one step at a time.
> After finishing a step: change `[ ]` to `[x]`, add a line to the Progress log, commit, and push.
> Push after every file. Never batch several steps into one commit.

Legend: `[x]` done and pushed, `[~]` in progress, `[ ]` not started.

### Phase 0 - Rename and setup
- [x] 0.1 Rename DOCTOR to Nutrino in `index.html`, `app.js`, `eliza.html`
- [x] 0.2 Update `README.md` project description

### Phase 1 - Smarter conversation core
- [x] 1.1 Conversation memory: remember the user's name, and facts they state (`my X is Y`)
- [x] 1.2 Intent detection: greetings, thanks, questions, yes/no, farewells (yes/no and farewells were already in the script; engine now adds greetings, thanks, unmatched questions)
- [ ] 1.3 Sentiment detection: mood-aware replies (sad, angry, happy, anxious)
- [ ] 1.4 Typo tolerance: fuzzy matching for misspelled keywords
- [ ] 1.5 No-repeat logic: never give the same reply twice in a row

### Phase 2 - Knowledge and skills (all offline)
- [ ] 2.1 Small-talk script: how are you, who are you, what can you do
- [ ] 2.2 Built-in skills: time/date, simple math, unit conversion
- [ ] 2.3 Local knowledge base with keyword scoring (facts, definitions, FAQs)
- [ ] 2.4 Follow-up handling: understand "why?", "tell me more", "what do you mean"
- [ ] 2.5 Jokes, quotes, and fun fact modes

### Phase 3 - UI polish
- [ ] 3.1 Save and restore the conversation (localStorage)
- [ ] 3.2 Export chat as text
- [ ] 3.3 Suggested replies that change with the conversation
- [ ] 3.4 Rebuild `eliza.html` as the single-file build

### Progress log

| Date | Step | Commit note |
|------|------|-------------|
| 2026-11-23 | Setup | README with roadmap created |
| 2026-11-23 | 0.1 | DOCTOR branding replaced in UI text, title and logo letter |
| 2026-11-23 | 1.1 | `engine.js`: `learn()`, `personalize()`, `recall()` added. Remembers name and `my X is Y`, answers "what is my X", uses name every 5th reply. Tested in node. NOTE: `eliza.html` still has the old engine until step 3.4 |
| 2026-11-23 | 1.2 | `engine.js`: `intent()`, `askBack()`, `choose()` added. Name-aware greetings, thanks replies, and a question fallback instead of "please go on". Tested in node |
| 2026-11-23 | 0.3 | Final project name is **Nutrino** (matches the repo `tanvirpersonal/nutrino`). Briefly renamed to Nutrono, then reverted at the owner's request. Use Nutrino everywhere |
