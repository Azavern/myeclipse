'use client';
import { useMemo, useState } from 'react';
import { Icon } from '@/components/ui/icon';
import { EmptyState } from '@/components/ui/primitives';
import { MemberCard } from './member-card';

type Member = { username: string; full_name: string; nickname: string | null; role_name: string; status: string; avatar: string | null };

// Pencarian dan filter role dijalankan di klien atas daftar yang sudah dimuat server (maks. 100 anggota).
export function MemberDirectory({ members }: { members: Member[] }) {
  const [q, setQ] = useState('');
  const [role, setRole] = useState<string | null>(null);
  const roles = useMemo(() => [...new Set(members.map((m) => m.role_name))].sort(), [members]);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return members.filter((m) => (!role || m.role_name === role)
      && (!needle || m.full_name.toLowerCase().includes(needle) || (m.nickname ?? '').toLowerCase().includes(needle)));
  }, [members, q, role]);
  return (
    <>
      <div className="toolbar">
        <div className="search">
          <Icon name="search" size={18} />
          <input type="search" aria-label="Cari anggota" placeholder="Cari nama atau panggilan" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {roles.length > 1 && (
          <div className="cluster" role="group" aria-label="Filter role">
            <button type="button" className="filter-chip" aria-pressed={role === null} onClick={() => setRole(null)}>Semua</button>
            {roles.map((r) => <button key={r} type="button" className="filter-chip" aria-pressed={role === r} onClick={() => setRole(role === r ? null : r)}>{r}</button>)}
          </div>)}
      </div>
      <p className="sr-only" role="status">{shown.length} anggota ditampilkan</p>
      {shown.length === 0
        ? <EmptyState icon="search" title="Tidak ada anggota yang cocok" compact>Coba kata kunci lain atau hapus filter.</EmptyState>
        : (
          <ul className="member-grid">{shown.map((m) => <MemberCard key={m.username} m={m} avatar={m.avatar ?? undefined} />)}</ul>)}
    </>
  );
}
