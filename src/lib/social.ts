export const SOCIAL_PLATFORMS = ['instagram', 'linkedin', 'github', 'tiktok', 'x', 'website', 'custom'] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

const HOSTS: Record<string, string[]> = {
  instagram: ['instagram.com'],
  linkedin: ['linkedin.com'],
  github: ['github.com'],
  tiktok: ['tiktok.com'],
  x: ['x.com', 'twitter.com'],
};

// Platform dengan host tetap harus memakai domain resminya; website/custom bebas
// selama URL https valid. Dipakai Server Action dan API v1.
export function socialHostOk(platform: string, url: string): boolean {
  const allowed = HOSTS[platform];
  if (!allowed) return true;
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return allowed.some((domain) => host === domain || host.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}
