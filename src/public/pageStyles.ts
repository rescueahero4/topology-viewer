// `pageStyles`: the stylesheets of the page also apply inside the viewer, so that a class such as a
// Tailwind utility works on a part. A `<link>` is copied as a `<link>`, which needs no CORS; a
// `<style>` becomes a constructed sheet, which needs no `unsafe-inline`.

function styleTextOf(el: HTMLStyleElement): string {
  try {
    return [...(el.sheet?.cssRules ?? [])].map((rule) => rule.cssText).join("\n");
  } catch {
    return el.textContent ?? "";
  }
}

export function followPageStyles(
  host: HTMLElement,
  root: ShadowRoot,
  on: () => boolean,
  apply: (sheets: readonly CSSStyleSheet[]) => void,
): () => void {
  const doc = host.ownerDocument;
  const links = new Map<string, HTMLLinkElement>();
  let lastText: string | null = null;

  const sync = () => {
    if (!on()) {
      if (links.size === 0 && lastText === null) return;
      for (const link of links.values()) link.remove();
      links.clear();
      lastText = null;
      apply([]);
      return;
    }
    const wanted = new Set<string>();
    for (const link of doc.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')) {
      if (link.href === "" || link.disabled) continue;
      wanted.add(link.href);
      if (links.has(link.href)) continue;
      const copy = doc.createElement("link");
      copy.rel = "stylesheet";
      copy.href = link.href;
      if (link.media !== "") copy.media = link.media;
      if (link.crossOrigin !== null) copy.crossOrigin = link.crossOrigin;
      if (link.nonce !== undefined && link.nonce !== "") copy.nonce = link.nonce;
      root.appendChild(copy);
      links.set(link.href, copy);
    }
    for (const [href, link] of links)
      if (!wanted.has(href)) {
        link.remove();
        links.delete(href);
      }
    const text = [...doc.querySelectorAll<HTMLStyleElement>("style")]
      .map(styleTextOf)
      .join("\n");
    if (text === lastText) return;
    lastText = text;
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(text);
    apply([sheet]);
  };

  // A framework can add a style at any time, and a dev server changes them on each save.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const later = () => {
    clearTimeout(timer);
    timer = setTimeout(sync, 50);
  };
  const watch = new MutationObserver(later);
  watch.observe(doc.head, { childList: true, subtree: true, characterData: true });
  sync();
  // The option can turn on later, with the next update of the viewer.
  const poll = setInterval(() => {
    if (on() !== (links.size > 0 || lastText !== null)) sync();
  }, 500);

  return () => {
    clearTimeout(timer);
    clearInterval(poll);
    watch.disconnect();
    for (const link of links.values()) link.remove();
    links.clear();
  };
}
