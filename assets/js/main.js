document.addEventListener('DOMContentLoaded', function () {
  // Mobile navigation toggle
  const mobileNavToggle = document.querySelector('.mobile-nav-toggle');
  const closeNavButton = document.querySelector('.close-nav');
  const leftSidebar = document.querySelector('.left-sidebar');

  if (mobileNavToggle) {
    mobileNavToggle.addEventListener('click', function () {
      leftSidebar.classList.add('active');
    });
  }

  if (closeNavButton) {
    closeNavButton.addEventListener('click', function () {
      leftSidebar.classList.remove('active');
    });
  }

  // Close sidebar when clicking outside
  document.addEventListener('click', function (event) {
    if (
      leftSidebar &&
      leftSidebar.classList.contains('active') &&
      !leftSidebar.contains(event.target) &&
      !mobileNavToggle.contains(event.target)
    ) {
      leftSidebar.classList.remove('active');
    }
  });

  // Generate table of contents
  const tocList = document.getElementById('toc-list');
  if (tocList) {
    const headings = document.querySelectorAll(
      '.page-content h2, .page-content h3, .page-content h4',
    );

    if (headings.length > 0) {
      headings.forEach(function (heading) {
        // Create ID if not exists
        if (!heading.id) {
          heading.id = heading.textContent
            .toLowerCase()
            .replace(/[^\w\s-]/g, '')
            .replace(/\s+/g, '-');
        }

        const listItem = document.createElement('li');
        const link = document.createElement('a');

        link.href = '#' + heading.id;
        link.textContent = heading.textContent;
        link.classList.add('toc-' + heading.tagName.toLowerCase());

        listItem.appendChild(link);
        tocList.appendChild(listItem);

        // Add click event to scroll smoothly
        link.addEventListener('click', function (e) {
          e.preventDefault();

          document.querySelector(this.getAttribute('href')).scrollIntoView({
            behavior: 'smooth',
          });

          // Update active state
          document.querySelectorAll('.toc-list a').forEach(function (el) {
            el.classList.remove('active');
          });

          this.classList.add('active');
        });
      });
    } else {
      // Hide TOC if no headings
      const rightSidebar = document.querySelector('.right-sidebar');
      if (rightSidebar) {
        rightSidebar.style.display = 'none';
      }
    }
  }

  // Highlight active TOC item on scroll
  window.addEventListener('scroll', function () {
    const headings = document.querySelectorAll(
      '.page-content h2, .page-content h3, .page-content h4',
    );
    const tocLinks = document.querySelectorAll('.toc-list a');

    if (headings.length > 0 && tocLinks.length > 0) {
      let current = '';

      headings.forEach(function (heading) {
        const sectionTop = heading.offsetTop;
        const sectionHeight = heading.clientHeight;

        if (window.scrollY >= sectionTop - 100) {
          current = heading.id;
        }
      });

      tocLinks.forEach(function (link) {
        link.classList.remove('active');
        if (link.getAttribute('href').substring(1) === current) {
          link.classList.add('active');
        }
      });
    }
  });
});
