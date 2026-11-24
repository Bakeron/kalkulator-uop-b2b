/**
 * An amount whose digits roll like a drum counter when it changes (assumption A8 a: "kwoty
 * przewijają cyfry jak licznik bębnowy"). The reels are keyed from the right, so units stay
 * units when the number gets longer. A screen reader gets the plain text; with "reduce motion"
 * the digits change at once (--t is 0).
 */
export default function Rolling({ text, className }: { text: string; className?: string }) {
  const chars = [...text];
  return (
    <span className={`roll${className ? ` ${className}` : ""}`}>
      <span className="sr-only">{text}</span>
      <span className="roll__vis" aria-hidden="true">
        {chars.map((ch, i) => {
          const key = chars.length - i;
          if (!/\d/.test(ch)) return <span key={`c${key}${ch}`}>{ch}</span>;
          return (
            <span key={`d${key}`} className="roll__reel">
              <span className="roll__strip" style={{ transform: `translateY(${-Number(ch) * 10}%)` }}>
                {DIGITS.map((d) => (
                  <span key={d}>{d}</span>
                ))}
              </span>
            </span>
          );
        })}
      </span>
    </span>
  );
}

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
