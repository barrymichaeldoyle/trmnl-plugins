// Self-contained so Playwright can evaluate it in the rendered document.
export function measureReview({ expected, missingTitle, missingText, qr, recovery, minFontSize = 16, minFill = 45 }) {
  const errors = [];
  // Warnings flag legibility and wasted space; they never fail a run.
  const warnings = [];
  let typography = null;
  const overflowFragments = [];
  const passage = document.querySelector('[data-verse-id]');
  const reference = document.querySelector('[data-footer-reference]');
  const view = document.querySelector('.view');
  const layout = document.querySelector('.layout');
  const rect = element => {
    const b = element.getBoundingClientRect();
    return { left: b.left, top: b.top, right: b.right, bottom: b.bottom, width: b.width, height: b.height };
  };
  // DOM text ranges include font line-box rounding. Express the tolerance in
  // logical pixels, matching the framework's physical scaling on TRMNL X.
  const scale = view?.offsetWidth ? rect(view).width / view.offsetWidth : 1;
  const inside = (inner, outer, tolerance = 1.5 * scale) => inner.left >= outer.left - tolerance && inner.top >= outer.top - tolerance && inner.right <= outer.right + tolerance && inner.bottom <= outer.bottom + tolerance;
  const visible = element => { const style = getComputedStyle(element); return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0 && element.getBoundingClientRect().height > 0; };
  const text = element => element?.textContent.replace(/\s+/g, ' ').trim() ?? '';
  const normalize = value => value.replace(/\s+/g, ' ').trim();
  if (!view || !layout || !reference) errors.push('Missing view, layout, or reference.');
  if (expected) {
    if (!passage || passage.dataset.verseId !== expected.id) errors.push('The selected passage does not match the case.');
    if (text(passage) !== normalize(expected.text)) errors.push('Scripture text differs from the complete publisher passage.');
    if (text(reference) !== normalize(expected.reference)) errors.push('Reference differs from the selected passage.');
    if (passage && layout && !inside(rect(passage), rect(layout))) errors.push('Passage extends outside the reading area.');
    if (passage && !visible(passage)) errors.push('Passage is hidden.');
    if (passage) {
      // Check text fragments against each clipping ancestor. A complete DOM string
      // alone misses line clamps, overflow clipping, and deliberately hidden text.
      const walker = document.createTreeWalker(passage, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (!node.textContent.trim()) continue;
        if (!visible(node.parentElement)) { errors.push('A Scripture text fragment is hidden.'); break; }
        const range = document.createRange(); range.selectNodeContents(node);
        const bounds = Array.from(range.getClientRects());
        if (!bounds.length || bounds.some(b => !view || !inside(b, rect(view)))) {
          overflowFragments.push(...bounds.filter(b => !view || !inside(b, rect(view))).map(b => ({ left: b.left, top: b.top, right: b.right, bottom: b.bottom })));
          errors.push('Scripture text fragments extend outside the view.'); break;
        }
        for (let ancestor = node.parentElement; ancestor && ancestor !== document.body; ancestor = ancestor.parentElement) {
          const style = getComputedStyle(ancestor);
          if (!visible(ancestor)) errors.push('A Scripture ancestor is hidden.');
          if (/(hidden|clip|scroll|auto)/.test(`${style.overflowX} ${style.overflowY}`) && bounds.some(b => !inside(b, rect(ancestor)))) { errors.push('An ancestor clips Scripture text.'); break; }
          if (style.webkitLineClamp !== 'none' && Number(style.webkitLineClamp) > 0) errors.push('Scripture has a line clamp.');
        }
      }
    }
    // Responsive markup may hold an alternate QR for the other orientation.
    const context = Array.from(document.querySelectorAll('[data-context-url]')).find(visible) ?? null;
    if (qr && (!context || context.dataset.contextUrl !== expected.source)) errors.push('QR link is missing or points to the wrong chapter.');
    if (!qr && context) errors.push('QR is visible when disabled.');
    // Text may wrap around pinned artwork, so compare rendered lines, not the
    // paragraph box, against the QR code and each visible cross.
    if (passage) {
      // Text rects span the font's content area, which exceeds tight leading.
      // Floats and readers see the line box, so trim each rect to it.
      const lines = [];
      const textNodes = document.createTreeWalker(passage, NodeFilter.SHOW_TEXT);
      for (let node; (node = textNodes.nextNode());) {
        const range = document.createRange(); range.selectNodeContents(node);
        const lineHeight = parseFloat(getComputedStyle(node.parentElement).lineHeight) * scale;
        lines.push(...Array.from(range.getClientRects()).filter(b => b.width > 1 && b.height > 1).map(b => {
          const trim = Number.isFinite(lineHeight) ? Math.max(0, (b.height - lineHeight) / 2) : 0;
          return { left: b.left, right: b.right, top: b.top + trim, bottom: b.bottom - trim };
        }));
      }
      const overlaps = element => lines.some(a => { const b = rect(element); return Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1; });
      if (context && overlaps(context)) errors.push('Passage overlaps the QR code.');
      if (Array.from(document.querySelectorAll('[data-reading-cross]')).some(cross => cross.getClientRects().length && visible(cross) && overlaps(cross))) errors.push('Passage overlaps the cross.');
      if (lines.length) {
        const top = Math.min(...lines.map(b => b.top)), bottom = Math.max(...lines.map(b => b.bottom));
        const metrics = getComputedStyle(layout);
        const content = rect(layout).height - (parseFloat(metrics.paddingTop) + parseFloat(metrics.paddingBottom)) * scale;
        // The unfitted size is the markup's responsive starting class.
        // Its min-content width shows whether a long word, not reserved space, forced shrinking.
        const probe = passage.cloneNode(true); probe.removeAttribute('style'); probe.removeAttribute('data-verse-id');
        Object.assign(probe.style, { position: 'absolute', visibility: 'hidden', width: 'min-content', minWidth: '0' });
        passage.parentElement.append(probe);
        const wordBound = probe.getBoundingClientRect().width > passage.parentElement.getBoundingClientRect().width;
        typography = { fontSize: parseFloat(getComputedStyle(passage).fontSize), startSize: parseFloat(getComputedStyle(probe).fontSize), fill: content > 0 ? Math.round(100 * (bottom - top) / content) : null, lines: new Set(lines.map(b => Math.round(b.top))).size, wordBound };
        probe.remove();
        if (typography.fontSize < minFontSize) warnings.push(`Scripture fits at ${typography.fontSize}px, below the ${minFontSize}px legibility floor.`);
        if (typography.fontSize < typography.startSize && !wordBound && typography.fill < minFill) warnings.push(`Scripture shrank to ${typography.fontSize}px while filling ${typography.fill}% of the layout; reserved space may be wasted.`);
      }
    }
  } else if (recovery) {
    if (passage) errors.push('Recovery displays a stale passage.');
    // Compact views intentionally omit the recovery heading; the instruction
    // must remain present and visible in every view.
    if (!text(layout).includes(missingText)) errors.push('Recovery message is missing.');
    const message = layout?.querySelector('.description');
    if (message && (!visible(message) || view && !inside(rect(message), rect(view)))) errors.push('Recovery instruction is clipped or hidden.');
  }
  const viewport = { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
  if (reference && view && (!inside(rect(reference), rect(view)) || !inside(rect(reference), viewport) || !visible(reference))) errors.push('Reference is clipped or hidden.');
  for (const image of document.images) {
    if (!image.complete || !image.naturalWidth) errors.push('An image failed to load.');
    // Responsive markup includes alternative images hidden by their ancestors.
    // Such images have no rendered box and cannot clip the current orientation.
    if (image.getClientRects().length && visible(image) && view && (!inside(rect(image), rect(view)) || !inside(rect(image), viewport))) errors.push('An image extends outside the view.');
  }
  return { errors: [...new Set(errors)], warnings, typography, overflowFragments, actualPassageId: passage?.dataset.verseId ?? null, actualReference: text(reference), fontSize: passage ? getComputedStyle(passage).fontSize : null, passageBounds: passage ? rect(passage) : null, referenceBounds: reference ? rect(reference) : null, viewBounds: view ? rect(view) : null };
}
