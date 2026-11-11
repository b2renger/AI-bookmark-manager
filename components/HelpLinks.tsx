import React from 'react';

const GUIDE_URL = 'https://github.com/b2renger/AI-bookmark-manager/blob/main/docs/SETUP.md';

/** Link to a section of the setup guide. */
export const guideUrl = (anchor: string): string => `${GUIDE_URL}#${anchor}`;

interface HelpLinksProps {
  links: { label: string; href: string }[];
}

/** "Where do I get this?" links shown under a settings field. */
export const HelpLinks: React.FC<HelpLinksProps> = ({ links }) => {
  if (links.length === 0) return null;
  return (
    <p className="mt-2 text-xs flex flex-wrap gap-x-4 gap-y-1">
      {links.map((link) => (
        <a
          key={link.href}
          href={link.href}
          target="_blank"
          rel="noreferrer"
          className="text-blue-600 dark:text-blue-400 hover:underline"
        >
          {link.label} ↗
        </a>
      ))}
    </p>
  );
};
