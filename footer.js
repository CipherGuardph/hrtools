(function () {
  const footerText = `Built by Chris Quinto ${new Date().getFullYear()}`;
  const footerClass = "global-footer";

  function ensureStyle() {
    if (document.getElementById("global-footer-style")) return;
    const style = document.createElement("style");
    style.id = "global-footer-style";
    style.textContent = `
      .${footerClass} {
        padding: 18px clamp(18px, 5vw, 64px) 28px;
        text-align: center;
        color: var(--muted, #667168);
        font-size: 0.95rem;
        font-weight: 700;
      }

      .${footerClass} a {
        color: inherit;
        text-decoration: none;
      }
    `;
    document.head.appendChild(style);
  }

  function ensureFooter() {
    ensureStyle();
    let footer = document.querySelector("[data-global-footer]");
    if (!footer) {
      footer = document.createElement("footer");
      footer.setAttribute("data-global-footer", "true");
      footer.className = footerClass;
      document.body.appendChild(footer);
    } else if (!footer.classList.contains(footerClass)) {
      footer.classList.add(footerClass);
    }
    footer.textContent = footerText;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensureFooter, { once: true });
  } else {
    ensureFooter();
  }
})();
