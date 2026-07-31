import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readProjectFile = (path: string): string => readFileSync(path, 'utf8');

const markdownLinkTargets = (markdown: string): readonly string[] =>
  [...markdown.matchAll(/\]\(([^)\s]+)/g)].map((match) => match[1]);

describe('RELEASE_NOTES.md links', () => {
  // RELEASE_NOTES.md is used as-is as the GitHub Release body (`body_path` in
  // release.yml). GitHub resolves relative links in a release body against the
  // tag, so `docs/INSTALLATION.md` on the v0.6.0 page renders as
  // `/blob/v0.6.0/docs/INSTALLATION.md` and pins that page to the docs as they
  // were when the tag was cut. Every later correction to the instructions stops
  // at the release page users actually land on, and a published body can only be
  // fixed by editing it by hand. Absolute links to `main` keep following the docs.
  it('points at repo files with absolute URLs, never relative paths', () => {
    const offenders = markdownLinkTargets(readProjectFile('RELEASE_NOTES.md')).filter(
      (target) => !target.startsWith('https://') && !target.startsWith('#'),
    );

    expect(offenders).toEqual([]);
  });

  it('sends readers to the installation instructions instead of restating them', () => {
    expect(readProjectFile('RELEASE_NOTES.md')).toContain(
      'https://github.com/orainlabs/jellytunes#installation',
    );
  });
});
