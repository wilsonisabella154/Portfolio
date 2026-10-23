(() => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (!window.gsap || reduceMotion) {
    document.querySelectorAll('[data-reveal], [data-hero]').forEach((el) => { el.style.opacity = 1; });
  } else {
    gsap.registerPlugin(ScrollTrigger);

    gsap.fromTo('[data-hero]', { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.9, stagger: 0.1, ease: 'power3.out' });

    ScrollTrigger.batch('[data-reveal]', {
      start: 'top 92%',
      once: true,
      onEnter: (els) => gsap.fromTo(els, { opacity: 0, y: 28 }, {
        opacity: 1, y: 0, duration: 0.8, ease: 'power3.out', stagger: 0.08, overwrite: true,
      }),
    });

    setTimeout(() => {
      document.querySelectorAll('[data-reveal]').forEach((el) => {
        if (getComputedStyle(el).opacity === '0') {
          gsap.to(el, { opacity: 1, y: 0, duration: 0.4, overwrite: true });
        }
      });
    }, 1200);
  }

  const header = document.querySelector('.site-header');
  const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 8);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  const toggle = document.querySelector('.menu-toggle');
  const setMenu = (open) => {
    header.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
  };
  toggle.addEventListener('click', () => setMenu(!header.classList.contains('is-open')));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });
  document.addEventListener('click', (e) => { if (!header.contains(e.target)) setMenu(false); });

  const links = [...document.querySelectorAll('[data-nav]')];
  links.forEach((a) => a.addEventListener('click', () => setMenu(false)));
  const sections = links.map((a) => document.querySelector(a.getAttribute('href')));
  const setActive = (id) => links.forEach((a) => {
    const on = a.getAttribute('href') === `#${id}`;
    a.classList.toggle('is-active', on);
    if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
  });

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => { if (entry.isIntersecting) setActive(entry.target.id); });
  }, { rootMargin: '-45% 0px -50% 0px' });
  sections.forEach((s) => s && observer.observe(s));

  window.addEventListener('scroll', () => {
    if (window.scrollY < window.innerHeight * 0.4) setActive('');
  }, { passive: true });

  const emailBtn = document.querySelector('.email-btn');
  if (emailBtn) {
    const hint = document.getElementById('copy-hint');
    let timer;
    const legacyCopy = (text) => {
      const field = document.createElement('textarea');
      field.value = text;
      field.setAttribute('readonly', '');
      field.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
      document.body.append(field);
      field.select();
      const ok = document.execCommand('copy');
      field.remove();
      return ok;
    };
    emailBtn.addEventListener('click', async () => {
      const email = emailBtn.dataset.copy;
      let copied = false;
      try {
        await navigator.clipboard.writeText(email);
        copied = true;
      } catch {
        copied = legacyCopy(email);
      }
      if (!copied) {
        window.location.href = `mailto:${email}`;
        return;
      }
      hint.textContent = 'Email copied to clipboard';
      emailBtn.classList.add('is-copied');
      clearTimeout(timer);
      timer = setTimeout(() => {
        hint.textContent = 'Click to copy';
        emailBtn.classList.remove('is-copied');
      }, 2200);
    });
  }

  const heroVisual = document.querySelector('.hero-visual');
  if (heroVisual) {
    heroVisual.addEventListener('click', () => heroVisual.classList.toggle('is-revealed'));
  }

  const setupCarousel = (root) => {
    const slides = [...root.querySelectorAll('.slide')];
    if (!slides.length) return;
    const auto = root.dataset.carousel === 'auto' && !reduceMotion;
    let index = slides.findIndex((slide) => slide.classList.contains('is-active'));
    if (index < 0) index = 0;
    let timer;

    const pauseSlide = (slide) => {
      const video = slide.querySelector('video');
      if (!video) return;
      video.pause();
    };

    const show = (next) => {
      pauseSlide(slides[index]);
      slides[index].classList.remove('is-active');
      index = (next + slides.length) % slides.length;
      slides[index].classList.add('is-active');
      schedule();
    };

    const schedule = () => {
      clearTimeout(timer);
      if (!auto) return;
      timer = setTimeout(() => show(index + 1), 8000);
    };

    root.querySelector('.prev')?.addEventListener('click', (event) => {
      event.preventDefault();
      show(index - 1);
    });
    root.querySelector('.next')?.addEventListener('click', (event) => {
      event.preventDefault();
      show(index + 1);
    });

    const visibility = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) schedule();
        else {
          clearTimeout(timer);
          slides.forEach(pauseSlide);
        }
      });
    }, { threshold: 0.35 });
    visibility.observe(root);
    if (auto) schedule();
  };
  document.querySelectorAll('[data-carousel]').forEach(setupCarousel);

  document.querySelectorAll('[data-video-reveal]').forEach((wrap) => {
    const video = wrap.querySelector('video');
    const button = wrap.querySelector('.play-overlay');
    if (!video || !button) return;
    const visibility = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        wrap.classList.toggle('is-inview', entry.isIntersecting);
        if (entry.isIntersecting) attachVideo();
        else if (!video.paused) video.pause();
      });
    }, { threshold: 0.25 });
    visibility.observe(wrap);
    const attachVideo = () => {
      if (video.dataset.ready === '1' || !video.dataset.src) return;
      const source = document.createElement('source');
      source.src = video.dataset.src;
      source.type = video.dataset.type || 'video/mp4';
      video.append(source);
      video.preload = 'auto';
      video.dataset.ready = '1';
      video.load();
    };
    const playVideo = () => {
      attachVideo();
      const start = () => video.play().then(() => wrap.classList.add('is-playing')).catch(() => {});
      if (video.readyState >= 2) start();
      else video.addEventListener('canplay', start, { once: true });
    };
    button.addEventListener('click', playVideo);
    video.addEventListener('click', () => {
      if (video.paused) playVideo();
      else video.pause();
    });
    video.addEventListener('pause', () => wrap.classList.remove('is-playing'));
    video.addEventListener('ended', () => wrap.classList.remove('is-playing'));
  });

  document.getElementById('year').textContent = new Date().getFullYear();

  const resumeHref = 'assets/Isabella-Wilson-Resume.pdf';
  const warmResume = () => fetch(resumeHref, { cache: 'force-cache' }).catch(() => {});
  if ('requestIdleCallback' in window) requestIdleCallback(warmResume);
  else setTimeout(warmResume, 600);
})();
