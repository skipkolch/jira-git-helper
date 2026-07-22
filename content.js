(() => {
  const PANEL_ID = 'jgh-panel';
  const POLL_INTERVAL_MS = 500;
  const POSITION_KEY = 'jgh-panel-position';
  const COLLAPSED_KEY = 'jgh-panel-collapsed';
  // Many git hosts / CI systems reject or mangle very long branch names.
  const MAX_BRANCH_LENGTH = 72;

  let lastKey = null;

  function getIssueKeyFromUrl() {
    const match = location.pathname.match(/\/browse\/([A-Z][A-Z0-9]*-\d+)/);
    return match ? match[1] : null;
  }

  function stripLeadingTag(summary) {
    return summary.replace(/^\[[^\]]+\]\s*/, '');
  }

  function slugify(text) {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function truncateSlug(slug, maxLength) {
    if (slug.length <= maxLength) return slug;
    const cut = slug.slice(0, maxLength);
    const lastDash = cut.lastIndexOf('-');
    return (lastDash > 0 ? cut.slice(0, lastDash) : cut).replace(/-+$/, '');
  }

  function buildBranchName(key, summary) {
    const prefix = `feature/${key}-`;
    const maxSlugLength = Math.max(10, MAX_BRANCH_LENGTH - prefix.length);
    const slug = truncateSlug(slugify(stripLeadingTag(summary)), maxSlugLength);
    return `${prefix}${slug}`;
  }

  function buildCommitMessage(key, summary) {
    return `${key} ${summary}`;
  }

  async function fetchIssueSummary(key) {
    const response = await fetch(`/rest/api/3/issue/${key}?fields=summary`, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      throw new Error(`Jira API returned ${response.status}`);
    }
    const data = await response.json();
    return data.fields.summary;
  }

  function isCollapsed() {
    return localStorage.getItem(COLLAPSED_KEY) === '1';
  }

  function setCollapsed(collapsed) {
    localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0');
  }

  function getStoredPosition() {
    try {
      const pos = JSON.parse(localStorage.getItem(POSITION_KEY));
      if (pos && typeof pos.top === 'number' && typeof pos.left === 'number') return pos;
    } catch {
      // ignore malformed/missing stored position
    }
    return null;
  }

  function setStoredPosition(pos) {
    localStorage.setItem(POSITION_KEY, JSON.stringify(pos));
  }

  function clampPosition(top, left, panel) {
    const margin = 4;
    const maxLeft = Math.max(margin, window.innerWidth - panel.offsetWidth - margin);
    const maxTop = Math.max(margin, window.innerHeight - panel.offsetHeight - margin);
    return {
      left: Math.min(Math.max(left, margin), maxLeft),
      top: Math.min(Math.max(top, margin), maxTop),
    };
  }

  function applyStoredPosition(panel) {
    const pos = getStoredPosition();
    if (!pos) return;
    const clamped = clampPosition(pos.top, pos.left, panel);
    panel.style.top = `${clamped.top}px`;
    panel.style.left = `${clamped.left}px`;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
  }

  function updateCollapsedUI(panel) {
    const collapsed = isCollapsed();
    panel.classList.toggle('jgh-collapsed', collapsed);
    const toggleBtn = panel.querySelector('.jgh-toggle');
    toggleBtn.textContent = collapsed ? '▢' : '−';
    toggleBtn.title = collapsed ? 'Show panel' : 'Hide panel';
  }

  function setupDrag(panel, header) {
    header.addEventListener('mousedown', (e) => {
      if (e.target.closest('.jgh-toggle')) return;
      e.preventDefault();
      const rect = panel.getBoundingClientRect();
      const offsetX = e.clientX - rect.left;
      const offsetY = e.clientY - rect.top;
      panel.classList.add('jgh-dragging');

      const onMouseMove = (ev) => {
        const { top, left } = clampPosition(ev.clientY - offsetY, ev.clientX - offsetX, panel);
        panel.style.top = `${top}px`;
        panel.style.left = `${left}px`;
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
      };

      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        panel.classList.remove('jgh-dragging');
        const rect2 = panel.getBoundingClientRect();
        setStoredPosition({ top: rect2.top, left: rect2.left });
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  }

  function setupResizeClamp(panel) {
    window.addEventListener('resize', () => {
      if (!getStoredPosition()) return;
      const rect = panel.getBoundingClientRect();
      const clamped = clampPosition(rect.top, rect.left, panel);
      panel.style.top = `${clamped.top}px`;
      panel.style.left = `${clamped.left}px`;
    });
  }

  function ensurePanel() {
    let panel = document.getElementById(PANEL_ID);
    if (panel) return panel;

    panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.innerHTML = `
      <div class="jgh-header">
        <span class="jgh-drag-handle">⠿</span>
        <span class="jgh-key"></span>
        <button class="jgh-toggle" type="button"></button>
      </div>
      <div class="jgh-body"></div>
    `;
    document.body.appendChild(panel);

    panel.querySelector('.jgh-toggle').addEventListener('click', () => {
      setCollapsed(!isCollapsed());
      updateCollapsedUI(panel);
    });
    setupDrag(panel, panel.querySelector('.jgh-header'));
    setupResizeClamp(panel);
    applyStoredPosition(panel);
    updateCollapsedUI(panel);

    return panel;
  }

  function copyToClipboard(text, button) {
    const done = () => {
      const original = button.textContent;
      button.textContent = 'Copied ✓';
      button.classList.add('jgh-copied');
      setTimeout(() => {
        button.textContent = original;
        button.classList.remove('jgh-copied');
      }, 1200);
    };

    navigator.clipboard.writeText(text).then(done, () => {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
      done();
    });
  }

  function renderLoading(key) {
    const panel = ensurePanel();
    panel.querySelector('.jgh-key').textContent = key;
    panel.querySelector('.jgh-body').innerHTML = `
      <div class="jgh-status">Loading…</div>
    `;
  }

  function renderError(key, err) {
    const panel = ensurePanel();
    panel.querySelector('.jgh-key').textContent = key;
    panel.querySelector('.jgh-body').innerHTML = `
      <div class="jgh-status jgh-error">Failed to load: ${err.message}</div>
      <button class="jgh-btn jgh-retry">Retry</button>
    `;
    panel.querySelector('.jgh-retry').addEventListener('click', () => loadAndRender(key));
  }

  function renderPanel(key, summary) {
    const branch = buildBranchName(key, summary);
    const commit = buildCommitMessage(key, summary);
    const panel = ensurePanel();
    panel.querySelector('.jgh-key').textContent = key;
    panel.querySelector('.jgh-body').innerHTML = `
      <div class="jgh-row">
        <button class="jgh-btn" data-copy="branch">Copy branch name</button>
      </div>
      <div class="jgh-row">
        <button class="jgh-btn" data-copy="commit">Copy commit message</button>
      </div>
    `;
    panel.querySelector('[data-copy="branch"]').addEventListener('click', (e) => copyToClipboard(branch, e.target));
    panel.querySelector('[data-copy="commit"]').addEventListener('click', (e) => copyToClipboard(commit, e.target));
  }

  async function loadAndRender(key) {
    renderLoading(key);
    try {
      const summary = await fetchIssueSummary(key);
      renderPanel(key, summary);
    } catch (err) {
      renderError(key, err);
    }
  }

  function checkForKeyChange() {
    const key = getIssueKeyFromUrl();
    if (key === lastKey) return;
    lastKey = key;
    if (!key) {
      const panel = document.getElementById(PANEL_ID);
      if (panel) panel.remove();
      return;
    }
    loadAndRender(key);
  }

  checkForKeyChange();
  setInterval(checkForKeyChange, POLL_INTERVAL_MS);
})();
