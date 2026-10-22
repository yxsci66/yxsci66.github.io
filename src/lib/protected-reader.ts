import DOMPurify from 'dompurify';
import { decryptProtectedArticle, type ProtectedArticle } from './protected-crypto';
import { decodeProtectedAssets } from './protected-assets';

// Parse into an inert fragment, restrict every load-bearing attribute, then create
// object URLs. No decrypted HTML enters the live document before this completes.
function prepareContent(article: ProtectedArticle): { fragment: DocumentFragment; revoke: () => void } {
  const assets = decodeProtectedAssets(article.assets);
  const urls: string[] = [];
  const revoke = () => { for (const url of urls) URL.revokeObjectURL(url); urls.length = 0; };
  const fragment = DOMPurify.sanitize(article.html, {
    ALLOWED_TAGS: ['p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'code', 'strong', 'em', 'b', 'i', 's', 'del', 'ul', 'ol', 'li', 'a', 'img', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'caption', 'figure', 'figcaption', 'sup', 'sub'],
    ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'colspan', 'rowspan'],
    ALLOW_DATA_ATTR: false, ALLOW_ARIA_ATTR: false, SANITIZE_NAMED_PROPS: true,
    ALLOWED_URI_REGEXP: /^(?:harlen-asset:[A-Za-z0-9_-]+$|https?:\/\/|#)/i,
    RETURN_DOM_FRAGMENT: true,
  });
  try {
    for (const element of fragment.querySelectorAll('img, a')) {
      const attribute = element.tagName === 'IMG' ? 'src' : 'href';
      const reference = element.getAttribute(attribute) ?? '';
      if (reference.startsWith('harlen-asset:')) {
        const asset = assets.get(reference.slice('harlen-asset:'.length));
        if (!asset || (attribute === 'src' && !asset.mime.startsWith('image/'))) throw new Error('Missing or invalid protected asset.');
        const url = URL.createObjectURL(asset.blob);
        urls.push(url);
        element.setAttribute(attribute, url);
        if (attribute === 'href') element.setAttribute('download', asset.name);
      } else if (attribute === 'src') {
        // Removing the entire image also prevents broken-image fallback loads.
        element.remove();
      } else if (/^https?:\/\//i.test(reference)) {
        element.setAttribute('rel', 'noopener noreferrer');
        element.setAttribute('referrerpolicy', 'no-referrer');
        element.setAttribute('target', '_blank');
      } else if (!reference.startsWith('#')) element.removeAttribute('href');
    }
    return { fragment, revoke };
  } catch (error) { revoke(); throw error; }
}

export function initializeProtectedReaders(): void {
  for (const reader of document.querySelectorAll<HTMLElement>('[data-locked-reader]')) {
    const form = reader.querySelector<HTMLFormElement>('form')!;
    const input = reader.querySelector<HTMLInputElement>('input')!;
    const submit = form.querySelector<HTMLButtonElement>('[type=submit]')!;
    const toggle = form.querySelector<HTMLButtonElement>('.password-toggle')!;
    const gate = reader.querySelector<HTMLElement>('.locked-gate')!;
    const article = reader.querySelector<HTMLElement>('.unlocked-article')!;
    const title = reader.querySelector<HTMLElement>('.protected-title')!;
    const description = reader.querySelector<HTMLElement>('.protected-description')!;
    const meta = reader.querySelector<HTMLElement>('.protected-meta')!;
    const body = reader.querySelector<HTMLElement>('.protected-body')!;
    const status = reader.querySelector<HTMLElement>('[role=status]')!;
    let revoke = () => {};
    let generation = 0;
    let controller: AbortController | undefined;
    const relock = (focus = true) => {
      generation++;
      controller?.abort();
      revoke();
      body.replaceChildren(); title.textContent = ''; description.textContent = ''; meta.textContent = '';
      input.value = ''; input.type = 'password'; toggle.textContent = '显示密码'; toggle.setAttribute('aria-pressed', 'false');
      article.hidden = true; gate.hidden = false; submit.disabled = false; input.disabled = false;
      form.removeAttribute('aria-busy'); status.textContent = '';
      if (focus) { window.scrollTo({ top: 0 }); input.focus({ preventScroll: true }); }
    };
    reader.querySelectorAll<HTMLButtonElement>('.relock-button').forEach(button => button.addEventListener('click', () => relock()));
    window.addEventListener('pagehide', () => relock(false));
    toggle.addEventListener('click', () => {
      const visible = input.type === 'password'; input.type = visible ? 'text' : 'password';
      toggle.textContent = visible ? '隐藏密码' : '显示密码'; toggle.setAttribute('aria-pressed', String(visible)); input.focus();
    });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (submit.disabled || !input.value) return;
      const attempt = ++generation;
      controller = new AbortController();
      let password = input.value;
      input.value = ''; input.disabled = true; submit.disabled = true; form.setAttribute('aria-busy', 'true'); status.textContent = '正在解锁…';
      let prepared: ReturnType<typeof prepareContent> | undefined;
      try {
        if (!window.isSecureContext || !crypto.subtle) throw new Error('Web Crypto unavailable');
        const response = await fetch(reader.dataset.payloadUrl!, { signal: controller.signal, credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer' });
        if (!response.ok || Number(response.headers.get('content-length') ?? 0) > 32 * 1024 * 1024) throw new Error('Invalid response');
        const raw = await response.text();
        if (raw.length > 32 * 1024 * 1024) throw new Error('Invalid response');
        const decrypted = await decryptProtectedArticle(JSON.parse(raw), password, reader.dataset.articleId!);
        password = '';
        if (generation !== attempt) return;
        prepared = prepareContent(decrypted);
        if (generation !== attempt) { prepared.revoke(); return; }
        revoke(); revoke = prepared.revoke;
        title.textContent = decrypted.title; description.textContent = decrypted.description;
        meta.textContent = [decrypted.pubDate, decrypted.category, ...decrypted.tags.map(tag => `#${tag}`)].filter(Boolean).join(' · ');
        body.replaceChildren(prepared.fragment);
        gate.hidden = true; article.hidden = false; status.textContent = '';
        title.focus(); window.scrollTo({ top: 0 });
      } catch {
        prepared?.revoke();
        if (generation === attempt) { status.textContent = '未能解锁，请检查密码，或联系作者确认链接。'; }
      } finally {
        password = '';
        if (generation === attempt) { input.disabled = false; submit.disabled = false; form.removeAttribute('aria-busy'); if (!article.hidden) input.value = ''; else input.focus(); }
      }
    });
    // The server renders an inert form. Enable it only after native submission
    // has been intercepted; the secret input also has no serializable name.
    input.disabled = false;
    submit.disabled = false;
    toggle.disabled = false;
  }
}
