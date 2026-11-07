import Link from 'next/link';
import { Avatar, Chip, type Tone } from '@/components/ui/primitives';
import type { IconName } from '@/components/ui/icon';

export type MemberItem = { username: string; full_name: string; nickname?: string | null; role_name: string; status?: string; avatar_path?: string | null };

const STATUS: Record<string, { label: string; tone: Tone; icon: IconName }> = {
  invited: { label: 'Menunggu aktivasi', tone: 'warning', icon: 'hourglass' },
  active: { label: 'Aktif', tone: 'success', icon: 'check-circle' },
  inactive: { label: 'Nonaktif', tone: 'neutral', icon: 'lock' },
};

// Status selalu berupa teks + ikon, bukan warna saja (DESIGN.md §6).
export function MemberStatusChip({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, tone: 'neutral' as Tone, icon: 'info' as IconName };
  return <Chip tone={s.tone} icon={s.icon}>{s.label}</Chip>;
}

export function MemberCard({ m, avatar, hideDefaultRole }: { m: MemberItem; avatar?: string; hideDefaultRole?: boolean }) {
  const role = hideDefaultRole && m.role_name.trim().toLowerCase() === 'member' ? null : m.role_name;
  const detail = m.nickname && role ? `${m.nickname} · ${role}` : m.nickname ?? role;
  return (
    <li>
      <Link data-ui="panel" href={`/members/${m.username}`} className="card card--link member-card">
        <Avatar name={m.full_name} seed={m.username} src={avatar} size="lg" />
        <span className="member-card__body">
          <span className="member-card__name">{m.full_name}</span>
          {detail && <span className="muted">{detail}</span>}
          {m.status && m.status !== 'active' && <MemberStatusChip status={m.status} />}
        </span>
      </Link>
    </li>
  );
}
