(function () {
  'use strict';

  const form = document.querySelector('.site-search');
  const input = form && form.querySelector('input[type="search"]');
  if (!input) return;

  const results = document.createElement('div');
  results.className = 'search-results';
  form.style.position = 'relative';
  form.appendChild(results);

  let fuse = null;
  let indexLoading = null;
  let activeIndex = -1;
  let currentItems = [];

  function loadIndex() {
    if (fuse) return Promise.resolve(fuse);
    if (indexLoading) return indexLoading;
    indexLoading = fetch('/search.json')
      .then((r) => {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then((data) => {
        fuse = new Fuse(data, {
          keys: [
            { name: 'title', weight: 3 },
            { name: 'headings', weight: 2 },
            { name: 'content', weight: 1 }
          ],
          threshold: 0.3,
          ignoreLocation: true,
          minMatchCharLength: 2,
          includeMatches: true
        });
        return fuse;
      })
      .catch((err) => {
        console.error('search: failed to load index', err);
        indexLoading = null;
        throw err;
      });
    return indexLoading;
  }

  function openResults() { results.classList.add('is-open'); }
  function closeResults() {
    results.classList.remove('is-open');
    activeIndex = -1;
  }
  function showMessage(text) {
    results.innerHTML = '<div class="search-results__msg">' + text + '</div>';
    currentItems = [];
    openResults();
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Build a ~140-char snippet centered on the first match in `content`,
  // with <mark> wrapped around all matched ranges that fall inside the window.
  function buildSnippet(content, matches) {
    const contentMatch = matches && matches.find((m) => m.key === 'content');
    if (!contentMatch || !contentMatch.indices.length) return '';
    const [start, end] = contentMatch.indices[0];
    const WINDOW = 140;
    const before = Math.max(0, start - 40);
    const after = Math.min(content.length, before + WINDOW);
    let slice = content.slice(before, after);
    // Highlight: walk indices that overlap [before, after), insert <mark>.
    const ranges = contentMatch.indices
      .filter(([s, e]) => e >= before && s < after)
      .map(([s, e]) => [Math.max(s, before) - before, Math.min(e, after - 1) - before])
      .sort((a, b) => a[0] - b[0]);
    let out = '';
    let cursor = 0;
    for (const [s, e] of ranges) {
      if (s < cursor) continue; // skip overlapping
      out += escapeHtml(slice.slice(cursor, s));
      out += '<mark>' + escapeHtml(slice.slice(s, e + 1)) + '</mark>';
      cursor = e + 1;
    }
    out += escapeHtml(slice.slice(cursor));
    const prefix = before > 0 ? '…' : '';
    const suffix = after < content.length ? '…' : '';
    return prefix + out + suffix;
  }

  function findMatchedHeading(item) {
    const m = (item.matches || []).find((m) => m.key === 'headings');
    if (!m) return '';
    const idx = m.refIndex != null ? m.refIndex : 0;
    return (item.item.headings && item.item.headings[idx]) || '';
  }

  function render(items) {
    currentItems = items;
    activeIndex = -1;
    if (!items.length) {
      showMessage('Ничего не найдено');
      return;
    }
    const html = items.map((it, i) => {
      const heading = findMatchedHeading(it);
      const snippet = buildSnippet(it.item.content || '', it.matches);
      return (
        '<a class="search-result" href="' + escapeHtml(it.item.url) + '" data-idx="' + i + '">' +
          '<div class="search-result__title">' + escapeHtml(it.item.title) + '</div>' +
          (heading ? '<div class="search-result__heading">' + escapeHtml(heading) + '</div>' : '') +
          (snippet ? '<div class="search-result__snippet">' + snippet + '</div>' : '') +
          '<div class="search-result__url">' + escapeHtml(it.item.url) + '</div>' +
        '</a>'
      );
    }).join('');
    results.innerHTML = html;
    openResults();
  }

  function setActive(i) {
    const nodes = results.querySelectorAll('.search-result');
    nodes.forEach((n) => n.classList.remove('is-active'));
    if (i >= 0 && i < nodes.length) {
      nodes[i].classList.add('is-active');
      nodes[i].scrollIntoView({ block: 'nearest' });
      activeIndex = i;
    } else {
      activeIndex = -1;
    }
  }

  function runQuery(q) {
    const trimmed = q.trim();
    if (!trimmed) { closeResults(); return; }
    if (!fuse) return; // index not ready yet
    const hits = fuse.search(trimmed, { limit: 8 });
    render(hits);
  }

  input.addEventListener('focus', () => {
    if (!fuse && !indexLoading) {
      showMessage('Загрузка…');
      loadIndex().then(() => {
        if (input.value.trim()) runQuery(input.value);
        else closeResults();
      }).catch(() => showMessage('Поиск временно недоступен'));
    } else if (fuse && input.value.trim()) {
      runQuery(input.value);
    }
  });

  input.addEventListener('input', () => {
    if (fuse) runQuery(input.value);
  });

  input.addEventListener('keydown', (e) => {
    if (!results.classList.contains('is-open')) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive(Math.min(activeIndex + 1, currentItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(Math.max(activeIndex - 1, 0));
    } else if (e.key === 'Enter') {
      if (activeIndex >= 0 && currentItems[activeIndex]) {
        e.preventDefault();
        window.location = currentItems[activeIndex].item.url;
      }
    }
  });

  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      const ae = document.activeElement;
      const tag = (ae && ae.tagName) || '';
      const editable = ae && ae.isContentEditable;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || editable) {
        if (ae !== input) return;
      }
      e.preventDefault();
      input.focus();
      input.select();
    }
    if (e.key === 'Escape' && document.activeElement === input) {
      input.blur();
      closeResults();
    }
  });

  document.addEventListener('click', (e) => {
    if (!form.contains(e.target)) closeResults();
  });
})();
