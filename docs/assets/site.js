document.querySelectorAll('[data-year]').forEach((element) => {
  element.textContent = String(new Date().getFullYear());
});

// Keep analytics separate from page behavior: a blocked tag must never break downloads.
if (document.currentScript) {
  import(new URL('./analytics.js', document.currentScript.src).href).catch(() => {});
}
