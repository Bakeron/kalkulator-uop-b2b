/**
 * Something that shows up only sometimes (a field after a tick, a note, a report) - never at once
 * ("nic zerojedynkowo", assumption A9): it opens from zero height while fading in, and on the way
 * out it stays on the page, closing, until the movement ends. Children may be a function, so
 * they are built only while shown (`{() => <Field value={x!.amount} />}`). The closing copy is
 * the last one shown and cannot be used (inert). With "Ogranicz animacje" it comes and goes at once.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { motionReduced } from "./motion";

/** A little longer than --t (220 ms), so the closing movement ends before the copy goes. */
const LEAVE_MS = 260;

export default function Reveal({ show, inline = false, children }: { show: boolean; inline?: boolean; children: ReactNode | (() => ReactNode) }) {
  const [mounted, setMounted] = useState(show);
  if (show && !mounted) setMounted(true);
  const kept = useRef<ReactNode>(null);
  if (show) kept.current = typeof children === "function" ? children() : children;
  useEffect(() => {
    if (show || !mounted) return;
    const id = setTimeout(() => setMounted(false), motionReduced() ? 0 : LEAVE_MS);
    return () => clearTimeout(id);
  }, [show, mounted]);
  if (!mounted) return null;
  const Tag = inline ? "span" : "div";
  return (
    <Tag className={`reveal${show ? " reveal--open" : ""}`} inert={!show}>
      <Tag className="reveal__in">{kept.current}</Tag>
    </Tag>
  );
}
