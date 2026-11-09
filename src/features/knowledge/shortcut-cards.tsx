import { Fragment } from 'react';
import { Icon } from '@/components/ui/icon';
import { cx } from '@/lib/cx';
import type { ShortcutCard } from '@/lib/knowledge/shortcuts';

export function ShortcutKeys({ keys, className }: { keys: string[]; className?: string }) {
  return (
    <span className={cx('kb-shortcut__keys', className)}>
      <span className="sr-only">Kombinasi tombol: {keys.join(' + ')}. </span>
      <span aria-hidden="true">
        {keys.map((key, i) => (
          <Fragment key={`${key}-${i}`}>
            {i > 0 && <span className="kb-shortcut__plus">+</span>}
            <kbd className="kb-kbd">{key}</kbd>
          </Fragment>
        ))}
      </span>
    </span>
  );
}

export function ShortcutList({ shortcuts }: { shortcuts: ShortcutCard[] }) {
  if (shortcuts.length === 0) {
    return <p className="muted">Belum ada kartu shortcut pada entri ini.</p>;
  }
  return (
    <div className="kb-shortcuts">
      {shortcuts.map((shortcut, index) => (
        <article className="kb-shortcut" key={`${shortcut.label}-${index}`}>
          <span className="kb-shortcut__number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
          <h3 className="kb-shortcut__label">{shortcut.label}</h3>
          <ShortcutKeys keys={shortcut.keys} />
          {shortcut.note && <p className="kb-shortcut__note">{shortcut.note}</p>}
        </article>
      ))}
    </div>
  );
}

export function ShortcutCount({ count }: { count: number }) {
  return (
    <span className="kb-shortcut-count">
      <Icon name="keyboard" size={17} />
      {count} kartu shortcut
    </span>
  );
}
