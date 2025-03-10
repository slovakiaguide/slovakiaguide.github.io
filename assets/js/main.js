document.addEventListener('DOMContentLoaded', function () {
  // Mobile nav toggle
  const mobileNavToggle = document.querySelector('.mobile-nav-toggle');
  const closeNavButton = document.querySelector('.close-nav');
  const leftSidebar = document.querySelector('.left-sidebar');

  if (mobileNavToggle && leftSidebar) {
    mobileNavToggle.addEventListener('click', function (e) {
      e.stopPropagation();
      leftSidebar.classList.add('active');
    });
  }
  if (closeNavButton && leftSidebar) {
    closeNavButton.addEventListener('click', function () {
      leftSidebar.classList.remove('active');
    });
  }
  document.addEventListener('click', function (event) {
    if (
      leftSidebar &&
      mobileNavToggle &&
      leftSidebar.classList.contains('active') &&
      !leftSidebar.contains(event.target) &&
      !mobileNavToggle.contains(event.target)
    ) {
      leftSidebar.classList.remove('active');
    }
  });

  // Build TOC
  const tocList = document.getElementById('toc-list');
  if (tocList) {
    const headings = document.querySelectorAll(
      '.page-content h2, .page-content h3, .page-content h4',
    );
    if (headings.length > 0) {
      headings.forEach(function (heading) {
        if (!heading.id) {
          heading.id = heading.textContent
            .toLowerCase()
            .replace(/[^\wа-яё\s-]/giu, '')
            .replace(/\s+/g, '-');
        }
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = '#' + heading.id;
        a.textContent = heading.textContent;
        a.classList.add('toc-' + heading.tagName.toLowerCase());
        li.appendChild(a);
        tocList.appendChild(li);
        a.addEventListener('click', function (e) {
          e.preventDefault();
          document.querySelector(this.getAttribute('href'))
            .scrollIntoView({ behavior: 'smooth' });
        });
      });
    } else {
      const rightSidebar = document.querySelector('.right-sidebar');
      if (rightSidebar) rightSidebar.style.display = 'none';
    }
  }

  // TOC active highlight
  window.addEventListener('scroll', function () {
    const headings = document.querySelectorAll(
      '.page-content h2, .page-content h3, .page-content h4',
    );
    const tocLinks = document.querySelectorAll('.toc-list a');
    if (headings.length > 0 && tocLinks.length > 0) {
      let current = '';
      headings.forEach(function (heading) {
        if (window.scrollY >= heading.offsetTop - 120) current = heading.id;
      });
      tocLinks.forEach(function (link) {
        link.classList.toggle(
          'active',
          link.getAttribute('href').substring(1) === current,
        );
      });
    }
  });

  // Lightbox for page-content images
  const content = document.querySelector('.page-content');
  if (content) {
    const overlay = document.createElement('div');
    overlay.id = 'lightbox';
    const img = document.createElement('img');
    overlay.appendChild(img);
    document.body.appendChild(overlay);

    content.querySelectorAll('img').forEach(function (el) {
      el.style.cursor = 'zoom-in';
      el.addEventListener('click', function () {
        img.src = el.src;
        img.alt = el.alt;
        overlay.classList.add('active');
      });
    });

    overlay.addEventListener('click', function () {
      overlay.classList.remove('active');
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') overlay.classList.remove('active');
    });
  }

  // Reading progress
  const bar = document.getElementById('reading-bar');
  if (bar) {
    const onScroll = function () {
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      const pct = max > 0 ? (h.scrollTop / max) * 100 : 0;
      bar.style.width = Math.max(0, Math.min(100, pct)) + '%';
    };
    window.addEventListener('scroll', onScroll);
    onScroll();
  }
});
