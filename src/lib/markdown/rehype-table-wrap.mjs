/**
 * Avvolge le tabelle Markdown in un contenitore scorrevole accessibile da tastiera
 * (WCAG 2.1.1 – axe "scrollable-region-focusable"). Il contenitore prende come nome
 * accessibile il titolo (h2–h4) che precede la tabella.
 */
const text = (node) =>
  node.type === 'text' ? node.value : (node.children ?? []).map(text).join('');

export default function rehypeTableWrap() {
  const visit = (node) => {
    if (!node.children) return;
    let lastHeading = '';
    node.children = node.children.map((child) => {
      if (child.type === 'element' && /^h[2-4]$/.test(child.tagName)) lastHeading = text(child).trim();
      if (child.type === 'element' && child.tagName === 'table') {
        return {
          type: 'element',
          tagName: 'section',
          properties: {
            className: ['table-wrap'],
            tabIndex: 0,
            ariaLabel: lastHeading || 'Table',
          },
          children: [child],
        };
      }
      visit(child);
      return child;
    });
  };
  return (tree) => visit(tree);
}
