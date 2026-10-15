// Marin Learn - Mark the "On this page" link for the section being read.
// The current section is the last one whose top has scrolled past a line near the
// top of the window. At the very bottom of the page the last section counts, even
// if it is too short to reach that line.
const LINE = 140;

export function wireScrollSpy(container) {
  const links = [...container.querySelectorAll('.reader-toc a[href^="#"]')];
  const pairs = links
    .map(link => ({ link, target: document.getElementById(link.getAttribute('href').slice(1)) }))
    .filter(pair => pair.target);
  if (!pairs.length) return;

  let current = null;
  const setActive = pair => {
    if (pair === current) return;
    current = pair;
    pairs.forEach(item => {
      const active = item === pair;
      item.link.classList.toggle('is-active', active);
      if (active) item.link.setAttribute('aria-current', 'location');
      else item.link.removeAttribute('aria-current');
    });
  };

  const update = () => {
    const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
    let active = pairs[0];
    for (const pair of pairs) {
      if (pair.target.getBoundingClientRect().top <= LINE) active = pair;
    }
    setActive(atBottom ? pairs[pairs.length - 1] : active);
  };

  let queued = false;
  const onScroll = () => {
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(() => {
      queued = false;
      update();
    });
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  // The page is replaced when the reader navigates; stop listening then.
  const stop = new MutationObserver(() => {
    if (!container.contains(pairs[0].link)) {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      stop.disconnect();
    }
  });
  stop.observe(container, { childList: true });
  update();
}
