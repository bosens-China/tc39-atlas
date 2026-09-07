import { parseFragment, type DefaultTreeAdapterTypes } from 'parse5';

export function repositoryFileUrl(
  repositoryUrl: string,
  value: string,
  kind: 'blob' | 'raw',
): string {
  if (value.startsWith('//')) return `https:${value}`;
  if (/^(?:[a-z][a-z\d+.-]*:|#)/i.test(value)) return value;
  const repository = repositoryUrl.replace(/\/$/, '');
  if (!repository.startsWith('https://github.com/')) return value;

  const suffixIndex = value.search(/[?#]/);
  const path = (suffixIndex === -1 ? value : value.slice(0, suffixIndex))
    .replace(/^\.\//, '')
    .replace(/^\/+/, '');
  const suffix = suffixIndex === -1 ? '' : value.slice(suffixIndex);
  return path ? `${repository}/${kind}/HEAD/${path}${suffix}` : value;
}

/** 只替换解析器定位的 URL 属性，避免重新序列化补闭合标签、破坏跨 Markdown 节点的 HTML。 */
export function normalizeHtmlUrls(html: string, repositoryUrl: string): string {
  const tree = parseFragment(html, { sourceCodeLocationInfo: true });
  const replacements: Array<{ start: number; end: number; value: string }> = [];

  function visit(node: DefaultTreeAdapterTypes.Node): void {
    if ('tagName' in node) {
      const name =
        node.tagName === 'img' ? 'src' : node.tagName === 'a' ? 'href' : null;
      const attribute = node.attrs.find((item) => item.name === name);
      const location = name
        ? node.sourceCodeLocation?.attrs?.[name]
        : undefined;
      if (attribute && location) {
        const url = repositoryFileUrl(
          repositoryUrl,
          attribute.value,
          name === 'src' ? 'raw' : 'blob',
        );
        if (url !== attribute.value) {
          const escaped = url
            .replaceAll('&', '&amp;')
            .replaceAll('"', '&quot;');
          replacements.push({
            start: location.startOffset,
            end: location.endOffset,
            value: `${name}="${escaped}"`,
          });
        }
      }
    }
    if ('childNodes' in node) node.childNodes.forEach(visit);
    if ('content' in node) visit(node.content);
  }

  visit(tree);
  // 从后向前修改，保持解析器给出的原始偏移有效。
  for (const { start, end, value } of replacements.sort(
    (a, b) => b.start - a.start,
  )) {
    html = html.slice(0, start) + value + html.slice(end);
  }
  return html;
}
