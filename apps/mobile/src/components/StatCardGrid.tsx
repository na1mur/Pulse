import { useState, type ReactNode } from "react";
import { View, type LayoutChangeEvent } from "react-native";

const MIN_CARD_WIDTH = 150;
const GAP = 12;

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
  const [cardsPerRow, setCardsPerRow] = useState(2);

  const onLayout = (event: LayoutChangeEvent) => {
    setCardsPerRow(getCardsPerRow(event.nativeEvent.layout.width));
  };

  const items = children.filter(Boolean) as ReactNode[];
  const rows = chunkBalancedRows(items, cardsPerRow);

  return (
    <View className="gap-3 w-full" onLayout={onLayout}>
      {rows.map((row, rowIndex) => (
        <View key={rowIndex} className="flex-row gap-3 w-full">
          {row.map((card, cardIndex) => (
            <View key={cardIndex} className="flex-1">
              {card}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}
