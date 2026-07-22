import { useState, useRef, useEffect, type ReactNode } from "react";

const MIN_CARD_WIDTH = 200;
const GAP = 16;

function getCardsPerRow(containerWidth: number) {
  if (containerWidth <= 0) return 1;
  return Math.max(
    1,
    Math.floor((containerWidth + GAP) / (MIN_CARD_WIDTH + GAP)),
  );
}

function chunkBalancedRows<T>(items: T[], maxPerRow: number): T[][] {
  const count = items.length;
  if (count === 0) return [];

  const rowCount = Math.ceil(count / maxPerRow);
  const rows: T[][] = [];
  let index = 0;
  let remaining = count;

  for (let i = 0; i < rowCount; i++) {
    const rowsLeft = rowCount - i;
    const size = Math.ceil(remaining / rowsLeft);
    rows.push(items.slice(index, index + size));
    index += size;
    remaining -= size;
  }

  return rows;
}

export function StatCardGrid({ children }: { children: ReactNode[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [cardsPerRow, setCardsPerRow] = useState(3);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const update = () => setCardsPerRow(getCardsPerRow(el.clientWidth));

    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const items = children.filter(Boolean) as ReactNode[];
  const rows = chunkBalancedRows(items, cardsPerRow);

  return (
    <div ref={containerRef} className="flex flex-col gap-4 w-full">
      {rows.map((row, rowIndex) => (
        <div key={rowIndex} className="flex gap-4 w-full">
          {row.map((card, cardIndex) => (
            <div key={cardIndex} className="flex-1 min-w-0">
              {card}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
