(function () {
  'use strict';
  var root = document.documentElement;
  root.classList.add('biznexco-colorful-theme');

  function addStylesheet() {
    if (document.querySelector('link[data-biznexco-visual-theme]')) return;
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'visual-theme.css?v=1';
    link.dataset.biznexcoVisualTheme = '1';
    document.head.appendChild(link);
  }

  function decorate() {
    addStylesheet();
    var nav = document.querySelector('nav');
    if (nav) {
      Array.prototype.forEach.call(nav.querySelectorAll('button'), function (button, i) {
        button.classList.add('biz-color-tab', 'biz-tab-' + i);
      });
    }

    var pages = document.querySelectorAll('.page');
    Array.prototype.forEach.call(pages, function (page, i) {
      page.classList.add('biz-color-page', 'biz-page-' + i);
      if (!page.querySelector(':scope > .biz-page-art')) {
        var art = document.createElement('div');
        art.className = 'biz-page-art';
        art.setAttribute('aria-hidden', 'true');
        var img = document.createElement('img');
        img.alt = '';
        img.src = 'assets/property-illustration.svg';
        art.appendChild(img);
        page.insertBefore(art, page.firstChild);
      }
    });

    var cards = document.querySelectorAll('.page .card');
    Array.prototype.forEach.call(cards, function (card, i) {
      card.classList.add('biz-color-card');
      card.style.setProperty('--biz-card-index', i % 6);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', decorate);
  } else {
    decorate();
  }
  window.addEventListener('load', decorate);
})();
