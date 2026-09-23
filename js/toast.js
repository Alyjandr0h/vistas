// The little message that pops up at the bottom ("Saved to your Gallery").

let hideTimer = 0;

export function toast(message, ms = 2600) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => el.classList.remove('show'), ms);
}
