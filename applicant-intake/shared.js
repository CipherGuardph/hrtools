(function () {
  const state = {
    firebaseApp: null,
    firebaseReady: false,
    firebaseModules: null,
    qrReady: false,
  };

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[data-src="${src}"]`);
      if (existing) {
        if (existing.dataset.loaded === "true") {
          resolve();
          return;
        }
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener("error", () => reject(new Error(`Failed to load ${src}`)), { once: true });
        return;
      }
      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.dataset.src = src;
      script.addEventListener("load", () => {
        script.dataset.loaded = "true";
        resolve();
      }, { once: true });
      script.addEventListener("error", () => reject(new Error(`Failed to load ${src}`)), { once: true });
      document.head.appendChild(script);
    });
  }

  function slugify(value) {
    return String(value || "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "job";
  }

  function uid(prefix = "id") {
    const rand = Math.random().toString(36).slice(2, 10);
    return `${prefix}-${Date.now().toString(36)}-${rand}`;
  }

  function formatBytes(bytes) {
    if (!bytes) return "0 KB";
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function getFirebaseConfig() {
    return (
      window.__APPLICANT_INTAKE_FIREBASE_CONFIG__
      || readJson("hrtools_applicant_intake_firebase_config", null)
      || null
    );
  }

  function saveFirebaseConfig(config) {
    const next = { ...(config || {}) };
    window.__APPLICANT_INTAKE_FIREBASE_CONFIG__ = next;
    writeJson("hrtools_applicant_intake_firebase_config", next);
  }

  function getDemoDb() {
    const fallback = {
      jobs: [
      {
          id: "job-demo-cashier",
          title: "Cashier",
          slug: "cashier",
          description: "Serve customers at checkout, scan items accurately, handle cash and card payments, and support store operations during busy hours.",
          requiredSkills: "Cash handling, POS system, customer service, inventory awareness, basic math",
          experienceNeeded: "1+ years",
          qrUrl: "/applicant-intake/apply/?job=cashier",
          createdAt: new Date().toISOString(),
      },
      ],
      candidates: [
        {
          id: "cand-demo-1",
          jobSlug: "cashier",
          fullName: "Mika Reyes",
          email: "mika.reyes@example.com",
          phone: "+63 917 222 0198",
          skills: "Cash handling, POS system, customer service",
          education: "Senior High School",
          experience: "2 years",
          previousRoles: "Cashier, Retail Associate",
          resumeName: "mika-reyes-resume.pdf",
          aiSummary: "Reliable cashier profile with retail checkout and customer service experience.",
          matchScore: 94,
          rating: 5,
          comments: "Schedule technical interview",
          status: "new",
          createdAt: new Date().toISOString(),
        },
      ],
    };

    fallback.jobs = fallback.jobs.map(job => ({
      ...job,
      qrUrl: `${getPublicBaseUrl()}/apply/?job=${job.slug}`,
    }));

    const stored = readJson("hrtools_applicant_intake_demo", null);
    if (!stored || !Array.isArray(stored.jobs) || !stored.jobs.length) {
      return fallback;
    }

    const hasCashier = stored.jobs.some(job => job && job.slug === "cashier");
    if (hasCashier) {
      return {
        jobs: (stored.jobs || []).map(job => ({
          ...job,
          qrUrl: `${getPublicBaseUrl()}/apply/?job=${job.slug}`,
        })),
        candidates: stored.candidates || [],
      };
    }

    const migrated = {
      jobs: fallback.jobs,
      candidates: (stored.candidates || []).map(candidate => ({
        ...candidate,
        jobSlug: "cashier",
      })),
    };
    saveDemoDb(migrated);
    return migrated;
  }

  function getPublicBaseUrl() {
    const configured = window.__APPLICANT_INTAKE_BASE_URL__;
    if (configured) {
      return String(configured).replace(/\/$/, "");
    }
    if (window.location.protocol === "file:") {
      const match = window.location.href.match(/^(.*\/applicant-intake\/)/i);
      if (match) {
        return match[1].replace(/\/$/, "");
      }
    }
    return new URL("/applicant-intake/", window.location.origin).toString().replace(/\/$/, "");
  }

  function saveDemoDb(db) {
    writeJson("hrtools_applicant_intake_demo", db);
  }

  async function loadFirebaseSDK(options = {}) {
    if (state.firebaseModules) return state.firebaseModules;
    await loadScript("https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js");
    await loadScript("https://www.gstatic.com/firebasejs/10.12.5/firebase-auth-compat.js");
    if (options.useDatabase !== false) {
      await loadScript("https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore-compat.js");
      await loadScript("https://www.gstatic.com/firebasejs/10.12.5/firebase-storage-compat.js");
    }
    state.firebaseModules = {
      firebase: window.firebase,
    };
    return state.firebaseModules;
  }

  async function connectFirebase(config, options = {}) {
    const cfg = { ...(window.__FIREBASE_CONFIG__ || {}), ...(config || {}) };
    if (!cfg.apiKey || !cfg.projectId || !cfg.appId) {
      throw new Error("Firebase config needs apiKey, projectId, and appId.");
    }
    await loadFirebaseSDK(options);
    if (!state.firebaseApp) {
      state.firebaseApp = window.firebase.initializeApp(cfg);
      state.firebaseReady = true;
    }
    const auth = window.firebase.auth();
    const result = {
      app: state.firebaseApp,
      firebase: window.firebase,
      auth,
    };
    if (options.useDatabase !== false) {
      result.db = window.firebase.firestore();
      result.storage = window.firebase.storage();
    }
    return result;
  }

  async function renderQr(container, text) {
    if (!container) return;
    container.innerHTML = "";
    const value = String(text || "");
    try {
      await loadScript("https://cdnjs.cloudflare.com/ajax/libs/qrcode/1.5.3/qrcode.min.js");
      if (window.QRCode && typeof window.QRCode.toCanvas === "function") {
        const canvas = document.createElement("canvas");
        canvas.width = 240;
        canvas.height = 240;
        container.appendChild(canvas);
        await new Promise((resolve, reject) => {
          window.QRCode.toCanvas(canvas, value, {
            width: 240,
            margin: 1,
            color: {
              dark: "#17211b",
              light: "#ffffff",
            },
          }, error => (error ? reject(error) : resolve()));
        });
        state.qrReady = true;
        return;
      }
    } catch {
      // fall through to the image fallback below
    }
    const fallbackUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(value)}`;
    const img = document.createElement("img");
    img.alt = "QR code";
    img.width = 240;
    img.height = 240;
    img.src = fallbackUrl;
    img.style.width = "240px";
    img.style.height = "240px";
    img.style.display = "block";
    container.appendChild(img);
    state.qrReady = true;
  }

  window.IntakeShared = {
    connectFirebase,
    getDemoDb,
    saveDemoDb,
    getFirebaseConfig,
    saveFirebaseConfig,
    getPublicBaseUrl,
    slugify,
    uid,
    formatBytes,
    renderQr,
    readJson,
    writeJson,
    state,
  };
})();
