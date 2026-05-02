(function () {
  const footerText = `Built by <a href="https://cipherguardph.com/" target="_blank" rel="noopener noreferrer">cipherguardph.com</a> | C. Quinto SaaS, CySec, AICo, MSPau 2026`;
  const footerClass = "global-footer";
  const versionClass = "global-footer-version";
  const versionText = "V1.0";

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

      .${versionClass} {
        padding: 0 18px 28px;
        text-align: center;
        color: var(--muted, #667168);
        font-size: 0.82rem;
        font-weight: 700;
        letter-spacing: 0.08em;
      }
    `;
    document.head.appendChild(style);
  }

  function ensureVersionLine() {
    let versionLine = document.querySelector("[data-global-footer-version], .version-line");
    if (!versionLine) {
      versionLine = document.createElement("div");
      versionLine.setAttribute("data-global-footer-version", "true");
      versionLine.className = versionClass;
      versionLine.textContent = versionText;
      document.body.appendChild(versionLine);
    }
    if (!versionLine.classList.contains(versionClass)) {
      versionLine.classList.add(versionClass);
    }
    versionLine.textContent = versionText;
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
    footer.innerHTML = footerText;
    ensureVersionLine();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensureFooter, { once: true });
  } else {
    ensureFooter();
  }
})();
