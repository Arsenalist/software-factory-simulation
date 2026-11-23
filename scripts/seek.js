// Dev aid for screenshots: window.sfSeek(hours, pause) moves the floor's scrubber.
window.sfSeek = (t, pause = true) => {
  const r = document.querySelector('.sf-scrub input');
  r.value = String(t); r.dispatchEvent(new Event('input', { bubbles: true }));
  const b = document.querySelector('.sf-play .sf-btn');
  if (pause && b.textContent === 'Pause') b.click();
};
