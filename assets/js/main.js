/* Pliage PJL — interactions du site (aucune dépendance) */
(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const root = document.documentElement;

  /* ------------------------------------------------------------------ *
   * En-tête et menu mobile
   * ------------------------------------------------------------------ */
  const header = $('#entete');
  const burger = $('.burger');
  const nav = $('#menu');

  const setMenu = (open) => {
    root.classList.toggle('menu-open', open);
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Fermer le menu' : 'Ouvrir le menu');
    updateDock();
  };
  burger.addEventListener('click', () => setMenu(!root.classList.contains('menu-open')));
  nav.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });
  window.matchMedia('(min-width: 901px)').addEventListener('change', () => setMenu(false));

  /* Lien actif dans la navigation */
  const navLinks = new Map($$('.nav__list a').map((a) => [a.getAttribute('href').slice(1), a]));
  const spy = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      navLinks.forEach((a) => a.classList.remove('is-current'));
      const link = navLinks.get(entry.target.id);   // aucun lien pour l'accueil : rien n'est souligné
      if (link) link.classList.add('is-current');
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  ['accueil', ...navLinks.keys()].forEach((id) => { const s = document.getElementById(id); if (s) spy.observe(s); });

  /* ------------------------------------------------------------------ *
   * Barre d'action mobile (Appeler / Estimation)
   * ------------------------------------------------------------------ */
  const dock = $('#dock');
  const contact = $('#contact');
  let contactVisible = false;

  function updateDock() {
    if (!dock) return;
    const on = window.scrollY > window.innerHeight * 0.6 && !contactVisible && !root.classList.contains('menu-open');
    dock.classList.toggle('is-on', on);
    dock.setAttribute('aria-hidden', String(!on));
    $$('a', dock).forEach((a) => { a.tabIndex = on ? 0 : -1; });
  }
  if (contact) {
    new IntersectionObserver(([entry]) => { contactVisible = entry.isIntersecting; updateDock(); }, { threshold: 0.05 }).observe(contact);
  }

  /* ------------------------------------------------------------------ *
   * La photo pliée : 4 panneaux en accordéon, comme une tôle sur la plieuse.
   * Elle se déplie au chargement, puis se replie à mesure qu'on défile.
   * ------------------------------------------------------------------ */
  const fold = $('#fold');
  let kickFold = () => {};

  if (fold) {
    const panels = $$('.fold__panel', fold);
    const count = panels.length;
    const readout = $('#foldAngle');
    const REST = 9;     // angle au repos (degrés)
    const MAX = 64;     // angle une fois l'accueil défilé
    const START = 72;   // angle de départ, avant de se déplier
    const HOVER = 11;   // petit pli de plus au survol

    let angle = reduceMotion ? REST : START;
    let hover = 0;
    let frame = 0;
    let running = false;

    const render = (deg) => {
      const rad = (deg * Math.PI) / 180;
      const cos = Math.cos(rad);
      const w = 100 / count;                 // largeur d'un panneau, en % du cadre
      const offset = (100 - 100 * cos) / 2;  // pour garder la tôle centrée en se repliant
      panels.forEach((panel, i) => {
        if (i % 2 === 0) {                   // charnière à gauche, le bord droit recule
          panel.style.left = `${offset + i * w * cos}%`;
          panel.style.transformOrigin = '0 50%';
          panel.style.transform = `rotateY(${deg}deg)`;
        } else {                             // charnière à droite, le bord gauche recule
          panel.style.left = `${offset + (i + 1) * w * cos - w}%`;
          panel.style.transformOrigin = '100% 50%';
          panel.style.transform = `rotateY(${-deg}deg)`;
        }
      });
      fold.style.setProperty('--shade', Math.sin(rad).toFixed(3));
      if (readout) readout.textContent = `${String(Math.round(deg)).padStart(2, '0')}°`;
    };

    // À plat tant que la photo est bien en vue; elle se replie en quittant l'écran par le haut.
    const targetAngle = () => {
      const rect = fold.getBoundingClientRect();
      const p = clamp((window.innerHeight * 0.2 - rect.top) / (rect.height * 0.9), 0, 1);
      const eased = p * p * (3 - 2 * p);
      return REST + (MAX - REST) * eased + hover * (1 - eased);
    };

    let last = 0;
    const tick = (now) => {
      frame = 0;
      // Lissage basé sur le temps : même vitesse à 60 Hz, 120 Hz ou sur un écran lent
      const dt = last ? Math.min(now - last, 250) : 16.7;
      last = now;
      const target = targetAngle();
      angle += (target - angle) * (1 - Math.exp(-dt / 190));
      if (Math.abs(target - angle) < 0.05) angle = target;
      render(angle);
      if (angle !== target) frame = requestAnimationFrame(tick);
      else last = 0;
    };

    kickFold = () => { if (running && !frame) frame = requestAnimationFrame(tick); };

    render(angle);

    // Le dépliage démarre quand la photo est chargée ET visible (sur mobile, elle est plus bas)
    let loaded = false;
    let seen = false;
    const maybeStart = () => {
      if (!loaded) return;
      fold.classList.add('is-ready');
      if (reduceMotion || !seen || running) return;
      window.setTimeout(() => { running = true; kickFold(); }, 250);
    };
    const markLoaded = () => { loaded = true; maybeStart(); };

    const bg = getComputedStyle(panels[0]).backgroundImage;
    const match = /url\(["']?(.+?)["']?\)/.exec(bg);
    if (match) {
      const img = new Image();
      img.onload = img.onerror = markLoaded;
      img.src = match[1];
      window.setTimeout(markLoaded, 2500); // filet de sécurité
    } else {
      markLoaded();
    }

    const seer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      seen = true;
      seer.disconnect();
      maybeStart();
    }, { threshold: 0.3 });
    seer.observe(fold);

    if (!reduceMotion) {
      const zone = fold.parentElement;
      zone.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') { hover = HOVER; kickFold(); } });
      zone.addEventListener('pointerleave', () => { hover = 0; kickFold(); });
    }
  }

  /* ------------------------------------------------------------------ *
   * Défilement : en-tête, barre mobile, photo pliée
   * ------------------------------------------------------------------ */
  const onScroll = () => {
    header.classList.toggle('is-stuck', window.scrollY > 16);
    updateDock();
    kickFold();
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  onScroll();

  /* ------------------------------------------------------------------ *
   * Apparition des éléments
   * ------------------------------------------------------------------ */
  const revealer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-in');
      revealer.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -7% 0px', threshold: 0.1 });
  $$('.reveal, .tile').forEach((el) => revealer.observe(el));

  /* ------------------------------------------------------------------ *
   * Comparateurs Avant / Après
   * ------------------------------------------------------------------ */
  $$('.ba__frame').forEach((frameEl) => {
    const range = $('.ba__range', frameEl);
    let dragging = false;
    let touched = false;
    let startX = 0;
    let startY = 0;

    const set = (value, fromRange = false) => {
      const v = clamp(value, 0, 100);
      frameEl.style.setProperty('--pos', `${v}%`);
      frameEl.classList.toggle('at-start', v < 16);
      frameEl.classList.toggle('at-end', v > 84);
      if (!fromRange) range.value = String(v);
    };
    const fromPointer = (e) => {
      const rect = frameEl.getBoundingClientRect();
      set(((e.clientX - rect.left) / rect.width) * 100);
    };

    frameEl.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      dragging = true;
      touched = true;
      startX = e.clientX;
      startY = e.clientY;
      frameEl.classList.add('is-drag');
      try { frameEl.setPointerCapture(e.pointerId); } catch (err) { /* sans capture, on continue */ }
      if (e.pointerType === 'mouse') { e.preventDefault(); fromPointer(e); }
    });
    frameEl.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      // Au doigt : on ne bouge que si le geste est horizontal (le vertical fait défiler la page)
      if (e.pointerType !== 'mouse' && Math.abs(e.clientX - startX) < Math.abs(e.clientY - startY)) return;
      fromPointer(e);
    });
    const stop = () => { dragging = false; frameEl.classList.remove('is-drag'); };
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((type) => frameEl.addEventListener(type, stop));
    range.addEventListener('input', () => { touched = true; set(Number(range.value), true); });

    // Petit va-et-vient à la première apparition, pour montrer que ça se glisse
    if (!reduceMotion) {
      const hint = new IntersectionObserver(([entry]) => {
        if (!entry.isIntersecting) return;
        hint.disconnect();
        const keys = [50, 66, 36, 50];
        const duration = 1900;
        const t0 = performance.now() + 450;
        const step = (now) => {
          if (touched) return;
          const t = clamp((now - t0) / duration, 0, 1);
          const seg = Math.min(keys.length - 2, Math.floor(t * (keys.length - 1)));
          const local = t * (keys.length - 1) - seg;
          const ease = local * local * (3 - 2 * local);
          set(keys[seg] + (keys[seg + 1] - keys[seg]) * ease);
          if (t < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }, { threshold: 0.55 });
      hint.observe(frameEl);
    }
  });

  /* ------------------------------------------------------------------ *
   * Réalisations : filtres et visionneuse
   * ------------------------------------------------------------------ */
  const gallery = $('#galerie');
  const tiles = gallery ? $$('.tile', gallery) : [];
  const chips = $$('.chip');

  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      if (chip.classList.contains('is-on')) return;
      const filter = chip.dataset.filter;
      chips.forEach((c) => {
        const on = c === chip;
        c.classList.toggle('is-on', on);
        c.setAttribute('aria-pressed', String(on));
      });
      const apply = () => {
        tiles.forEach((tile) => {
          const show = filter === 'tout' || tile.dataset.cat.split(' ').includes(filter);
          tile.hidden = !show;
          if (show) tile.classList.add('is-in');
        });
        gallery.classList.remove('is-switching');
      };
      if (reduceMotion) { apply(); return; }
      gallery.classList.add('is-switching');
      window.setTimeout(apply, 240);
    });
  });

  const lb = $('#visionneuse');
  if (lb && gallery && typeof lb.showModal === 'function') {
    const lbImg = $('.lb__img', lb);
    const lbFig = $('.lb__fig', lb);
    const lbCount = $('.lb__count', lb);
    const lbLabel = $('.lb__label', lb);
    const lbTitle = $('.lb__title', lb);
    let list = [];
    let index = 0;
    let opener = null;
    const pad = (n) => String(n).padStart(2, '0');

    // Dimensionne l'image à sa taille finale tout de suite : la vignette sert d'aperçu,
    // puis la grande photo la remplace sans que rien ne bouge.
    const fit = () => {
      const tile = list[index];
      if (!tile) return;
      const thumb = $('img', tile);
      const ratio = Number(thumb.getAttribute('width')) / Number(thumb.getAttribute('height'));
      const natural = Number((/-(\d+)\.webp$/.exec(tile.getAttribute('href')) || [])[1]) || 1600;
      const maxW = lbFig.clientWidth;
      const maxH = window.innerHeight - (window.innerWidth <= 760 ? 200 : 124);
      const w = Math.max(120, Math.min(maxW, maxH * ratio, natural));
      lbImg.style.width = `${Math.round(w)}px`;
      lbImg.style.height = `${Math.round(w / ratio)}px`;
    };

    const show = (i) => {
      index = (i + list.length) % list.length;
      const tile = list[index];
      const thumb = $('img', tile);
      lbCount.textContent = `${pad(index + 1)} / ${pad(list.length)}`;
      lbLabel.textContent = tile.dataset.label || '';
      lbTitle.textContent = tile.dataset.title || '';
      lbImg.alt = thumb.alt;
      lbImg.src = thumb.currentSrc || thumb.src;
      lbImg.classList.add('is-loading');
      fit();
      const full = new Image();
      const wanted = index;
      full.onload = () => {
        if (wanted !== index) return;
        lbImg.src = full.src;
        lbImg.classList.remove('is-loading');
      };
      full.src = tile.href;
      const next = list[(index + 1) % list.length];
      if (next) { new Image().src = next.href; }
    };

    gallery.addEventListener('click', (e) => {
      const tile = e.target.closest('.tile');
      if (!tile) return;
      e.preventDefault();
      opener = tile;
      list = tiles.filter((t) => !t.hidden);
      index = list.indexOf(tile);
      lb.showModal();
      show(index);
    });
    window.addEventListener('resize', () => { if (lb.open) fit(); });

    $('.lb__close', lb).addEventListener('click', () => lb.close());
    $('.lb__prev', lb).addEventListener('click', () => show(index - 1));
    $('.lb__next', lb).addEventListener('click', () => show(index + 1));
    lb.addEventListener('click', (e) => { if (e.target === lb || e.target.classList.contains('lb__fig')) lb.close(); });
    lb.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') show(index - 1);
      if (e.key === 'ArrowRight') show(index + 1);
    });
    lb.addEventListener('close', () => { if (opener) opener.focus({ preventScroll: true }); });

    // Balayage au doigt
    let swipeX = null;
    lb.addEventListener('pointerdown', (e) => { swipeX = e.pointerType === 'mouse' ? null : e.clientX; });
    lb.addEventListener('pointerup', (e) => {
      if (swipeX === null) return;
      const dx = e.clientX - swipeX;
      swipeX = null;
      if (Math.abs(dx) > 48) show(index + (dx < 0 ? 1 : -1));
    });
  }

  /* ------------------------------------------------------------------ *
   * Méthode : la ligne pliée, tracée à la bonne largeur
   * ------------------------------------------------------------------ */
  const steps = $('.steps');
  if (steps && 'ResizeObserver' in window) {
    const svg = $('.steps__line', steps);
    const path = $('path', svg);
    const draw = () => {
      const w = steps.clientWidth;
      if (!w) return;
      const h = 64;
      const hi = h * 0.2;
      const lo = h * 0.8;
      const x = (f) => (w * f).toFixed(1);
      svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
      path.setAttribute('d', `M0 ${hi}H${x(0.21)}L${x(0.25)} ${lo}H${x(0.46)}L${x(0.5)} ${hi}H${x(0.71)}L${x(0.75)} ${lo}H${w}`);
    };
    new ResizeObserver(draw).observe(steps);
    draw();
  }

  /* ------------------------------------------------------------------ *
   * Formulaire : prépare un courriel dans l'application du visiteur
   * ------------------------------------------------------------------ */
  const form = $('#formulaire');
  if (form) {
    const status = $('#formStatus');
    const copyBtn = $('#copyMsg');
    const EMAIL = 'pliagepjl@hotmail.com';
    let lastMessage = '';

    form.addEventListener('input', (e) => e.target.classList && e.target.classList.remove('is-invalid'));

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const f = form.elements;
      const nom = f.nom.value.trim();
      const tel = f.telephone.value.trim();
      const ville = f.ville.value.trim();
      const message = f.message.value.trim();
      const travaux = $$('input[name="travaux"]:checked', form).map((i) => i.value);

      const missing = [f.nom, f.telephone].filter((input) => !input.value.trim());
      [f.nom, f.telephone].forEach((input) => input.classList.toggle('is-invalid', missing.includes(input)));
      if (missing.length) { missing[0].focus(); return; }

      const lines = ['Bonjour,', '', "J'aimerais obtenir une estimation.", '', `Nom : ${nom}`, `Téléphone : ${tel}`];
      if (ville) lines.push(`Ville : ${ville}`);
      if (travaux.length) lines.push(`Type de travaux : ${travaux.join(', ')}`);
      if (message) lines.push('', 'Mon projet :', message);
      lines.push('', 'Merci !');

      lastMessage = lines.join('\n');
      const subject = `Demande d'estimation — ${nom}`;
      status.hidden = false;
      window.location.href = `mailto:${EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lastMessage)}`;
    });

    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(lastMessage);
        copyBtn.textContent = 'Message copié';
      } catch (err) {
        copyBtn.textContent = 'Copie impossible — écrivez-nous directement';
      }
    });
  }

  /* Année du pied de page */
  const year = $('#annee');
  if (year) year.textContent = String(new Date().getFullYear());
})();
