import { ElizaEngine } from "./engine.js";

const $ = s => document.querySelector(s);
const stage = $("#stage"), log = $("#conversation"), form = $("#composer"), input = $("#message"), send = $("#send");
const welcome = $("#welcome"), prompts = $("#prompts"), newBtn = $("#new-session"), statusEl = $("#status"), statusText = $("#status-text");
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const touch = matchMedia("(pointer: coarse)").matches;
let engine = null, token = 0, busy = false;

function setStatus(state, text) { statusEl.dataset.state = state; statusText.textContent = text; }
function scrollDown() { stage.scrollTo({ top: stage.scrollHeight, behavior: reduceMotion ? "auto" : "smooth" }); }

function addMessage(text, role, extra = "") {
  const row = document.createElement("article");
  row.className = `msg ${role} ${extra}`.trim();
  const who = document.createElement("span");
  who.className = "who";
  who.textContent = role === "user" ? "You" : "DOCTOR";
  const bubble = document.createElement("p");
  bubble.className = "bubble";
  bubble.textContent = text;
  row.append(who, bubble);
  log.append(row);
  scrollDown();
  return row;
}

function setComposer(enabled, placeholder) {
  input.disabled = !enabled;
  send.disabled = !enabled;
  if (placeholder) input.placeholder = placeholder;
}

function showError(message) {
  engine = null;
  log.replaceChildren();
  welcome.hidden = true;
  setStatus("error", "SCRIPT UNAVAILABLE");
  setComposer(false, "DOCTOR is unavailable.");
  const row = addMessage(`Unable to start DOCTOR: ${message}`, "bot", "error");
  const retry = document.createElement("button");
  retry.type = "button";
  retry.className = "retry";
  retry.textContent = "Try again";
  retry.addEventListener("click", startSession, { once: true });
  row.append(retry);
  retry.focus();
}

async function loadScript() {
  const inline = $("#doctor-script");
  if (inline) return inline.textContent;
  const res = await fetch("./doctor.script", { cache: "no-store" });
  if (!res.ok) throw new Error(`the dialogue script could not be loaded (HTTP ${res.status}). If you opened this file directly, serve the folder over http instead.`);
  return res.text();
}

async function startSession() {
  const mine = ++token;
  busy = false;
  log.replaceChildren();
  welcome.hidden = false;
  setComposer(false, "Loading DOCTOR…");
  setStatus("loading", "LOADING SCRIPT");
  try {
    const source = await loadScript();
    if (mine !== token) return;
    if (!engine) engine = new ElizaEngine(source);
    else engine.reset();
    setStatus("ready", "SCRIPT ACTIVE");
    setComposer(true, "Write what's on your mind…");
    addMessage(engine.greeting, "bot");
    if (!touch) input.focus();
  } catch (error) {
    if (mine === token) showError(error.message || String(error));
  }
}

function submitMessage(value) {
  const message = String(value).trim();
  if (!message || !engine || engine.closed || busy) return;
  busy = true;
  welcome.hidden = true;
  addMessage(message, "user");
  input.value = "";
  autosize();
  const mine = token;
  let result;
  try { result = engine.respond(message); }
  catch (error) { console.error(error); result = { text: "I'm sorry, something went wrong in my thinking. Please go on.", done: false }; }
  const typing = addMessage("…", "bot", "typing");
  setTimeout(() => {
    if (mine !== token) return;
    typing.remove();
    addMessage(result.text, "bot");
    busy = false;
    if (result.done) {
      setStatus("ended", "SESSION ENDED");
      setComposer(false, "Session ended. Start a new session to continue.");
      newBtn.focus();
    } else input.focus();
  }, reduceMotion ? 0 : Math.min(300 + result.text.length * 12, 1000));
}

function autosize() {
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 140) + "px";
}

form.addEventListener("submit", e => { e.preventDefault(); submitMessage(input.value); });
input.addEventListener("input", autosize);
input.addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); }
});
prompts.addEventListener("click", e => {
  const b = e.target.closest("button[data-prompt]");
  if (b) submitMessage(b.dataset.prompt);
});
newBtn.addEventListener("click", startSession);

startSession();
