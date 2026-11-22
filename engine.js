const MAX_WORDS = 80;
const normalize = v => String(v ?? "").toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/[^a-z0-9' ]/g, " ").replace(/\s+/g, " ").trim();
const words = s => s.split(" ").filter(Boolean);

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
    for (const k of this.data.keywords) for (const d of k.decomps) d.cursor = 0;
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
    // Classic clause handling: use the first clause (split at . , ; ! ?) that holds a keyword.
    const clauses = raw.split(/[.,;!?]+/).map(c => words(sub(normalize(c))).slice(0, MAX_WORDS)).filter(c => c.length);
    const known = c => c.filter(w => this.data.byWord.has(w) && w !== "xnone");
    const clause = clauses.find(c => known(c).length) || words(clean).slice(0, MAX_WORDS);
    const found = [...new Set(known(clause))].map(w => this.data.byWord.get(w))
      .sort((a, b) => b.rank - a.rank || clause.indexOf(a.word) - clause.indexOf(b.word));
    for (const key of found) {
      const out = this.apply(key, clause);
      if (out) { this.last = out; return { text: out, done: false, keyword: key.word }; }
    }
    if (this.memory.length) return { text: this.memory.shift(), done: false, keyword: "memory" };
    return { text: this.pick("xnone", clause, "Please go on."), done: false, keyword: "xnone" };
  }

  pick(word, input, fallback) {
    return this.apply(this.data.byWord.get(word), input) || fallback;
  }
}
