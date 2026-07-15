'use client';

import React from 'react';
import { Settings, Sparkles, Terminal } from 'lucide-react';

export default function DesignEntryTopBar() {
  return (
    <div className="entry-main__topbar" data-testid="design-entry-topbar">
      <div className="entry-main__topbar-chips entry-main__topbar-chips--icon-only">
        <a
          href="https://github.com/open-design-ai/open-design"
          target="_blank"
          rel="noreferrer"
          className="entry-github-star od-tooltip"
          data-tooltip="Star on GitHub"
          data-tooltip-placement="bottom"
          aria-label="Star on GitHub"
        >
          <span aria-hidden>★</span>
          <span className="entry-github-star__count">55.7K</span>
        </a>
        <a
          href="https://discord.gg/open-design"
          target="_blank"
          rel="noreferrer"
          className="entry-discord-badge od-tooltip"
          data-tooltip="Join Discord"
          data-tooltip-placement="bottom"
          aria-label="Join Discord"
        >
          <span className="entry-discord-badge__label">Join Discord</span>
        </a>
        <button
          type="button"
          className="inline-switcher__chip od-tooltip"
          data-tooltip="Local CLI online"
          data-tooltip-placement="bottom"
          aria-label="Local CLI"
        >
          <Terminal size={14} strokeWidth={1.75} />
          <span className="inline-switcher__chip-label">Local CLI</span>
          <span className="inline-switcher__chip-dot" aria-hidden />
        </button>
        <button type="button" className="use-everywhere-chip od-tooltip" data-tooltip="Use everywhere">
          <Sparkles size={14} strokeWidth={1.75} />
          <span>Use everywhere</span>
        </button>
        <button
          type="button"
          className="entry-settings-btn od-tooltip"
          data-tooltip="Settings"
          data-tooltip-placement="bottom"
          aria-label="Settings"
        >
          <Settings size={15} strokeWidth={1.75} />
        </button>
      </div>
    </div>
  );
}
