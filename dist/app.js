(() => {
  'use strict';
  const status = document.getElementById('page-status');
  let messageTimeout;
  function notify(message) {
    status.textContent = message;
    status.classList.add('visible');
    clearTimeout(messageTimeout);
    messageTimeout = setTimeout(() => status.classList.remove('visible'), 3200);
  }
  async function copyText(text, button, success = 'Copied to clipboard') {
    try {
      await navigator.clipboard.writeText(text);
      const old = button.textContent;
      button.textContent = 'Copied ✓';
      setTimeout(() => { button.textContent = old; }, 1800);
      notify(success);
    } catch {
      const field = document.createElement('textarea');
      field.value = text;
      field.setAttribute('aria-label', 'Text to copy');
      field.style.position = 'fixed';
      field.style.left = '-9999px';
      document.body.appendChild(field);
      field.select();
      let copied = false;
      try { copied = document.execCommand('copy'); } catch {}
      field.remove();
      button.focus();
      notify(copied ? success : 'Clipboard unavailable. Select and copy the text manually.');
    }
  }
  document.querySelectorAll('[data-copy]').forEach(button => {
    button.addEventListener('click', () => {
      const target = document.getElementById(button.dataset.copy);
      if (target) copyText(target.textContent.trim(), button);
    });
  });
  const localEdition = location.protocol === 'file:' || /\/Cybersecurity_AI_Lab\.html$/.test(location.pathname);
  const shareButton = document.querySelector('[data-copy-link]');
  if (localEdition) {
    document.body.classList.add('local-file');
    shareButton.textContent = 'Share this file →';
    document.querySelectorAll('[data-download-offline]').forEach(link => {
      link.textContent = 'You are using the complete offline HTML ✓';
      link.removeAttribute('href'); link.removeAttribute('download');
    });
    document.getElementById('offline-mode-note').textContent = 'This file contains the complete lesson, diagrams, scenario lab, and embedded logo. If you downloaded the full ZIP, run Create_Desktop_Shortcut.cmd once to add the CyberAI Master icon to your Windows Desktop. Keep the extracted folder in place. Send a copy of the HTML or ZIP to your friend to share it. Research links need internet when followed.';
  }
  shareButton.addEventListener('click', event => {
    if (localEdition) notify('Send your friend this HTML file. They can open it directly in their browser.');
    else copyText(location.origin + location.pathname, event.currentTarget, 'Lesson link copied — ready to share');
  });
  const noteKey = 'cyber-ai-fieldguide-notes-v1';
  const fields = Array.from(document.querySelectorAll('.checkpoint textarea[id], .practice-form textarea[id]'));
  try {
    const saved = JSON.parse(localStorage.getItem(noteKey) || '{}');
    if (saved && typeof saved === 'object') fields.forEach(field => {
      if (typeof saved[field.id] === 'string') field.value = saved[field.id].slice(0,20000);
    });
  } catch {}
  let saveTimeout;
  const saveNotes = () => {
    const notes = Object.fromEntries(fields.map(field => [field.id, field.value]));
    try {
      localStorage.setItem(noteKey, JSON.stringify(notes));
      document.querySelectorAll('[data-notes-status]').forEach(el => { el.textContent = 'Notes saved in this browser.'; });
    } catch {
      document.querySelectorAll('[data-notes-status]').forEach(el => { el.textContent = 'Browser storage is unavailable. Export your notes from the offline section before leaving.'; });
    }
  };
  fields.forEach(field => field.addEventListener('input', () => {
    clearTimeout(saveTimeout); saveTimeout = setTimeout(saveNotes, 250);
  }));
  window.addEventListener('pagehide', saveNotes);
  const practiceButton = document.querySelector('[data-copy-practice]');
  if (practiceButton) practiceButton.addEventListener('click', () => {
    const parts = [['brief','BRIEF'],['records','RECORDS'],['instructions','INSTRUCTIONS'],['output','EXPECTED OUTPUT'],['finish','FINISH'],['next-check','NEXT USEFUL CHECK']];
    const text = parts.map(([id,label]) => label + '\n' + (document.getElementById('practice-' + id)?.value.trim() || '[Add your answer]')).join('\n\n');
    copyText(text, practiceButton, 'Your practice brief has been copied');
  });
  const tocLinks = Array.from(document.querySelectorAll('.toc nav a'));
  const sections = tocLinks.map(link => document.querySelector(link.getAttribute('href'))).filter(Boolean);
  const updateNavigation = () => {
    let current = sections[0];
    for (const section of sections) if (section.getBoundingClientRect().top <= 170) current = section;
    tocLinks.forEach(link => {
      if (link.getAttribute('href') === '#' + current?.id) link.setAttribute('aria-current','location');
      else link.removeAttribute('aria-current');
    });
  };
  let ticking = false;
  document.addEventListener('scroll', () => {
    if (!ticking) requestAnimationFrame(() => { updateNavigation(); ticking = false; });
    ticking = true;
  }, {passive:true});
  updateNavigation();
})();
