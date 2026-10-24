import type { ReactNode } from 'react';
import { CopyButton } from '@/components/copy-button';
import { cx } from '@/lib/cx';
import { parseInline, parseMarkdown, tocOf, type InlineToken, type MarkdownBlock } from '@/lib/knowledge/markdown';

// Renderer Markdown dari token sendiri. Tidak ada HTML mentah dan tidak ada
// dangerouslySetInnerHTML; tautan hanya https (lihat lib/knowledge/markdown.ts).
function Inline({ tokens }: { tokens: InlineToken[] }): ReactNode {
  return tokens.map((t, i) => {
    const key = `${i}-${t.t}`;
    if (t.t === 'text') return <span key={key}>{t.v}</span>;
    if (t.t === 'code') return <code key={key} className="kb-md__code-inline">{t.v}</code>;
    if (t.t === 'strong') return <strong key={key}><Inline tokens={t.v} /></strong>;
    if (t.t === 'em') return <em key={key}><Inline tokens={t.v} /></em>;
    if (t.t === 'del') return <del key={key}><Inline tokens={t.v} /></del>;
    return (
      <a key={key} href={t.href} target="_blank" rel="noopener noreferrer">
        <Inline tokens={t.v} /><span className="sr-only"> (dibuka di tab baru)</span>
      </a>
    );
  });
}

function BlockView({ block }: { block: MarkdownBlock }) {
  if (block.kind === 'heading') {
    if (block.level === 2) return <h2 id={block.id}><Inline tokens={parseInline(block.text)} /></h2>;
    if (block.level === 3) return <h3 id={block.id}><Inline tokens={parseInline(block.text)} /></h3>;
    return <h4 id={block.id}><Inline tokens={parseInline(block.text)} /></h4>;
  }
  if (block.kind === 'paragraph') return <p><Inline tokens={parseInline(block.text)} /></p>;
  if (block.kind === 'quote') return <blockquote><p><Inline tokens={parseInline(block.text)} /></p></blockquote>;
  if (block.kind === 'hr') return <hr />;
  if (block.kind === 'list') {
    const items = block.items.map((item, i) => <li key={i}><Inline tokens={parseInline(item)} /></li>);
    return block.ordered ? <ol>{items}</ol> : <ul>{items}</ul>;
  }
  return (
    <div className="kb-code">
      <div className="kb-code__bar">
        <span>{block.lang || 'kode'}</span>
        <CopyButton text={block.code} label="Salin kode" />
      </div>
      <pre><code>{block.code}</code></pre>
    </div>
  );
}

// Blok yang berubah pada suntingan terakhir diberi latar dan penanda teks untuk
// pembaca layar. Penanda hanya hiasan; konten tersimpan tidak pernah diubah.
export function Markdown({ source, highlights, className }: { source: string; highlights?: number[]; className?: string }) {
  const blocks = parseMarkdown(source);
  const changed = new Set(highlights ?? []);
  return (
    <div className={cx('kb-md prose', className)}>
      {blocks.map((block, i) => {
        const edited = changed.has(i);
        return (
          <div key={i} className={cx('kb-block', edited && 'kb-block--edited')}>
            {edited && <span className="sr-only kb-mark">Bagian yang berubah pada suntingan terakhir. </span>}
            <BlockView block={block} />
          </div>
        );
      })}
    </div>
  );
}

export function MarkdownToc({ source }: { source: string }) {
  const toc = tocOf(parseMarkdown(source));
  if (toc.length === 0) return null;
  return (
    <nav className="kb-toc" aria-labelledby="kb-toc-title">
      <h2 id="kb-toc-title" className="card__title">Di halaman ini</h2>
      <ol>
        {toc.map((h) => (
          <li key={h.id} className={`kb-toc__l${h.level}`}><a href={`#${h.id}`}>{h.text}</a></li>
        ))}
      </ol>
    </nav>
  );
}
