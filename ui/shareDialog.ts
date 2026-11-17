import type { GameSpec } from '../spec/schema';
import { exportGame, gameFile } from './export';
import { createModal, h } from './modal';
import { notify } from './notifications';
import { shareUrl } from './share';

const icon = (body: string) =>
  `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

async function copyText(text: string, input: HTMLInputElement): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Clipboard API unavailable (permissions, http): fall back to selecting the text.
    input.focus();
    input.select();
    return document.execCommand?.('copy') ?? false;
  }
}

/** "Share" dialog: copy a self-contained link, use the system share sheet, or download the .html. */
export function createShareDialog(host: HTMLElement): { open(spec: GameSpec): Promise<void> } {
  const heading = h('h2', { id: 'share-title', textContent: 'Share' });
  const close = h('button', { type: 'button', class: 'close', textContent: '×', attrs: { 'aria-label': 'Close share dialog' } });
  const linkInput = h('input', { type: 'text', readOnly: true, attrs: { 'aria-label': 'Share link' } });
  const copyBtn = h('button', { type: 'button', class: 'primary' });
  copyBtn.innerHTML = `${icon('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>')}<span class="btn-label">Copy link</span>`;
  const size = h('span', { class: 'muted share-size' });
  const systemBtn = h('button', { type: 'button' });
  systemBtn.innerHTML = `${icon('<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>')}<span class="btn-label">Share file…</span>`;
  const downloadBtn = h('button', { type: 'button' });
  downloadBtn.innerHTML = `${icon('<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>')}<span class="btn-label">Download .html</span>`;

  const panel = h(
    'div',
    { class: 'dialog glass share-dialog', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'share-title' } },
    h('header', { class: 'drawer-head' }, heading, close),
    h(
      'div',
      { class: 'dialog-body' },
      h('p', { class: 'share-lead', textContent: 'The whole game travels inside the link: nothing is uploaded anywhere.' }),
      h('div', { class: 'share-link' }, linkInput, copyBtn),
      h('p', { class: 'share-help' }, 'Opens in any running copy of Game Generator (this app runs on your machine). ', size),
      h('div', { class: 'share-divider', textContent: 'or share the playable file' }),
      h('div', { class: 'share-actions' }, systemBtn, downloadBtn),
      h('p', { class: 'share-help', textContent: 'The .html file is a complete offline game: anyone can open it in a browser, no install needed.' }),
    ),
  );
  host.append(panel);
  const modal = createModal(panel, { initialFocus: () => copyBtn });
  close.addEventListener('click', () => modal.close());

  let current: GameSpec | undefined;
  copyBtn.addEventListener('click', async () => {
    if (await copyText(linkInput.value, linkInput)) {
      copyBtn.querySelector('.btn-label')!.textContent = 'Copied!';
      notify('success', 'Share link copied', current ? `Anyone with Game Generator can now open "${current.title}".` : undefined);
      window.setTimeout(() => (copyBtn.querySelector('.btn-label')!.textContent = 'Copy link'), 2000);
    }
  });
  linkInput.addEventListener('focus', () => linkInput.select());
  downloadBtn.addEventListener('click', async () => {
    if (!current) return;
    await exportGame(current);
    notify('success', 'Export completed', `"${current.title}" saved as a standalone .html file.`);
  });
  systemBtn.addEventListener('click', async () => {
    if (!current) return;
    try {
      const file = await gameFile(current);
      await navigator.share({ files: [file], title: current.title, text: `Play "${current.title}", a game made with Game Generator.` });
    } catch (err) {
      if ((err as Error).name !== 'AbortError') notify('error', 'Could not open the share sheet', (err as Error).message);
    }
  });

  return {
    async open(spec) {
      current = spec;
      heading.textContent = `Share "${spec.title}"`;
      const url = await shareUrl(spec);
      linkInput.value = url;
      size.textContent = `Link size: ${(url.length / 1024).toFixed(1)} KB.`;
      // The system share sheet with files exists on most phones and some desktop browsers.
      const probe = new File(['x'], 'probe.html', { type: 'text/html' });
      systemBtn.hidden = !(navigator.canShare?.({ files: [probe] }) ?? false);
      modal.open();
    },
  };
}
