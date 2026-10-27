// ===== OUTILS =====
const root = document.documentElement;
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const rand = (min, max) => Math.random() * (max - min) + min;

// localStorage peut être bloqué (navigation privée...) : on protège avec try/catch
const store = {
  get(key) { try { return localStorage.getItem(key); } catch (e) { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch (e) {} },
};

// fonctions à rappeler quand la langue change (fenêtre projet, etc.)
const langListeners = [];

document.getElementById("year").textContent = new Date().getFullYear();


// ===== 1. INTRO : SIDOU s'assemble =====
const intro = document.getElementById("intro");
const letters = document.querySelectorAll("#introName span:not(.intro-dot)");

// chaque lettre part d'une position et d'une rotation aléatoires
letters.forEach((letter, i) => {
  letter.style.setProperty("--x", rand(-60, 60) + "vw");
  letter.style.setProperty("--y", rand(-50, 50) + "vh");
  letter.style.setProperty("--rx", rand(-180, 180) + "deg");
  letter.style.setProperty("--rz", rand(-120, 120) + "deg");
  letter.style.setProperty("--d", (0.15 + i * 0.12) + "s");
});

let introFinished = false;

function finishIntro() {
  if (introFinished) return;
  introFinished = true;
  intro.classList.add("is-done");
  document.body.classList.remove("is-loading");
  document.body.classList.add("is-ready");
  particles.assemble();
}

intro.addEventListener("click", finishIntro);
setTimeout(finishIntro, reduceMotion ? 0 : 3000);


// ===== 2. PARTICULES : la photo du hacker en points =====
const particles = (() => {
  const canvas = document.getElementById("particles");
  const ctx = canvas.getContext("2d");
  const hero = canvas.parentElement;
  const isTouch = window.matchMedia("(hover: none)").matches;

  let width = 0, height = 0;
  let points = [];          // { x, y, tx, ty, vx, vy, lum, isBlue, r, g, b, a, phase }
  let imageData = null;
  let assembled = false;
  let running = false;
  let heroVisible = true;
  let light = root.dataset.theme === "light";
  const mouse = { x: -9999, y: -9999 };

  const img = new Image();
  img.src = HACKER_IMG;

  // couleur d'un point selon le thème
  function colorize(p) {
    if (p.isBlue) {
      // logo : bleu lumineux la nuit, bleu franc le jour
      if (light) { p.r = 10; p.g = 108; p.b = 255; p.a = 1; }
      else { p.r = 30; p.g = 170 + p.g0 * 85; p.b = 255; p.a = 1; }
    } else if (light) {
      // capuche le jour : bleu nuit
      p.r = 20; p.g = 36; p.b = 64; p.a = Math.min(1, p.strength * 0.9 + 0.3);
    } else {
      // capuche la nuit : argent légèrement bleuté
      const l = Math.min(255, p.lum * 1.15);
      p.r = l * 0.78; p.g = l * 0.88; p.b = l; p.a = Math.min(1, p.strength + 0.25);
    }
  }

  // lit les pixels de la photo et crée un point pour chaque pixel "visible"
  function build() {
    // onglet ouvert en arrière-plan : la page mesure 0, on réessaiera au prochain redimensionnement
    if (!hero.clientWidth || !hero.clientHeight) return;
    width = canvas.width = hero.clientWidth;
    height = canvas.height = hero.clientHeight;
    imageData = ctx.createImageData(width, height);

    const off = document.createElement("canvas");
    off.width = img.width;
    off.height = img.height;
    const offCtx = off.getContext("2d");
    offCtx.drawImage(img, 0, 0);
    const data = offCtx.getImageData(0, 0, img.width, img.height).data;

    // taille de la photo à l'écran : grande, centrée, un peu au-dessus du titre
    const scale = Math.min((height * 0.8) / img.height, (width * 0.92) / img.width);
    const offsetX = (width - img.width * scale) / 2;
    // sur téléphone, on centre la photo dans l'espace au-dessus du titre
    const contentTop = hero.querySelector(".hero-content").offsetTop;
    const offsetY = Math.max(height * 0.06, contentTop / 2 + 40 - (img.height * scale) / 2);

    // écart entre deux points à l'écran (~3.5px), un peu plus sur téléphone pour rester fluide
    const step = Math.max(1, Math.round((isTouch ? 4 : 3.5) / scale));
    const bgLum = data[0] * 0.3 + data[1] * 0.59 + data[2] * 0.11;

    const newPoints = [];
    for (let y = 0; y < img.height; y += step) {
      for (let x = 0; x < img.width; x += step) {
        const i = (y * img.width + x) * 4;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const lum = r * 0.3 + g * 0.59 + b * 0.11;
        const isBlue = b > r + 50;

        // on ignore le fond et le noir du visage
        if (!isBlue && lum < bgLum + 22) continue;

        const p = {
          tx: offsetX + x * scale,
          ty: offsetY + y * scale,
          vx: 0, vy: 0,
          lum, isBlue,
          g0: g / 255,
          strength: (lum - bgLum) / 120,
          phase: rand(0, Math.PI * 2),
        };
        colorize(p);

        // départ : éparpillé partout, ou directement en place
        p.x = assembled || reduceMotion ? p.tx : rand(0, width);
        p.y = assembled || reduceMotion ? p.ty : rand(0, height);
        newPoints.push(p);
      }
    }
    points = newPoints;
  }

  // écrit un carré de 2x2 pixels dans l'image (plus rapide que fillRect)
  function plot(x, y, r, g, b, a) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= width - 1 || y >= height - 1) return;
    const d = imageData.data;
    for (let oy = 0; oy < 2; oy++) {
      let i = ((y + oy) * width + x) * 4;
      for (let ox = 0; ox < 2; ox++, i += 4) {
        if (light) {
          // jour : couleur foncée posée telle quelle
          d[i] = r; d[i + 1] = g; d[i + 2] = b;
          d[i + 3] = Math.max(d[i + 3], 255 * a);
        } else {
          // nuit : on additionne les couleurs, là où les points se superposent ça brille
          d[i] = Math.min(255, d[i] + r * a);
          d[i + 1] = Math.min(255, d[i + 1] + g * a);
          d[i + 2] = Math.min(255, d[i + 2] + b * a);
          d[i + 3] = Math.min(255, d[i + 3] + 255 * a);
        }
      }
    }
  }

  function frame(time) {
    if (!heroVisible) { running = false; return; }
    imageData.data.fill(0);

    const t = time / 1000;
    const pull = assembled ? 0.035 : 0.002;
    const radius = Math.min(120, width * 0.18);

    for (const p of points) {
      // petit mouvement "vivant" autour de la cible
      const tx = p.tx + Math.sin(t * 1.3 + p.phase) * 0.8;
      const ty = p.ty + Math.cos(t * 1.1 + p.phase) * 0.8;

      p.vx += (tx - p.x) * pull;
      p.vy += (ty - p.y) * pull;

      // la souris (ou le doigt) repousse les points
      const dx = p.x - mouse.x, dy = p.y - mouse.y;
      const dist2 = dx * dx + dy * dy;
      if (dist2 < radius * radius) {
        const dist = Math.sqrt(dist2) || 1;
        const force = (1 - dist / radius) * 6;
        p.vx += (dx / dist) * force;
        p.vy += (dy / dist) * force;
      }

      p.vx *= 0.86;
      p.vy *= 0.86;
      p.x += p.vx;
      p.y += p.vy;

      plot(p.x, p.y, p.r, p.g, p.b, p.a);
    }

    ctx.putImageData(imageData, 0, 0);
    requestAnimationFrame(frame);
  }

  function start() {
    if (running || !imageData) return;
    running = true;
    requestAnimationFrame(frame);
  }

  img.onload = () => { build(); start(); };

  // position de la souris / du doigt sur la hero
  function setPointer(e) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
  }
  function clearPointer() { mouse.x = mouse.y = -9999; }

  hero.addEventListener("pointermove", setPointer);
  hero.addEventListener("pointerdown", setPointer);
  hero.addEventListener("pointerleave", clearPointer);
  hero.addEventListener("pointercancel", clearPointer); // le doigt commence à faire défiler
  hero.addEventListener("pointerup", (e) => { if (e.pointerType !== "mouse") clearPointer(); });

  // pause quand la hero n'est plus à l'écran (économise la batterie)
  new IntersectionObserver(([entry]) => {
    heroVisible = entry.isIntersecting;
    if (!heroVisible) return;
    if (!imageData && img.complete) build();
    start();
  }).observe(hero);

  // on recalcule les points si la fenêtre change de taille
  let resizeTimer;
  let lastWidth = window.innerWidth;
  window.addEventListener("resize", () => {
    // sur téléphone, la barre d'adresse change la hauteur : on ignore ce cas
    if (window.innerWidth === lastWidth) return;
    lastWidth = window.innerWidth;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (img.complete) { build(); start(); } }, 150);
  });

  return {
    // les points rejoignent leur place : la photo se forme
    assemble() { assembled = true; },
    // nouvelles couleurs quand on change de thème
    setTheme(isLight) {
      light = isLight;
      points.forEach(colorize);
    },
  };
})();


// ===== 3. THÈME JOUR / NUIT =====
const themeBtn = document.getElementById("themeBtn");
const themeColor = document.querySelector('meta[name="theme-color"]');

function applyTheme(theme) {
  root.dataset.theme = theme;
  themeColor.setAttribute("content", theme === "light" ? "#eef3f9" : "#05070d");
  particles.setTheme(theme === "light");
}

themeBtn.addEventListener("click", () => {
  const next = root.dataset.theme === "light" ? "dark" : "light";
  applyTheme(next);
  store.set("theme", next);
});

applyTheme(root.dataset.theme || "dark");


// ===== 4. LANGUES : FR / EN / AR =====
const langButtons = document.querySelectorAll(".lang-switch button");

function applyLang(lang) {
  const dict = TRANSLATIONS[lang] || TRANSLATIONS.fr;
  root.lang = lang;
  root.dir = lang === "ar" ? "rtl" : "ltr";

  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const text = dict[el.dataset.i18n];
    if (text !== undefined) el.innerHTML = text;
  });
  document.querySelectorAll("[data-i18n-aria]").forEach((el) => {
    el.setAttribute("aria-label", dict[el.dataset.i18nAria]);
  });
  document.querySelectorAll("[data-i18n-ph]").forEach((el) => {
    el.setAttribute("placeholder", dict[el.dataset.i18nPh]);
  });

  langButtons.forEach((b) => {
    const active = b.dataset.lang === lang;
    b.classList.toggle("is-active", active);
    b.setAttribute("aria-pressed", active);
  });

  terminal.setLang(lang);
  langListeners.forEach((fn) => fn(lang));
}

langButtons.forEach((b) => {
  b.addEventListener("click", () => {
    applyLang(b.dataset.lang);
    store.set("lang", b.dataset.lang);
  });
});


// ===== 5. TERMINAL : texte tapé lettre par lettre =====
const terminal = (() => {
  const el = document.getElementById("terminal");
  let lines = [];
  let started = false;
  let timer = null;

  const lineText = (l) => (l[0] === "prompt" ? l[1] : l[1] + l[2]);

  function render(l, count) {
    const full = lineText(l).slice(0, count);
    // les commandes restent de gauche à droite, même en arabe
    if (l[0] === "prompt") return `<span class="t-prompt" dir="ltr">${full}</span>`;
    const key = full.slice(0, l[1].length);
    const value = full.slice(l[1].length);
    return `<span class="t-key">${key}</span>${value}`;
  }

  function showAll() {
    el.innerHTML = lines.map((l) => render(l, lineText(l).length)).join("\n");
  }

  function type() {
    let line = 0, char = 0, html = "";
    function tick() {
      if (line >= lines.length) return;
      const l = lines[line];
      char++;
      el.innerHTML = html + render(l, char);
      if (char >= lineText(l).length) {
        html += render(l, char) + "\n";
        line++;
        char = 0;
        timer = setTimeout(tick, 220);
      } else {
        timer = setTimeout(tick, 22);
      }
    }
    tick();
  }

  // on commence à taper quand le terminal arrive à l'écran
  new IntersectionObserver(([entry], observer) => {
    if (!entry.isIntersecting) return;
    observer.disconnect();
    started = true;
    reduceMotion ? showAll() : type();
  }, { threshold: 0.4 }).observe(el);

  return {
    setLang(lang) {
      lines = TRANSLATIONS[lang].terminal;
      el.dir = lang === "ar" ? "rtl" : "ltr";
      // déjà tapé ? on affiche directement la nouvelle langue
      if (started) { clearTimeout(timer); showAll(); }
    },
  };
})();

applyLang(root.lang in TRANSLATIONS ? root.lang : "fr");


// ===== 6. NAVBAR =====
const nav = document.getElementById("nav");
const burger = document.getElementById("burger");
const navLinks = document.getElementById("navLinks");

window.addEventListener("scroll", () => {
  nav.classList.toggle("is-scrolled", window.scrollY > 20);
}, { passive: true });

function setMenu(open) {
  navLinks.classList.toggle("is-open", open);
  burger.setAttribute("aria-expanded", open);
}

burger.addEventListener("click", () => setMenu(!navLinks.classList.contains("is-open")));
navLinks.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => setMenu(false)));

// fermer le menu en touchant ailleurs, ou avec Échap
document.addEventListener("click", (e) => {
  if (!nav.contains(e.target)) setMenu(false);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") setMenu(false);
});

// le lien de la section visible devient "actif"
const activeObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    navLinks.querySelectorAll("a").forEach((a) => {
      a.classList.toggle("active", a.getAttribute("href") === "#" + entry.target.id);
    });
  });
}, { rootMargin: "-45% 0px -50% 0px" });

document.querySelectorAll("main section[id]").forEach((s) => activeObserver.observe(s));


// ===== 7. APPARITION AU SCROLL =====
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    entry.target.classList.add("is-visible");
    revealObserver.unobserve(entry.target);
  });
}, { threshold: 0.12 });

document.querySelectorAll(".reveal").forEach((el, i) => {
  // petit décalage entre les cartes d'une même grille
  el.style.transitionDelay = (i % 4) * 0.08 + "s";
  revealObserver.observe(el);
});


// ===== 8. HALO BLEU sur les cartes projets =====
document.querySelectorAll(".project").forEach((card) => {
  card.addEventListener("pointermove", (e) => {
    const rect = card.getBoundingClientRect();
    card.style.setProperty("--mx", e.clientX - rect.left + "px");
    card.style.setProperty("--my", e.clientY - rect.top + "px");
  });
});


// ===== 9. FENÊTRE DÉTAIL D'UN PROJET =====
// infos qui ne changent pas avec la langue : captures, lien GitHub, technologies
const PROJECTS = {
  brother: {
    title: "BROTHER",
    url: "mini-restaurant-chi.vercel.app",
    images: ["img/brother-1.jpg", "img/brother-2.jpg", "img/brother-3.jpg"],
    repo: "https://github.com/sidou25/mini-restaurant",
    live: "https://mini-restaurant-chi.vercel.app",
    tags: ["Node.js", "Express", "PostgreSQL", "Sessions", "scrypt", "PWA", "Vercel"],
    badge: "p6.badge",
  },
  hackathon: {
    title: "2MP Industry",
    url: "2MP Industry · CRM & RH",
    images: ["img/hackathon-1.jpg", "img/hackathon-2.jpg", "img/hackathon-3.jpg", "img/hackathon-4.jpg", "img/hackathon-5.jpg", "img/hackathon-6.jpg"],
    repo: "https://github.com/sidou25/Hackathon-2MP-Industry",
    tags: ["HTML", "CSS", "JavaScript", "Chart.js", "localStorage"],
    badge: "p1.badge",
  },
  habit: {
    title: "Habit Tracker",
    url: "habit-tracker-gilt-nu.vercel.app",
    images: ["img/habit-1.jpg", "img/habit-2.jpg", "img/habit-3.jpg"],
    repo: "https://github.com/sidou25/habit-tracker",
    live: "https://habit-tracker-gilt-nu.vercel.app",
    tags: ["Node.js", "Express", "PostgreSQL", "bcrypt", "Vercel", "Neon"],
    badge: "p5.badge",
  },
  gelato: {
    title: "House of Gelato",
    url: "gelato-ten.vercel.app",
    images: ["img/gelato-1.jpg", "img/gelato-2.jpg", "img/gelato-3.jpg", "img/gelato-4.jpg", "img/gelato-5.jpg"],
    repo: "https://github.com/sidou25/GELATO",
    live: "https://gelato-ten.vercel.app",
    tags: ["HTML", "CSS", "JavaScript", "Vercel"],
    badge: "p4.badge",
  },
  pes: {
    title: "PES 2026",
    url: "PES 2026",
    images: ["img/pes-1.jpg", "img/pes-2.jpg"],
    repo: "https://github.com/sidou25/PES-2026",
    tags: ["HTML", "CSS"],
    badge: "p2.badge",
  },
  edt: {
    title: "EDT.COM",
    url: "EDT.COM",
    images: ["img/edt-1.jpg", "img/edt-2.jpg"],
    repo: "https://github.com/sidou25/EDT.COM",
    tags: ["HTML", "CSS", "YouTube"],
    badge: "p3.badge",
  },
};

const projectModal = (() => {
  const modal = document.getElementById("modal");
  const img = document.getElementById("modalImg");
  const thumbs = document.getElementById("modalThumbs");
  const order = Object.keys(PROJECTS);
  let current = null;
  let imageIndex = 0;
  let lastFocus = null;

  const dict = () => TRANSLATIONS[root.lang] || TRANSLATIONS.fr;

  function showImage(i) {
    const p = PROJECTS[current];
    imageIndex = (i + p.images.length) % p.images.length;
    img.classList.add("is-switching");
    setTimeout(() => {
      img.src = p.images[imageIndex];
      img.alt = `${p.title} — ${dict()["modal.shot"]} ${imageIndex + 1}`;
      img.classList.remove("is-switching");
    }, reduceMotion ? 0 : 150);
    thumbs.querySelectorAll("button").forEach((b, j) => b.setAttribute("aria-pressed", j === imageIndex));
  }

  // remplit la fenêtre avec le projet "key" dans la langue actuelle
  function fill(key) {
    current = key;
    const p = PROJECTS[key];
    const d = dict();
    const info = d.details[key];

    document.getElementById("modalTitle").textContent = p.title;
    document.getElementById("modalUrl").textContent = p.url;
    const badge = document.getElementById("modalBadge");
    badge.textContent = d[p.badge];
    badge.classList.toggle("is-award", key === "hackathon");
    badge.classList.toggle("is-live", Boolean(p.live));
    document.getElementById("modalDesc").textContent = info.desc;
    document.getElementById("modalFeatures").innerHTML = info.features.map((f) => `<li>${f}</li>`).join("");
    document.getElementById("modalTags").innerHTML = p.tags.map((t) => `<li>${t}</li>`).join("");
    document.getElementById("modalGithub").href = p.repo;
    // bouton "Voir le site" seulement si le projet est en ligne
    const live = document.getElementById("modalLive");
    live.hidden = !p.live;
    if (p.live) live.href = p.live;

    thumbs.innerHTML = p.images
      .map((src, j) => `<button type="button" aria-label="${d["modal.shot"]} ${j + 1}"><img src="${src}" alt=""></button>`)
      .join("");
    thumbs.querySelectorAll("button").forEach((b, j) => b.addEventListener("click", () => showImage(j)));
    showImage(0);
  }

  function open(key) {
    lastFocus = document.activeElement;
    fill(key);
    modal.showModal();
    document.body.style.overflow = "hidden";
    modal.querySelector(".modal-inner").scrollTop = 0;
  }

  function close() { modal.close(); }

  modal.addEventListener("close", () => {
    document.body.style.overflow = "";
    if (lastFocus) lastFocus.focus();
  });

  document.getElementById("modalClose").addEventListener("click", close);

  // clic sur le fond sombre = fermer
  modal.addEventListener("click", (e) => { if (e.target === modal) close(); });

  document.getElementById("modalNext").addEventListener("click", () => {
    fill(order[(order.indexOf(current) + 1) % order.length]);
    modal.querySelector(".modal-inner").scrollTop = 0;
  });

  // flèches gauche / droite : changer de capture
  modal.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const forward = (e.key === "ArrowRight") !== (root.dir === "rtl");
    showImage(imageIndex + (forward ? 1 : -1));
  });

  // glisser le doigt sur la capture (téléphone)
  let touchX = null;
  img.addEventListener("touchstart", (e) => { touchX = e.touches[0].clientX; }, { passive: true });
  img.addEventListener("touchend", (e) => {
    if (touchX === null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 40) showImage(imageIndex + (dx < 0 ? 1 : -1));
    touchX = null;
  });

  // la langue change pendant que la fenêtre est ouverte
  langListeners.push(() => { if (modal.open) fill(current); });

  return { open };
})();

// ouvrir : clic sur la capture, sur "Détails", ou n'importe où sur la carte (sauf le lien GitHub)
document.querySelectorAll(".project").forEach((card) => {
  card.addEventListener("click", (e) => {
    if (e.target.closest("a")) return;
    projectModal.open(card.dataset.project);
  });
});

// texte alternatif des captures des cartes, dans la bonne langue
langListeners.push((lang) => {
  document.querySelectorAll(".project").forEach((card) => {
    const p = PROJECTS[card.dataset.project];
    card.querySelector(".shot-img img").alt = `${p.title} — ${TRANSLATIONS[lang]["modal.shot"]} 1`;
  });
});
langListeners.at(-1)(root.lang);


// ===== 10. BARRE DE LECTURE + BOUTON RETOUR EN HAUT =====
const progress = document.getElementById("progress");
const toTop = document.getElementById("toTop");
let scrollTicking = false;

window.addEventListener("scroll", () => {
  if (scrollTicking) return;
  scrollTicking = true;
  requestAnimationFrame(() => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    progress.style.transform = `scaleX(${max > 0 ? window.scrollY / max : 0})`;
    toTop.classList.toggle("is-visible", window.scrollY > window.innerHeight * 0.8);
    scrollTicking = false;
  });
}, { passive: true });


// ===== 11. COMPTEURS (0 → 4, 0 → 9) =====
const counterObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    counterObserver.unobserve(entry.target);
    const el = entry.target;
    const to = Number(el.dataset.to);
    if (reduceMotion) { el.textContent = to; return; }
    const start = performance.now();
    const duration = 1200;
    (function step(now) {
      const t = Math.min(1, (now - start) / duration);
      el.textContent = Math.round(to * (1 - Math.pow(1 - t, 3)));
      if (t < 1) requestAnimationFrame(step);
    })(start);
  });
}, { threshold: 0.6 });

document.querySelectorAll(".count").forEach((el) => {
  el.textContent = "0";
  counterObserver.observe(el);
});


// ===== 12. COPIER L'EMAIL =====
const toast = document.getElementById("toast");
let toastTimer;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 2200);
}

document.getElementById("copyEmail").addEventListener("click", async (e) => {
  const email = e.currentTarget.dataset.copy;
  try {
    await navigator.clipboard.writeText(email);
  } catch (err) {
    // ancien navigateur ou page en file:// : on passe par un champ caché
    const field = document.createElement("textarea");
    field.value = email;
    document.body.appendChild(field);
    field.select();
    document.execCommand("copy");
    field.remove();
  }
  showToast((TRANSLATIONS[root.lang] || TRANSLATIONS.fr)["contact.copied"]);
});



// ===== 13. FORMULAIRE DE CONTACT =====
// Les messages sont envoyés par Web3Forms (gratuit) vers dahmanesidahmed60@gmail.com.
// Colle ici la clé reçue par email sur https://web3forms.com (elle peut être publique, c'est prévu pour).
const WEB3FORMS_KEY = "7766a8e3-5efc-4a32-9f93-62e2a2aee5aa";
const CONTACT_EMAIL = "dahmanesidahmed60@gmail.com";
const WHATSAPP_NUMBER = "213780447020"; // 0780447020 au format international (+213, sans le 0)

const contactForm = (() => {
  const form = document.getElementById("contactForm");
  const submit = document.getElementById("cfSubmit");
  const status = document.getElementById("cfStatus");
  const t = (key) => (TRANSLATIONS[root.lang] || TRANSLATIONS.fr)[key];

  // règles de chaque champ : la fonction renvoie la clé du message d'erreur, ou "" si c'est bon
  const rules = {
    cfName: (v) => (v.trim().length < 2 ? "form.errName" : ""),
    cfEmail: (v) => (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) ? "form.errEmail" : ""),
    cfPhone: (v) => {
      const digits = v.replace(/[\s().-]/g, "");
      return /^\+?\d{9,15}$/.test(digits) ? "" : "form.errPhone";
    },
    cfMessage: (v) => (v.trim().length < 10 ? "form.errMessage" : ""),
  };

  function check(id) {
    const input = document.getElementById(id);
    const errKey = rules[id](input.value);
    input.closest(".field").classList.toggle("is-invalid", Boolean(errKey));
    input.setAttribute("aria-invalid", Boolean(errKey));
    document.getElementById(id + "Err").textContent = errKey ? t(errKey) : "";
    return !errKey;
  }

  // on vérifie un champ quand on le quitte, puis à chaque frappe s'il était faux
  Object.keys(rules).forEach((id) => {
    const input = document.getElementById(id);
    input.addEventListener("blur", () => { if (input.value) check(id); });
    input.addEventListener("input", () => {
      if (input.closest(".field").classList.contains("is-invalid")) check(id);
    });
  });

  function setStatus(type, html) {
    status.className = "form-status" + (type ? " is-" + type : "");
    status.innerHTML = html;
  }

  function values() {
    return {
      name: form.elements.name.value.trim(),
      email: form.elements.email.value.trim(),
      whatsapp: form.elements.whatsapp.value.trim(),
      type: form.elements.type.value,
      message: form.elements.message.value.trim(),
    };
  }

  // texte du message, utilisé pour l'email de secours
  function summary(v) {
    return `Nom : ${v.name}\nEmail : ${v.email}\nWhatsApp : ${v.whatsapp}\nType de projet : ${v.type}\n\n${v.message}`;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (form.elements.botcheck.checked) return; // un robot a rempli le piège

    const ok = Object.keys(rules).map(check).every(Boolean);
    if (!ok) {
      form.querySelector(".is-invalid input, .is-invalid textarea").focus();
      return;
    }

    const v = values();

    // clé pas encore configurée : on ouvre l'application email du visiteur avec le message déjà écrit
    if (!WEB3FORMS_KEY) {
      const subject = encodeURIComponent(`Portfolio — ${v.type} — ${v.name}`);
      window.location.href = `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${encodeURIComponent(summary(v))}`;
      setStatus("success", t("form.mailto"));
      return;
    }

    submit.classList.add("is-loading");
    setStatus("", "");
    try {
      const res = await fetch("https://api.web3forms.com/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          access_key: WEB3FORMS_KEY,
          subject: `Portfolio — ${v.type} — ${v.name}`,
          from_name: "Portfolio SIDOU",
          name: v.name,
          email: v.email, // tu pourras répondre directement à cette adresse
          whatsapp: v.whatsapp,
          type_de_projet: v.type,
          message: v.message,
          langue: root.lang,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || res.status);

      form.reset();
      setStatus("success", t("form.success"));
    } catch (err) {
      // problème réseau ou service : on propose WhatsApp et l'email pour ne pas perdre le client
      const wa = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(summary(v))}`;
      setStatus("error", t("form.error")
        .replace("{wa}", wa)
        .replace("{mail}", `mailto:${CONTACT_EMAIL}?body=${encodeURIComponent(summary(v))}`));
    } finally {
      submit.classList.remove("is-loading");
    }
  });

  // messages d'erreur et lien WhatsApp dans la langue choisie
  langListeners.push(() => {
    Object.keys(rules).forEach((id) => {
      if (document.getElementById(id).closest(".field").classList.contains("is-invalid")) check(id);
    });
    document.getElementById("waLink").href = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(t("form.waHello"))}`;
  });
  langListeners.at(-1)();
})();
