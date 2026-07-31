import { Children, useState, type ReactNode } from "react";
import { View, StyleSheet, type LayoutChangeEvent } from "react-native";

const GAP = 12;
const CARDS_PER_ROW = 2;

export function StatCardGrid({ children }: { children: ReactNode }) {
  const [containerWidth, setContainerWidth] = useState(0);
  const items = Children.toArray(children).filter(Boolean);

  const onLayout = (event: LayoutChangeEvent) => {
    const width = Math.round(event.nativeEvent.layout.width);
    if (width > 0 && width !== containerWidth) {
      setContainerWidth(width);
    }
  };

  const itemWidth =
    containerWidth > 0
      ? (containerWidth - GAP * (CARDS_PER_ROW - 1)) / CARDS_PER_ROW
      : undefined;

  return (
    <View style={styles.container} onLayout={onLayout}>
      <View style={styles.grid}>
        {items.map((card, index) => (
          <View
            key={index}
            style={[
              styles.item,
              itemWidth !== undefined
                ? { width: itemWidth }
                : styles.itemFallback,
            ]}
          >
            {card}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: GAP,
    alignItems: "stretch",
  },
  item: {
    flexGrow: 0,
    flexShrink: 0,
    alignSelf: "stretch",
  },
  itemFallback: {
    width: "48%",
  },
});
