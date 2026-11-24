import type { KeyboardEvent } from "react";

/** A row of tabs (WAI-ARIA tabs: arrows, Home and End move between them). */
export default function Tabs<K extends string>({
  items,
  chosen,
  onChange,
  label,
  prefix,
  className,
  panelOf = (k) => `panel-${k}`,
}: {
  items: readonly { key: K; label: string }[];
  chosen: K;
  onChange: (k: K) => void;
  label: string;
  prefix: string;
  className: string;
  /** Where each tab's panel is: `panel-<key>` by default. */
  panelOf?: (k: K) => string;
}) {
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = items.findIndex((t) => t.key === chosen);
    const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: items.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    const t = items[(next + items.length) % items.length]!;
    onChange(t.key);
    document.getElementById(`${prefix}-${t.key}`)?.focus();
  };
  return (
    <div className={className} role="tablist" aria-label={label} onKeyDown={onKey} data-mark='[aria-selected="true"]'>
      {items.map((t) => (
        <button
          key={t.key}
          id={`${prefix}-${t.key}`}
          type="button"
          role="tab"
          aria-selected={t.key === chosen}
          aria-controls={panelOf(t.key)}
          tabIndex={t.key === chosen ? 0 : -1}
          onClick={() => onChange(t.key)}
          data-text={t.label}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
