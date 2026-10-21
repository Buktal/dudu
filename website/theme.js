// Apply the saved or system theme before the stylesheet paints the page.
(() => {
  const key = "dudu-theme";
  const system = matchMedia("(prefers-color-scheme: dark)");
  const en = document.documentElement.lang === "en";
  let saved;
  try { saved = localStorage.getItem(key); } catch { /* Storage may be disabled. */ }
  let explicit = saved === "dark" || saved === "light";

  function apply(theme) {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]').content = theme === "dark" ? "#0b151e" : "#ffffff";
    const button = document.getElementById("theme-toggle");
    if (button) {
      const label = theme === "dark"
        ? (en ? "Switch to light theme" : "切换到明亮主题")
        : (en ? "Switch to dark theme" : "切换到暗黑主题");
      button.setAttribute("aria-label", label);
      button.title = label;
      button.hidden = false;
    }
    window.dispatchEvent(new Event("dudu-theme-change"));
  }

  apply(explicit ? saved : system.matches ? "dark" : "light");
  system.addEventListener("change", event => {
    if (!explicit) apply(event.matches ? "dark" : "light");
  });
  document.addEventListener("DOMContentLoaded", () => {
    apply(document.documentElement.dataset.theme);
    document.getElementById("theme-toggle").addEventListener("click", () => {
      const theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      explicit = true;
      try { localStorage.setItem(key, theme); } catch { /* The current page still switches. */ }
      apply(theme);
    });
  });
})();
