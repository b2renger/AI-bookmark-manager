import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { PlatformBadge, detectPlatform } from './PlatformBadge.js';
import type { TFn } from './types.js';

afterEach(cleanup);

const t: TFn = (key) => key;

describe('detectPlatform', () => {
  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'youtube', 'video'],
    ['https://youtu.be/dQw4w9WgXcQ', 'youtube', 'video'],
    ['https://www.youtube.com/shorts/abc123', 'youtube', 'short'],
    ['https://www.youtube.com/playlist?list=PL123', 'youtube', 'playlist'],
    ['https://www.youtube.com/watch?v=a&list=PL123', 'youtube', 'playlist'],
  ])('%s → %s/%s', (url, key, variant) => {
    expect(detectPlatform(url)).toEqual({ key, variant });
  });

  it.each([
    ['https://www.threads.net/@zuck/post/1', 'threads'],
    ['https://www.threads.com/@zuck/post/1', 'threads'],
    ['https://twitter.com/jack/status/1', 'twitter'],
    ['https://x.com/jack/status/1', 'twitter'],
    ['https://github.com/anthropics/claude-code', 'github'],
    ['https://example.com/paper.pdf', 'pdf'],
    ['https://example.com/paper.pdf?dl=1', 'pdf'],
    ['https://example.com/some-article', 'website'],
  ])('%s → %s', (url, key) => {
    expect(detectPlatform(url).key).toBe(key);
    expect(detectPlatform(url).variant).toBeNull();
  });

  it('lets the stored platform column win over the URL', () => {
    expect(detectPlatform('https://example.com/x', 'article').key).toBe('article');
    expect(detectPlatform('https://example.com/x', 'youtube')).toEqual({
      key: 'youtube',
      variant: 'video',
    });
  });
});

describe('PlatformBadge', () => {
  it('exposes the detected platform and variant on the DOM', () => {
    render(<PlatformBadge t={t} url="https://www.youtube.com/shorts/x" />);
    const badge = screen.getByTestId('platform-badge');
    expect(badge.getAttribute('data-platform')).toBe('youtube');
    expect(badge.getAttribute('data-variant')).toBe('short');
    expect(badge.textContent).toContain('platform.youtubeShort');
  });

  it('prefixes handles on threads and X only', () => {
    const { unmount } = render(<PlatformBadge t={t} url="https://x.com/jack" author="jack" />);
    expect(screen.getByTestId('platform-badge').textContent).toContain('@jack');
    unmount();

    render(<PlatformBadge t={t} url="https://example.com/a" platform="article" author="Ada" />);
    expect(screen.getByTestId('platform-badge').textContent).toContain('Ada');
    expect(screen.getByTestId('platform-badge').textContent).not.toContain('@Ada');
  });

  it('renders icon-only in compact mode', () => {
    render(<PlatformBadge t={t} url="https://github.com/a/b" compact />);
    const badge = screen.getByTestId('platform-badge');
    expect(badge.getAttribute('data-platform')).toBe('github');
    expect(badge.querySelector('svg')).not.toBeNull();
  });
});
