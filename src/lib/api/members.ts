export const MEMBER_PROFILE_FIELDS = 'user_id,username,full_name,nickname,bio';

export type MemberProfileRow = {
  user_id: string; username: string; full_name: string;
  nickname: string | null; bio: string | null;
};

export type MemberMeta = { status: string | null; role_id: string | null; role_name: string | null; joined_at: string | null };

// Bentuk respons kanonis, dipakai daftar dan detail supaya klien tidak menerima
// dua struktur berbeda untuk entitas yang sama.
export function shapeMember(profile: MemberProfileRow, meta: MemberMeta | null) {
  return {
    user_id: profile.user_id,
    username: profile.username,
    full_name: profile.full_name,
    nickname: profile.nickname,
    bio: profile.bio,
    role: meta?.role_name ?? null,
    role_id: meta?.role_id ?? null,
    status: meta?.status ?? null,
    joined_at: meta?.joined_at ?? null,
  };
}
