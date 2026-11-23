const DEFAULTS = { side: "left", background: true, bottom: 10, maxMessages: 8, underControls: true };

const bg = document.getElementById("background");
const bottom = document.getElementById("bottom");
const bottomVal = document.getElementById("bottomVal");
const maxMsg = document.getElementById("maxMessages");
const maxVal = document.getElementById("maxVal");
const under = document.getElementById("underControls");
const sideRadios = document.querySelectorAll('input[name="side"]');

function save() {
  const side = [...sideRadios].find((r) => r.checked)?.value || "left";
  chrome.storage.sync.set({
    side,
    background: bg.checked,
    bottom: Number(bottom.value),
    maxMessages: Number(maxMsg.value),
    underControls: under.checked,
  });
}

chrome.storage.sync.get(DEFAULTS, (s) => {
  sideRadios.forEach((r) => (r.checked = r.value === s.side));
  bg.checked = s.background;
  bottom.value = s.bottom;
  bottomVal.textContent = s.bottom + " px";
  maxMsg.value = s.maxMessages;
  maxVal.textContent = s.maxMessages;
  under.checked = s.underControls;
});

sideRadios.forEach((r) => r.addEventListener("change", save));
bg.addEventListener("change", save);
bottom.addEventListener("input", () => {
  bottomVal.textContent = bottom.value + " px";
  save();
});
maxMsg.addEventListener("input", () => {
  maxVal.textContent = maxMsg.value;
  save();
});
under.addEventListener("change", save);

if (window.parent !== window) {
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" ||
        (event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && event.code === "KeyV")) {
      event.preventDefault();
      window.parent.postMessage({ type: "tfc-close-settings" }, "*");
    }
  }, true);
}
