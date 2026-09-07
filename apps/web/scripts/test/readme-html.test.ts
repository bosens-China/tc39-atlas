import { describe, expect, it } from 'vitest';

import { normalizeReadme } from '../proposal-document.js';

const repository = 'https://github.com/tc39/proposal-signals';

describe('README HTML resource URLs', () => {
  it('rewrites the Signals logo while preserving other HTML attributes', () => {
    const result = normalizeReadme(
      '<img align=right src="Signals.svg" alt="Signals logo" width=100>',
      repository,
    );
    expect(result).toContain(
      `<img align=right src="${repository}/raw/HEAD/Signals.svg" alt="Signals logo" width=100>`,
    );
  });

  it('handles quoted, unquoted and entity-encoded relative attributes', () => {
    const result = normalizeReadme(
      '<div><a href=./spec.html>Spec</a><img src=\'img/1a fortum.png\' width="180"><a href="./spec.html?a=1&amp;b=2#example">Details</a></div>',
      repository,
    );
    expect(result).toContain(`href="${repository}/blob/HEAD/spec.html"`);
    expect(result).toContain(`src="${repository}/raw/HEAD/img/1a fortum.png"`);
    expect(result).toContain(
      `href="${repository}/blob/HEAD/spec.html?a=1&amp;b=2#example"`,
    );
    expect(result).toContain('width="180"');
  });

  it('preserves wrappers split across Markdown nodes and code examples', () => {
    const source = [
      '<div class="example">',
      '',
      'Read the <a href="./spec.html">spec</a>.',
      '',
      '</div>',
      '',
      '```html',
      '<img src="example.png">',
      '```',
      '',
      '`<img src="inline.png">`',
    ].join('\n');
    const result = normalizeReadme(source, repository);
    expect(result).toContain('<div class="example">\n\n');
    expect(result).toContain(
      `<a href="${repository}/blob/HEAD/spec.html">spec</a>`,
    );
    expect(result.match(/<\/div>/g)).toHaveLength(1);
    expect(result).toContain('```html\n<img src="example.png">\n```');
    expect(result).toContain('`<img src="inline.png">`');
  });

  it('keeps absolute URLs, anchors and data URLs and normalizes protocol-relative URLs', () => {
    const html =
      '<a href="#motivation">Why</a><img src="https://example.com/a.svg"><img src="data:image/png;base64,AAA"><img src="//example.com/b.svg">';
    expect(normalizeReadme(html, repository).trim()).toBe(
      html.replace(
        'src="//example.com/b.svg"',
        'src="https://example.com/b.svg"',
      ),
    );
  });

  it('does not rewrite HTML-like text inside comments', () => {
    const html = '<!-- <img src="example.png"> -->';
    expect(normalizeReadme(html, repository).trim()).toBe(html);
  });
});
