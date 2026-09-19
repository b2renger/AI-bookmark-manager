import type { Platform } from './dto.js';

// Port of the detection ladder in legacy/server.ts (lines 191–203), plus `.pdf`. Order matters:
// the first hit wins, and `website` is the floor. `article` is never guessed here — it is what
// acquisition (P3) sets once it has actually extracted an article body.

export function detectPlatform(url: string): Platform {
  const u = url.toLowerCase();
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube';
  if (u.includes('threads.net') || u.includes('threads.com')) return 'threads';
  if (u.includes('twitter.com') || u.includes('x.com')) return 'twitter';
  if (u.includes('github.com')) return 'github';
  if (/\.pdf(?:[?#]|$)/.test(u)) return 'pdf';
  return 'website';
}
