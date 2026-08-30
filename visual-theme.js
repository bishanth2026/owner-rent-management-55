/* BIZNEXCO visual theme deployment refresh — app logic unchanged. */
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

  function installTenantCredentialEditor() {
    if (window.__biznexcoTenantCredentialEditorInstalled) return;
    window.__biznexcoTenantCredentialEditorInstalled = true;

    function esc(v) {
      return String(v == null ? '' : v)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function openEditor(id) {
      if (!window.BiznexcoData || !window.BiznexcoAuth) {
        alert('The secure tenant management services are still loading. Please try again.');
        return;
      }
      var host = document.getElementById('modalHost');
      var content = document.getElementById('modalContent');
      if (!host || !content) {
        alert('Tenant editor is unavailable on this page.');
        return;
      }

      window.BiznexcoData.getTenantById(id).then(function (row) {
        if (!row) throw new Error('Tenant record could not be found.');
        var t = window.BiznexcoData.toLegacyTenantShape(row);
        content.innerHTML =
          '<h3>Edit Tenant</h3>' +
          '<div class="modal-sub">Update tenant details and login credentials. Username and password changes apply to the secure tenant login.</div>' +
          '<div class="formgrid">' +
            '<div><label>Tenant Name</label><input id="ceName" value="' + esc(t.name) + '"></div>' +
            '<div><label>Unit / Shop</label><input id="ceUnit" value="' + esc(t.unit || '') + '"></div>' +
            '<div><label>Monthly Fixed Rent</label><input id="ceRent" type="number" min="0" value="' + Number(t.monthlyRent || 0) + '"></div>' +
          '</div>' +
          '<div class="formgrid" style="margin-top:10px">' +
            '<div><label>Rent Starting Date</label><input id="ceStart" type="date" value="' + esc(t.startDate || '') + '"></div>' +
            '<div><label>Tenant Username (login)</label><input id="ceUser" autocomplete="off" value="' + esc(t.username || '') + '"></div>' +
            '<div><label>New Password <span class="muted">(leave blank to keep current)</span></label><div class="password-wrap"><input id="cePassword" type="password" autocomplete="new-password" placeholder="Enter new password"><button type="button" class="password-eye" id="cePasswordEye" aria-label="Show password">◉</button></div></div>' +
          '</div>' +
          '<div class="formgrid" style="margin-top:10px">' +
            '<div><label>Tenant WhatsApp Number</label><input id="ceWhatsApp" type="tel" inputmode="tel" autocomplete="tel" placeholder="e.g. 919876543210" value="' + esc(t.contactNumber || '') + '"><div class="muted">Use country code, e.g. 919876543210</div></div>' +
          '</div>' +
          '<div id="ceMsg" style="margin-top:10px"></div>' +
          '<div class="modal-actions"><button type="button" class="secondary" id="ceCancel">Cancel</button><button type="button" class="primary" id="ceSave">Save Changes</button></div>';
        host.classList.add('show');
        host.setAttribute('aria-hidden', 'false');

        document.getElementById('ceCancel').onclick = function () {
          host.classList.remove('show');
          host.setAttribute('aria-hidden', 'true');
          content.innerHTML = '';
        };
        document.getElementById('cePasswordEye').onclick = function () {
          var p = document.getElementById('cePassword');
          p.type = p.type === 'password' ? 'text' : 'password';
          this.textContent = p.type === 'password' ? '◉' : '◉';
        };
        document.getElementById('ceSave').onclick = async function () {
          var btn = this;
          var msg = document.getElementById('ceMsg');
          var name = document.getElementById('ceName').value.trim();
          var unit = document.getElementById('ceUnit').value.trim();
          var rent = Number(document.getElementById('ceRent').value);
          var start = document.getElementById('ceStart').value;
          var username = document.getElementById('ceUser').value.trim().toLowerCase();
          var password = document.getElementById('cePassword').value;
          var contactNumber = document.getElementById('ceWhatsApp').value.trim();

          if (!name || !rent || rent <= 0 || !start || !username) {
            msg.innerHTML = '<div class="notice error">Please enter all required tenant fields, including username.</div>';
            return;
          }
          if (password && password.length < 6) {
            msg.innerHTML = '<div class="notice error">New password must contain at least 6 characters.</div>';
            return;
          }

          btn.disabled = true;
          msg.innerHTML = '<div class="notice">Saving tenant details securely…</div>';
          try {
            await window.BiznexcoData.updateTenantEditableFields(id, {
              name: name,
              unit_label: unit,
              monthly_rent: rent,
              rent_start_date: start,
              contact_number: contactNumber
            });
            await window.BiznexcoAuth.manageTenant('update_credentials', {
              tenantId: id,
              username: username,
              newPassword: password
            });
            msg.innerHTML = '<div class="notice success">Tenant details and login credentials updated successfully.</div>';
            setTimeout(function () { window.location.reload(); }, 500);
          } catch (err) {
            msg.innerHTML = '<div class="notice error">Could not save changes: ' + esc(err && err.message ? err.message : err) + '</div>';
            btn.disabled = false;
          }
        };
      }).catch(function (err) {
        alert('Could not load tenant: ' + (err && err.message ? err.message : err));
      });
    }

    document.addEventListener('click', function (event) {
      var button = event.target && event.target.closest ? event.target.closest('.editT') : null;
      if (!button) return;
      var id = button.getAttribute('data-id');
      if (!id) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.stopImmediatePropagation) event.stopImmediatePropagation();
      openEditor(id);
    }, true);
  }

  /* Tenant portal Logout: only the tenant-page Logout button is moved to the
     top-right. Owner and Super Admin controls are intentionally untouched. */
  function fixTenantLogout() {
    var pages = document.querySelectorAll('.page');
    Array.prototype.forEach.call(pages, function (page) {
      var isTenantPage = !!page.querySelector('.tenant-premium-hero') || /tenant\s*(dashboard|portal)/i.test(page.textContent || '');
      if (!isTenantPage) return;
      var button = Array.prototype.find.call(page.querySelectorAll('button'), function (b) {
        return /^\s*logout\s*$/i.test(b.textContent || '');
      });
      if (!button || button.dataset.biznexcoTenantLogoutFixed === '1') return;

      button.dataset.biznexcoTenantLogoutFixed = '1';
      page.style.position = page.style.position || 'relative';
      button.style.position = 'absolute';
      button.style.top = '14px';
      button.style.right = '14px';
      button.style.zIndex = '30';
      button.style.margin = '0';

      button.addEventListener('click', async function (event) {
        event.preventDefault();
        event.stopPropagation();
        if (event.stopImmediatePropagation) event.stopImmediatePropagation();
        if (button.dataset.biznexcoLoggingOut === '1') return;
        button.dataset.biznexcoLoggingOut = '1';
        button.disabled = true;
        try {
          if (window.BiznexcoAuth && typeof window.BiznexcoAuth.tenantSignOut === 'function') {
            await window.BiznexcoAuth.tenantSignOut();
          } else if (window.BiznexcoAuth && window.BiznexcoAuth.supabase) {
            await window.BiznexcoAuth.supabase.auth.signOut();
          }
        } catch (err) {
          console.error('Tenant logout failed:', err);
          try { if (window.BiznexcoAuth && window.BiznexcoAuth.supabase) await window.BiznexcoAuth.supabase.auth.signOut(); } catch (_) {}
        } finally {
          try { if (window.BiznexcoAuth && typeof window.BiznexcoAuth.clearSession === 'function') window.BiznexcoAuth.clearSession(); } catch (_) {}
          try { if (window.BiznexcoAuth && typeof window.BiznexcoAuth.clearLastPage === 'function') window.BiznexcoAuth.clearLastPage(); } catch (_) {}
          window.location.href = './index.html';
        }
      }, true);
    });
  }

  var tenantLogoutObserver = new MutationObserver(fixTenantLogout);
  function startTenantLogoutFix() {
    var main = document.getElementById('main');
    if (main) tenantLogoutObserver.observe(main, { childList: true, subtree: true });
    fixTenantLogout();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      decorate();
      installTenantCredentialEditor();
      startTenantLogoutFix();
    });
  } else {
    decorate();
    installTenantCredentialEditor();
    startTenantLogoutFix();
  }
  window.addEventListener('load', function () { decorate(); fixTenantLogout(); });
})();

/* -------------------------------------------------------------------------
   Tenant WhatsApp display fix.
   The Supabase tenant row already contains contact_number and
   lib/tenants.js maps it to contactNumber. The owner tenant table simply
   wasn't rendering that field. This additive observer adds one WhatsApp
   column to the existing table without changing any existing controls.
--------------------------------------------------------------------------- */
(function () {
  'use strict';
  if (window.__biznexcoTenantWhatsAppListInstalled) return;
  window.__biznexcoTenantWhatsAppListInstalled = true;

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/\"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function formatNumber(v) {
    var raw = String(v || '').trim();
    if (!raw) return 'Not saved';
    return raw;
  }

  async function addWhatsAppColumn() {
    var table = document.querySelector('#tRows') && document.querySelector('#tRows').closest('table');
    var body = document.getElementById('tRows');
    if (!table || !body || table.dataset.biznexcoWhatsappAdded === '1') return;
    if (!window.BiznexcoData || typeof window.BiznexcoData.listAllTenantsForOwner !== 'function') return;

    try {
      var rows = await window.BiznexcoData.listAllTenantsForOwner(true);
      var byUsername = {};
      (rows || []).forEach(function (row) {
        if (row && row.username) byUsername[String(row.username).trim().toLowerCase()] = row;
      });

      var head = table.querySelector('thead tr');
      if (!head) return;
      var th = document.createElement('th');
      th.textContent = 'WhatsApp';
      head.insertBefore(th, head.children[5] || null);

      Array.prototype.forEach.call(body.querySelectorAll('tr'), function (tr) {
        var cells = tr.querySelectorAll('td');
        if (cells.length < 7) return;
        var username = String(cells[4].textContent || '').trim().toLowerCase();
        var row = byUsername[username];
        var number = row && row.contact_number ? row.contact_number : '';
        var td = document.createElement('td');
        td.innerHTML = number
          ? '<span title="Saved tenant WhatsApp number">' + esc(formatNumber(number)) + '</span>'
          : '<span class="muted">Not saved</span>';
        tr.insertBefore(td, tr.children[5] || null);
      });
      table.dataset.biznexcoWhatsappAdded = '1';
    } catch (err) {
      console.warn('Could not display tenant WhatsApp numbers:', err);
    }
  }

  var observer = new MutationObserver(function () {
    addWhatsAppColumn();
  });

  function start() {
    var main = document.getElementById('main');
    if (main) observer.observe(main, { childList: true, subtree: true });
    addWhatsAppColumn();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
