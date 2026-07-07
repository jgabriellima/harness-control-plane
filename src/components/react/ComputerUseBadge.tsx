import React, { useEffect, useState } from 'react';

export default function ComputerUseBadge() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      try {
        const response = await fetch('/api/settings/computer-use');
        if (!response.ok) {
          return;
        }
        const payload = (await response.json()) as { active?: boolean };
        if (!cancelled) {
          setActive(payload.active === true);
        }
      } catch {
        // ignore
      }
    }

    void load();
    const interval = window.setInterval(() => {
      void load();
    }, 10_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  if (!active) {
    return null;
  }

  return (
    <span
      className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800"
      data-testid="computer-use-badge"
      title="Computer Use is active — agent can control native apps"
    >
      CUA
    </span>
  );
}
