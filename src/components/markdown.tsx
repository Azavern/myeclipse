import { Fragment, type ReactNode } from 'react';
import { CopyButton } from '@/components/copy-button';
import { cx } from '@/lib/cx';
import {
  parseInline, parseMarkdown, tocOf,
  type InlineToken, type ListItem, type MarkdownBlock, type TableAlign,
} from '@/lib/knowledge/markdown';

// Renderer Markdown dari token sendiri. Tidak ada HTML mentah dan tidak ada
// dangerouslySetInnerHTML; tautan dan gambar hanya https (lihat lib/knowledge/markdown.ts).
function Text({ value }: { value: string }) {
  const parts = value.split('\n');
  return (
    <>
      {parts.map((part, i) => (
        <Fragment key={i}>{i > 0 && <br />}{part}</Fragment>
      ))}
    </>
  );
}

function Inline({ tokens }: { tokens: InlineToken[] }): ReactNode {
  return tokens.map((t, i) => {
    const key = `${i}-${t.t}`;
    if (t.t === 'text') return <Text key={key} value={t.v} />;
    if (t.t === 'code') return <code key={key} className="kb-md__code-inline">{t.v}</code>;
    if (t.t === 'strong') return <strong key={key}><Inline tokens={t.v} /></strong>;
    if (t.t === 'em') return <em key={key}><Inline tokens={t.v} /></em>;
    if (t.t === 'del') return <del key={key}><Inline tokens={t.v} /></del>;
    if (t.t === 'image') {
      return (
        <img key={key} src={t.src} alt={t.alt} title={t.title} loading="lazy" decoding="async"
          referrerPolicy="no-referrer" className="kb-md__img" />
      );
    }
    return (
      <a key={key} href={t.href} title={t.title} target="_blank" rel="noopener noreferrer">
        <Inline tokens={t.v} /><span className="sr-only"> (dibuka di tab baru)</span>
      </a>
    );
  });
}

const cellClass = (align: TableAlign) => cx('kb-md__cell', align !== 'left' && `kb-md__cell--${align}`);

function ListView({ block }: { block: Extract<MarkdownBlock, { kind: 'list' }> }) {
  const items = block.items.map((item: ListItem, i) => (
    <li key={i} className={item.checked === null ? undefined : 'kb-md__task'}>
      {item.checked !== null && (
        <input type="checkbox" checked={item.checked} disabled
          aria-label={item.checked ? 'Tugas selesai' : 'Tugas belum selesai'} />
      )}
      <Inline tokens={parseInline(item.text)} />
      {item.children.map((child, j) => <BlockView key={j} block={child} />)}
    </li>
  ));
  return block.ordered ? <ol>{items}</ol> : <ul>{items}</ul>;
}

function BlockView({ block }: { block: MarkdownBlock }) {
  if (block.kind === 'heading') {
    const Tag = `h${block.level}` as 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
    return <Tag id={block.id}><Inline tokens={parseInline(block.text)} /></Tag>;
  }
  if (block.kind === 'paragraph') return <p><Inline tokens={parseInline(block.text)} /></p>;
  if (block.kind === 'quote') {
    return (
      <blockquote>
        {block.blocks.map((inner, i) => <BlockView key={i} block={inner} />)}
      </blockquote>
    );
  }
  if (block.kind === 'hr') return <hr />;
  if (block.kind === 'list') return <ListView block={block} />;
  if (block.kind === 'table') {
    return (
      <div className="kb-md__table-wrap">
        <table>
          <thead>
            <tr>
              {block.header.map((cell, i) => (
                <th key={i} scope="col" className={cellClass(block.align[i] ?? 'left')}>
                  <Inline tokens={parseInline(cell)} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, r) => (
              <tr key={r}>
                {block.header.map((_, c) => (
                  <td key={c} className={cellClass(block.align[c] ?? 'left')}>
                    <Inline tokens={parseInline(row[c] ?? '')} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
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
