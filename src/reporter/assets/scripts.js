// Lightbox functionality
document.addEventListener('DOMContentLoaded', function() {
  const lightbox = document.createElement('div');
  lightbox.className = 'lightbox';
  lightbox.innerHTML = '<span class="close">&times;</span><img src="" alt="">';
  document.body.appendChild(lightbox);

  const lightboxImg = lightbox.querySelector('img');
  const closeBtn = lightbox.querySelector('.close');

  // Add click handlers to screenshots
  document.querySelectorAll('.viewport img').forEach(img => {
    img.addEventListener('click', function(e) {
      e.preventDefault();
      lightboxImg.src = this.src;
      lightbox.classList.add('active');
    });
  });

  // Close lightbox
  closeBtn.addEventListener('click', () => {
    lightbox.classList.remove('active');
  });

  lightbox.addEventListener('click', (e) => {
    if (e.target === lightbox) {
      lightbox.classList.remove('active');
    }
  });

  // Domain switching
  const domainButtons = document.querySelectorAll('.domains button');
  domainButtons.forEach(btn => {
    btn.addEventListener('click', function() {
      domainButtons.forEach(b => b.classList.remove('active'));
      this.classList.add('active');

      const domain = this.dataset.domain;
      filterByDomain(domain);
    });
  });
});

function filterByDomain(domain) {
  const sections = document.querySelectorAll('.category');

  sections.forEach(section => {
    const pages = section.querySelectorAll('.page-card');
    let hasVisiblePages = false;

    pages.forEach(page => {
      const pageDomain = page.dataset.domain;
      if (pageDomain === domain || domain === 'all') {
        page.style.display = '';
        hasVisiblePages = true;
      } else {
        page.style.display = 'none';
      }
    });

    section.style.display = hasVisiblePages ? '' : 'none';
  });
}
