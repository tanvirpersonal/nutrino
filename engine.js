const MAX_WORDS = 80;
const normalize = v => String(v ?? "").toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/[^a-z0-9' ]/g, " ").replace(/\s+/g, " ").trim();
const words = s => s.split(" ").filter(Boolean);
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
// Words that must never be stored as a name ("call me later", "my name is not important").
const NOT_NAMES = new Set(["not", "sure", "fine", "good", "bad", "tired", "here", "back", "okay", "ok", "happy", "sad", "sorry", "just", "very", "so", "the", "going", "feeling", "really", "later", "maybe", "when", "if", "crazy", "stupid", "important", "none", "nothing"]);

function parseScript(source) {
  const d = { initial: "", final: "", quit: [], pre: new Map(), post: new Map(), synonyms: {}, keywords: [] };
  let key = null, dec = null, m;
  for (const raw of String(source).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    if ((m = line.match(/^initial:\s*(.*)$/i))) d.initial = m[1];
    else if ((m = line.match(/^final:\s*(.*)$/i))) d.final = m[1];
    else if ((m = line.match(/^quit:\s*(.*)$/i))) d.quit.push(normalize(m[1]));
    else if ((m = line.match(/^pre:\s*(\S+)\s+(.+)$/i))) d.pre.set(m[1].toLowerCase(), m[2].toLowerCase());
    else if ((m = line.match(/^post:\s*(\S+)\s+(.+)$/i))) d.post.set(m[1].toLowerCase(), m[2]);
    else if ((m = line.match(/^synon:\s*(.+)$/i))) {
      const g = m[1].toLowerCase().split(/\s+/);
      for (const w of g) d.synonyms[w] = g;
      d.synonyms[g[0]] = g;
    } else if ((m = line.match(/^key:\s*(\S+)(?:\s+(-?\d+))?$/i))) {
      key = { word: m[1].toLowerCase(), rank: Number(m[2] || 0), decomps: [] };
      d.keywords.push(key); dec = null;
    } else if ((m = line.match(/^decomp:\s*(.*)$/i)) && key) {
      let p = m[1].toLowerCase().trim(), memory = false;
      if (p.startsWith("$")) { memory = true; p = p.slice(1).trim(); }
      key.decomps.push(dec = { pattern: words(p), memory, replies: [], cursor: 0 });
    } else if ((m = line.match(/^reasmb:\s*(.*)$/i)) && dec) dec.replies.push(m[1]);
  }
  d.byWord = new Map(d.keywords.map(k => [k.word, k]));
  return d;
}

// Wildcard matcher: "*" = any run of words (shortest first), "@group" = one synonym word (captured).
// Failed (pattern, position) pairs are memoised, so matching stays polynomial on long input.
function match(pattern, input, syn) {
  const dead = new Set();
  const walk = (pi, wi, caps) => {
    const id = pi * 1000 + wi;
    if (dead.has(id)) return null;
    let res = null;
    if (pi === pattern.length) res = wi === input.length ? caps : null;
    else {
      const t = pattern[pi];
      if (t === "*") {
        for (let end = wi; end <= input.length && !res; end++) res = walk(pi + 1, end, [...caps, input.slice(wi, end).join(" ")]);
      } else if (t[0] === "@") {
        const g = syn[t.slice(1)] || [t.slice(1)];
        if (wi < input.length && g.includes(input[wi])) res = walk(pi + 1, wi + 1, [...caps, input[wi]]);
      } else if (wi < input.length && input[wi] === t) res = walk(pi + 1, wi + 1, caps);
    }
    if (!res) dead.add(id);
    return res;
  };
  return walk(0, 0, []);
}

export class ElizaEngine {
  constructor(script) {
    this.data = parseScript(script);
    if (!this.data.keywords.length) throw new Error("The script contains no keywords.");
    this.reset();
  }

  get greeting() { return this.data.initial || "How do you do. Please tell me your problem."; }

  reset() {
    this.closed = false; this.memory = []; this.last = "";
    // Step 1.1: what Nutrono has learned about the user this session.
    this.profile = { name: null, facts: new Map() };
    this.recalled = new Set();
    this.rot = {};
    this.turns = 0;
    for (const k of this.data.keywords) for (const d of k.decomps) d.cursor = 0;
  }

  // Step 1.1: learn the user's name and "my X is Y" facts; answer questions about them.
  // Returns a reply string when the message is about the user's profile, otherwise null.
  learn(raw) {
    const t = raw.trim(), p = this.profile;
    let m;
    if ((m = t.match(/\b(?:my name is|call me|i am called|i'm called|people call me)\s+([a-z][a-z'-]{1,19})\b/i)) && !NOT_NAMES.has(m[1].toLowerCase())) {
      const before = p.name;
      p.name = cap(m[1].toLowerCase());
      return before && before !== p.name
        ? `Understood. I will call you ${p.name} from now on.`
        : `Nice to meet you, ${p.name}. What would you like to talk about?`;
    }
    if (/\b(what is my name|what's my name|do you know my name|who am i)\b/i.test(t))
      return p.name ? `Your name is ${p.name}.` : "I do not know your name yet. What should I call you?";
    if ((m = t.match(/\bwhat(?:'s| is| are) my ([a-z]+(?: [a-z]+)?)\s*\??$/i))) {
      const key = m[1].toLowerCase(), val = p.facts.get(key);
      if (val) return `Your ${key} is ${val}.`;
    }
    if ((m = t.match(/\bmy ([a-z]+(?: [a-z]+)?) (?:is|are) ([^.,;!?]{1,60})/i))) {
      const key = m[1].toLowerCase();
      if (!NOT_NAMES.has(key) && key !== "name") p.facts.set(key, this.reflect(normalize(m[2])));
    }
    return null;
  }

  // Step 1.2: rotate through a reply pool without repeating the last pick.
  choose(pool, tag) {
    this.rot = this.rot || {};
    const i = (this.rot[tag] = (this.rot[tag] ?? -1) + 1) % pool.length;
    return pool[i];
  }

  // Step 1.2: detect greetings and thanks. Returns { tag, text } or null.
  intent(raw) {
    const t = normalize(raw), name = this.profile.name, n = name ? `, ${name}` : "";
    if (words(t).length <= 5 && /^(hi|hello|hey|hiya|howdy|yo|good (morning|afternoon|evening)|greetings)\b/.test(t))
      return { tag: "greet", text: this.choose([`Hello${n}. What is on your mind today?`, `Hi${n}. How are you feeling?`, `Good to see you${n}. What would you like to talk about?`], "greet") };
    if (/\b(thanks|thank you|thx|cheers)\b/.test(t) && words(t).length <= 8)
      return { tag: "thanks", text: this.choose([`You are welcome${n}. Is there more you would like to explore?`, `Glad I could help${n}. What else is on your mind?`, `Any time${n}. Shall we continue?`], "thanks") };
    return null;
  }

  // Step 1.2: a question no rule matched still deserves more than "please go on".
  askBack(raw) {
    if (!/\?\s*$/.test(raw.trim()) && !/^\s*(who|what|when|where|why|how|can|could|do|does|is|are|will|would|should)\b/i.test(raw)) return null;
    return this.choose(["That is a good question. What do you think the answer might be?", "I would rather hear your view first. What comes to mind?", "Why do you ask that?", "What answer would help you most right now?"], "ask");
  }

  // Step 1.1: use the name now and then, so replies feel personal.
  personalize(text) {
    this.turns++;
    const name = this.profile.name;
    if (!name || this.turns % 5 !== 0 || text.includes(name)) return text;
    return /[.?!]$/.test(text) ? text.replace(/([.?!])$/, `, ${name}$1`) : `${text}, ${name}`;
  }

  // Step 1.1: bring back something the user said earlier (each fact once).
  recall() {
    for (const [key, val] of this.profile.facts) {
      if (this.recalled.has(key)) continue;
      this.recalled.add(key);
      return `Earlier you told me that your ${key} is ${val}. Does that connect to what you are saying now?`;
    }
    return null;
  }

  reflect(text) {
    const w = words(text), out = [];
    for (let i = 0; i < w.length; i++) {
      if (w[i] === "you" && w[i + 1] === "are") { out.push("I", "am"); i++; }
      else if (w[i] === "you" && i === w.length - 1 && i > 0) out.push("me");
      else out.push(this.data.post.get(w[i]) ?? w[i]);
    }
    return out.join(" ").replace(/\byou was\b/g, "you were");
  }

  fill(template, caps) {
    const text = template.replace(/\((\d+)\)/g, (_, n) => this.reflect(caps[n - 1] || "")).replace(/\s+([?.!,])/g, "$1").replace(/\s+/g, " ").trim();
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  // Returns a reply string, or null for "try the next keyword" (NEWKEY).
  apply(key, input, depth = 0) {
    if (!key || depth > 8) return null;
    for (const dec of key.decomps) {
      const caps = match(dec.pattern, input, this.data.synonyms);
      if (!caps || !dec.replies.length) continue;
      const reply = dec.replies[dec.cursor++ % dec.replies.length];
      if (dec.memory) { this.memory.push(this.fill(reply, caps)); continue; }
      if (reply.toLowerCase() === "newkey") return null;
      const go = reply.match(/^goto\s+(\S+)$/i);
      if (go) {
        const out = this.apply(this.data.byWord.get(go[1].toLowerCase()), input, depth + 1);
        if (out) return out;
        continue;
      }
      return this.fill(reply, caps);
    }
    return null;
  }

  respond(message) {
    const raw = String(message ?? "").slice(0, 2000);
    let text = normalize(raw);
    if (!text) return { text: this.pick("xnone", [], "Please go on."), done: false };
    const sub = t => words(t).map(w => this.data.pre.get(w) ?? w).join(" ");
    const clean = sub(text);
    const w0 = words(clean);
    if (w0.length <= 2 && w0.some(w => this.data.quit.includes(w)) || this.data.quit.includes(clean)) {
      this.closed = true;
      return { text: this.data.final || "Goodbye.", done: true };
    }
    const learned = this.learn(raw);
    if (learned) return { text: this.personalize(learned), done: false, keyword: "profile" };
    const intent = this.intent(raw);
    if (intent) return { text: intent.text, done: false, keyword: intent.tag };
    // Classic clause handling: use the first clause (split at . , ; ! ?) that holds a keyword.
    const clauses = raw.split(/[.,;!?]+/).map(c => words(sub(normalize(c))).slice(0, MAX_WORDS)).filter(c => c.length);
    const known = c => c.filter(w => this.data.byWord.has(w) && w !== "xnone");
    const clause = clauses.find(c => known(c).length) || words(clean).slice(0, MAX_WORDS);
    const found = [...new Set(known(clause))].map(w => this.data.byWord.get(w))
      .sort((a, b) => b.rank - a.rank || clause.indexOf(a.word) - clause.indexOf(b.word));
    for (const key of found) {
      const out = this.apply(key, clause);
      if (out) { this.last = out; return { text: this.personalize(out), done: false, keyword: key.word }; }
    }
    if (this.memory.length) return { text: this.personalize(this.memory.shift()), done: false, keyword: "memory" };
    const asked = this.askBack(raw);
    if (asked) return { text: this.personalize(asked), done: false, keyword: "question" };
    const recalled = this.recall();
    if (recalled) return { text: this.personalize(recalled), done: false, keyword: "recall" };
    return { text: this.personalize(this.pick("xnone", clause, "Please go on.")), done: false, keyword: "xnone" };
  }

  pick(word, input, fallback) {
    return this.apply(this.data.byWord.get(word), input) || fallback;
  }
}
