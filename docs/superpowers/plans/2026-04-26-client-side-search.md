# Client-Side Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the existing search input in the site header to a fuzzy full-text search across all guide pages, fully client-side.

**Architecture:** Jekyll generates a static `/search.json` containing `{title, url, headings, content}` for every published page. A small JS module loads Fuse.js, lazily fetches the index on first focus, and renders a keyboard-navigable dropdown of results with snippet highlighting.

**Tech Stack:** Jekyll + Liquid, vanilla JS (ES modules not used; plain `<script>`), Fuse.js v7 from jsDelivr CDN, plain CSS appended to `assets/css/main.css`.

**Note on TDD:** This repo has no test framework — it's a static Jekyll site. Each task ends with manual verification steps (build the site, hit a URL, check DevTools) instead of automated tests. Treat the verification block as the "test" — do not skip it.

**Spec:** [docs/superpowers/specs/2026-04-26-client-side-search-design.md](../specs/2026-04-26-client-side-search-design.md)

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `search.json` | create (root) | Liquid template emitting the search index as JSON at `/search.json` |
| `_includes/head.html` | modify | Add Fuse.js CDN `<script defer>` |
| `assets/js/search.js` | create | Search module: hotkey, lazy index fetch, query, render, keyboard nav |
| `_layouts/default.html` | modify | Add `<script>` tag for `search.js` |
| `assets/css/main.css` | modify | Append `.search-results` styles |

No file is restructured. All five changes are additive except the layout/head/css edits, which are surgical.

---

## Task 1: Create the search index template

**Files:**
- Create: `search.json` (repo root)

- [ ] **Step 1: Create `search.json` with the Liquid template**

Create `/Users/vp/pro/slovakiaguide.github.io/search.json`:

```liquid
---
permalink: /search.json
layout: null
sitemap: false
---
[
{% assign pages = site.pages | where_exp: "p", "p.title" %}
{% assign first = true %}
{%- for p in pages -%}
  {%- if p.nav == false -%}{%- continue -%}{%- endif -%}
  {%- if p.path contains "_pages/podtverdenie_o_nedoplatkoch/" -%}{%- continue -%}{%- endif -%}
  {%- assign headings = p.content | newline_to_br | split: "<br />" | where_exp: "l", "l contains '<h2' or l contains '<h3'" -%}
  {%- capture headings_joined -%}
    {%- for h in headings -%}{{ h | strip_html | strip_newlines | normalize_whitespace }}{%- unless forloop.last -%}|{%- endunless -%}{%- endfor -%}
  {%- endcapture -%}
  {%- if first == false -%},{%- endif -%}
  {%- assign first = false -%}
  {
    "title": {{ p.title | strip_html | jsonify }},
    "url": {{ p.url | relative_url | jsonify }},
    "headings": {{ headings_joined | split: "|" | jsonify }},
    "content": {{ p.content | strip_html | strip_newlines | normalize_whitespace | jsonify }}
  }
{%- endfor -%}
]
```

Notes:
- `where_exp: "p", "p.title"` excludes title-less pages (the 404, robots, etc.).
- Two `continue` filters skip drafts (`nav: false`) and the partials directory.
- `jsonify` handles all string escaping (quotes, newlines, unicode), so we don't roll our own.
- `headings` extraction: splits content on `<br />` after `newline_to_br`, keeps lines containing `<h2`/`<h3` tags, strips tags. Imperfect (a heading split across lines breaks it) but works for our HTML where headings are single-line.

- [ ] **Step 2: Build the site and verify the JSON**

Run:

```bash
bundle exec jekyll build
```

Expected: build succeeds, `_site/search.json` exists.

Then validate:

```bash
python3 -c "import json; d=json.load(open('_site/search.json')); print(f'{len(d)} entries'); print('keys:', sorted(d[0].keys())); print('first title:', d[0]['title'])"
```

Expected output:
```
~15-19 entries
keys: ['content', 'headings', 'title', 'url']
first title: <some page title>
```

If `json.load` fails, the Liquid template emitted invalid JSON — most likely an unescaped quote in a title. Find the offending page and fix `jsonify` usage.

- [ ] **Step 3: Spot-check filtering**

```bash
python3 -c "
import json
d = json.load(open('_site/search.json'))
urls = [e['url'] for e in d]
print('\n'.join(sorted(urls)))
"
```

Expected: list of guide URLs (`/transport/`, `/banks/`, etc.). Should NOT contain:
- `/podtverdenie_o_nedoplatkoch/01-...` style partial fragment URLs
- pages whose source file has `nav: false` in front matter

If a draft page leaks in, check its front matter and confirm `nav: false` is set.

- [ ] **Step 4: Commit**

```bash
git add search.json
git commit -m "Add /search.json template for client-side search index"
```

---

## Task 2: Add Fuse.js to the page head

**Files:**
- Modify: `_includes/head.html` (insert before closing `</head>` on line 25)

- [ ] **Step 1: Add Fuse.js CDN script**

Edit `_includes/head.html`, add this line after line 24 (after the Google Fonts `<link>`, before `</head>`):

```html
  <script defer src="https://cdn.jsdelivr.net/npm/fuse.js@7/dist/fuse.min.js"></script>
```

The pinned major (`@7`) keeps API stable; `defer` ensures it executes after HTML parse but before `DOMContentLoaded` fires for our own script.

- [ ] **Step 2: Build and verify the script tag is present**

```bash
bundle exec jekyll build
grep -c "fuse.min.js" _site/index.html
```

Expected: `1` (or higher if site has multiple HTML files but only one head — should be exactly 1 per page).

```bash
grep "fuse.min.js" _site/transport/index.html
```

Expected: the script tag appears.

- [ ] **Step 3: Commit**

```bash
git add _includes/head.html
git commit -m "Load Fuse.js from CDN for client-side search"
```

---

## Task 3: Create search.js with hotkey and lazy index loading

**Files:**
- Create: `assets/js/search.js`

- [ ] **Step 1: Create `assets/js/search.js` with the skeleton**

Create `/Users/vp/pro/slovakiaguide.github.io/assets/js/search.js`:

```js
(function () {
  'use strict';

  const form = document.querySelector('.site-search');
  const input = form && form.querySelector('input[type="search"]');
  if (!input) return;

  // Build the dropdown container next to the input.
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
    openResults();
  }

  // First focus triggers index load.
  input.addEventListener('focus', () => {
    if (!fuse && !indexLoading) {
      showMessage('Загрузка…');
      loadIndex().then(() => {
        if (input.value.trim()) runQuery(input.value);
        else closeResults();
      }).catch(() => showMessage('Поиск временно недоступен'));
    }
  });

  // Global hotkey: Cmd/Ctrl+K.
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      const tag = (document.activeElement && document.activeElement.tagName) || '';
      const editable = document.activeElement && document.activeElement.isContentEditable;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || editable) {
        // Allow hotkey only if it's our own field — otherwise let the user keep typing.
        if (document.activeElement !== input) return;
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

  // Close on outside click.
  document.addEventListener('click', (e) => {
    if (!form.contains(e.target)) closeResults();
  });

  // Stub — implemented in Task 4.
  function runQuery(q) {
    // placeholder until Task 4
  }

  // Expose for Task 4 to extend; keep on the IIFE-local scope otherwise.
  window.__searchRunQuery = (q) => runQuery(q);
})();
```

Note: `runQuery` is a stub here. Task 4 replaces it. The `window.__searchRunQuery` export exists only so we can sanity-check loading in Step 3 — it gets removed when Task 4 inlines the real query handler.

- [ ] **Step 2: Wire the script into the layout**

Edit `_layouts/default.html`. Find the existing `<script src=".../main.js">` line and add a sibling line right after it:

```html
    <script src="{{ '/assets/js/main.js' | relative_url }}"></script>
    <script src="{{ '/assets/js/search.js' | relative_url }}"></script>
```

- [ ] **Step 3: Manual verification — hotkey and lazy load**

Run:

```bash
bundle exec jekyll serve --livereload
```

Open `http://127.0.0.1:4000` in a browser.

1. Open DevTools → Network tab, filter "search.json".
2. Reload page. **Expected:** `search.json` is NOT in network log.
3. Click the search input. **Expected:** dropdown shows "Загрузка…", then disappears (empty query). `search.json` appears in Network.
4. Press `Cmd+K` (mac) / `Ctrl+K` (other). **Expected:** focus jumps to the search input, current value (if any) is selected.
5. With focus in the input, press `Esc`. **Expected:** input loses focus, dropdown closes.

If "Загрузка…" sticks forever, check the console — `Fuse is not defined` means the CDN script hasn't loaded yet. Confirm `defer` is set on the Fuse.js tag.

- [ ] **Step 4: Commit**

```bash
git add assets/js/search.js _layouts/default.html
git commit -m "Add search.js skeleton with hotkey and lazy index loading"
```

---

## Task 4: Implement query, render, and keyboard navigation

**Files:**
- Modify: `assets/js/search.js`

- [ ] **Step 1: Replace the `runQuery` stub and wire the input event**

In `assets/js/search.js`, **replace** the `runQuery` stub and the `window.__searchRunQuery` line with the full implementation. Add an `input` listener and a `keydown` listener for arrow keys. The full file should now look like this (replace the entire contents):

```js
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
```

- [ ] **Step 2: Manual verification — querying and navigation**

With `bundle exec jekyll serve --livereload` running, in a browser:

1. Focus the search input, type `транс`. **Expected:** dropdown shows "Транспорт" page in the first slot.
2. Type `mhd`. **Expected:** "Транспорт" appears with a snippet containing the highlighted `<mark>MHD</mark>` (or near it).
3. Type `трнаспорт` (typo). **Expected:** "Транспорт" still appears (fuzzy threshold 0.3).
4. Press `↓` twice, `↑` once. **Expected:** active highlight moves down two, up one.
5. Press `Enter` while a result is highlighted. **Expected:** browser navigates to that URL.
6. Type a nonsense query like `qzqzqz`. **Expected:** "Ничего не найдено".
7. Click outside the search form. **Expected:** dropdown closes.
8. Press `Cmd/Ctrl+K`. **Expected:** focus returns to the input, the existing query is selected.

If snippets show raw `&lt;` or HTML tags, verify the `escapeHtml` helper is applied to plain slices and `<mark>` is the only un-escaped part.

- [ ] **Step 3: Commit**

```bash
git add assets/js/search.js
git commit -m "Implement search query, snippet rendering, and keyboard nav"
```

---

## Task 5: Style the dropdown

**Files:**
- Modify: `assets/css/main.css` (append at end)

- [ ] **Step 1: Append search styles**

Append to the end of `assets/css/main.css`:

```css
/* ---------- Site search dropdown ---------- */
.search-results {
  display: none;
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  max-height: 70vh;
  overflow-y: auto;
  background: var(--panel);
  border: 1px solid var(--line);
  z-index: 100;
}

.search-results.is-open { display: block; }

.search-results__msg {
  padding: 12px 14px;
  color: var(--muted);
  font-size: var(--fs-nav);
}

.search-result {
  display: block;
  padding: 10px 14px;
  border-bottom: 1px solid var(--line);
  text-decoration: none;
  color: var(--fg);
}

.search-result:last-child { border-bottom: 0; }

.search-result:hover,
.search-result.is-active {
  background: var(--accent-soft, rgba(0, 0, 0, 0.05));
}

.search-result__title {
  font-weight: 600;
  font-size: var(--fs-nav);
  margin-bottom: 2px;
}

.search-result__heading {
  font-size: 0.85em;
  color: var(--muted);
  margin-bottom: 4px;
}

.search-result__snippet {
  font-size: 0.85em;
  color: var(--fg);
  line-height: 1.4;
  margin-bottom: 4px;
}

.search-result__snippet mark {
  background: rgba(255, 220, 100, 0.5);
  color: inherit;
  padding: 0 1px;
}

.search-result__url {
  font-size: 0.75em;
  color: var(--muted);
  font-family: var(--font-mono, monospace);
}
```

Note: `--accent-soft` and `--font-mono` may not exist as CSS variables — the fallback values in `var(..., fallback)` cover that. If you'd rather use a defined token, grep `assets/css/main.css` for existing accent/highlight variables and substitute.

- [ ] **Step 2: Manual verification — visuals**

Reload the site with the dev server still running (no rebuild needed for CSS via livereload).

1. Open the search, type `транс`. **Expected:** dropdown is visible, has a border, shows results stacked, hovered/active row has a subtle background.
2. Type `mhd`. **Expected:** the matched substring inside the snippet has a yellow highlight.
3. Resize the window narrow. **Expected:** dropdown stays inside the search form's width, scrolls vertically if results overflow.
4. Open the site on a mobile viewport (DevTools device emulation). **Expected:** at the breakpoint where `.site-search { display: none }` kicks in (around 800px in the existing CSS), the search vanishes — that's pre-existing behavior, leave it alone.

- [ ] **Step 3: Commit**

```bash
git add assets/css/main.css
git commit -m "Style search dropdown and result cards"
```

---

## Task 6: Final verification pass

**Files:** none (verification only)

- [ ] **Step 1: Full build, no dev tooling**

```bash
rm -rf _site
bundle exec jekyll build
```

Expected: clean build, no Liquid warnings.

- [ ] **Step 2: Verify production assets**

```bash
ls -la _site/search.json _site/assets/js/search.js _site/assets/css/main.css
python3 -c "import json; print(len(json.load(open('_site/search.json'))), 'pages indexed')"
grep -c "fuse.min.js" _site/index.html
grep -c "search.js" _site/index.html
grep -c "search-results" _site/assets/css/main.css
```

Expected: all files exist, page count matches your published guides, `fuse.min.js` and `search.js` each appear `1` time per page, CSS contains the new selectors.

- [ ] **Step 3: End-to-end browser walkthrough**

`bundle exec jekyll serve` and run through every item from the spec's testing checklist:

1. `/search.json` returns valid JSON with the expected count.
2. `⌘K` / `Ctrl+K` focuses the field.
3. Typing `транс` → "Транспорт" first.
4. `↑/↓/Enter` navigates and opens the page.
5. `Esc` and outside-click close the dropdown.
6. Network tab: `search.json` loads only on first focus.
7. `трнаспорт` (typo) still finds Транспорт.
8. From a non-home page (e.g., `/transport/`) all of the above still work.

If any item fails, fix the related task and recommit before considering this task done.

- [ ] **Step 4: Commit (only if any fixes were applied)**

```bash
git add <files>
git commit -m "Address verification findings for client-side search"
```

---

## Out of Scope (per spec)

- Multi-match snippet highlighting (we render one snippet, the first content match).
- Russian morphology / stemming.
- Search analytics.
- Anchor-level deep-linking inside pages.
- Highlighting the matched query on the destination page after navigation.
