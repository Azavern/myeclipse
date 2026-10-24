export const KB_STATUS_LABEL: Record<string, string> = {
  draft: 'Draf', published: 'Terbit', archived: 'Diarsipkan',
};

export const KB_VISIBILITY_LABEL: Record<string, string> = {
  public: 'Publik', unlisted: 'Tautan saja', class_only: 'Anggota kelas', private: 'Pribadi',
};

export const KB_VISIBILITY_HINT: Record<string, string> = {
  public: 'Siapa saja bisa membaca dan entri muncul di penjelajah.',
  unlisted: 'Siapa saja yang punya tautan bisa membaca, tetapi tidak muncul di penjelajah.',
  class_only: 'Hanya anggota kelas yang aktif yang bisa membaca.',
  private: 'Hanya kamu, editor yang disetujui, dan Ketua yang bisa membaca.',
};

export const KB_REQUEST_LABEL: Record<string, string> = {
  pending_author: 'Menunggu penulis', escalated: 'Diteruskan ke Ketua', approved: 'Disetujui',
  rejected: 'Ditolak', revoked: 'Dicabut', expired: 'Kedaluwarsa',
};

export const KB_VISIBILITY_OPTIONS = [
  ['public', KB_VISIBILITY_LABEL.public],
  ['unlisted', KB_VISIBILITY_LABEL.unlisted],
  ['class_only', KB_VISIBILITY_LABEL.class_only],
  ['private', KB_VISIBILITY_LABEL.private],
] as const;

export const KB_AUDIT_LABEL: Record<string, string> = {
  visibility_changed: 'Visibilitas diubah', edit_requested: 'Permintaan edit dikirim',
  edit_escalated: 'Permintaan diteruskan', edit_approved: 'Permintaan disetujui',
  edit_rejected: 'Permintaan ditolak', edit_revoked: 'Akses edit dicabut',
  editor_granted: 'Akses edit diberikan',
};
