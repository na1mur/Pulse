import Svg, { Path, Defs, LinearGradient, Stop } from "react-native-svg";
import { useId } from "react";

interface SparklineProps {
  color: string;
  height?: number;
}

export function Sparkline({ color, height = 32 }: SparklineProps) {
  const gradientId = useId();

  return (
    <Svg
      width="100%"
      height={height}
      viewBox="0 0 120 32"
      preserveAspectRatio="none"
    >
      <Defs>
        <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <Stop offset="100%" stopColor={color} stopOpacity="0" />
        </LinearGradient>
      </Defs>
      <Path
        d="M0,24 C10,20 15,28 25,18 C35,8 40,22 50,14 C60,6 65,20 75,12 C85,4 90,18 100,10 C110,2 115,16 120,8 L120,32 L0,32 Z"
        fill={`url(#${gradientId})`}
      />
      <Path
        d="M0,24 C10,20 15,28 25,18 C35,8 40,22 50,14 C60,6 65,20 75,12 C85,4 90,18 100,10 C110,2 115,16 120,8"
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.8"
      />
    </Svg>
  );
}
