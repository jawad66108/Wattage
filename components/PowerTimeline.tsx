/**
 * components/PowerTimeline.tsx
 *
 * The single most important visual in the app — a 24-hour horizontal bar
 * showing outage windows (dark) vs powered hours (amber), with the day's
 * scheduled task blocks overlaid as pills. This is what the screenshot
 * and demo video should center on: it's the one glance that explains the
 * entire product ("oh, it plans around when the power is actually on").
 *
 * Pure presentational component — takes data, renders SVG. No RN-specific
 * gesture logic in v1; tapping a block can be added later via onPress.
 */
import React, { useState } from "react";
import { View, Text, StyleSheet, type LayoutChangeEvent } from "react-native";
import Svg, { Rect, Line, Text as SvgText } from "react-native-svg";
import type { OutageWindow, PlacedBlock } from "../core/scheduler";
import { buildDayTimeline, formatClock } from "../core/scheduler";

interface Props {
  outageWindows: OutageWindow[];
  placedBlocks: PlacedBlock[];
  /** Current time-of-day in minutes, for the "now" marker. Omit to hide it. */
  nowMin?: number;
  height?: number;
}

const DAY_MINUTES = 24 * 60;
const HOUR_MARKS = [0, 6, 12, 18, 24];

const COLORS = {
  mains: "#F2B705", // powered hours: warm amber
  battery: "#1B2430", // outage: dark slate
  block: "#3DDC97", // scheduled task block
  blockBorder: "#1B2430",
  now: "#FF5C5C",
  track: "#0B0F14",
  label: "#8A94A6",
};

export default function PowerTimeline({
  outageWindows,
  placedBlocks,
  nowMin,
  height = 96,
}: Props) {
  const timeline = buildDayTimeline(outageWindows);
  const barHeight = 36;
  const barY = 20;

  // Draw in real pixels (measured width) instead of stretching a fixed
  // viewBox, so text and rounded corners are never distorted.
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) =>
    setWidth(e.nativeEvent.layout.width);
  const xOf = (min: number) => (min / DAY_MINUTES) * width;

  return (
    <View style={styles.container}>
      <View onLayout={onLayout} style={{ width: "100%", height }}>
        {width > 0 && (
          <Svg width={width} height={height}>
            {/* background track */}
            <Rect
              x={0}
              y={barY}
              width={width}
              height={barHeight}
              fill={COLORS.track}
              rx={8}
            />

            {/* mains / battery segments */}
            {timeline.map((seg, i) => (
              <Rect
                key={`seg-${i}`}
                x={xOf(seg.startMin)}
                y={barY}
                width={xOf(seg.endMin) - xOf(seg.startMin)}
                height={barHeight}
                fill={
                  seg.powerSource === "mains" ? COLORS.mains : COLORS.battery
                }
              />
            ))}

            {/* hour gridlines + labels */}
            {HOUR_MARKS.map((h) => {
              const x = xOf(h * 60);
              const label =
                h === 0 || h === 24
                  ? "12am"
                  : h === 12
                    ? "12pm"
                    : h < 12
                      ? `${h}am`
                      : `${h - 12}pm`;
              return (
                <React.Fragment key={`hr-${h}`}>
                  <Line
                    x1={x}
                    y1={barY}
                    x2={x}
                    y2={barY + barHeight}
                    stroke="#00000033"
                    strokeWidth={1}
                  />
                  <SvgText
                    x={x}
                    y={barY + barHeight + 16}
                    fontSize={11}
                    fill={COLORS.label}
                    textAnchor={h === 0 ? "start" : h === 24 ? "end" : "middle"}
                  >
                    {label}
                  </SvgText>
                </React.Fragment>
              );
            })}

            {/* scheduled task blocks */}
            {placedBlocks.map((b) => (
              <Rect
                key={b.taskId}
                x={xOf(b.startMin)}
                y={barY + 6}
                width={Math.max(xOf(b.endMin) - xOf(b.startMin), 4)}
                height={barHeight - 12}
                fill={COLORS.block}
                stroke={COLORS.blockBorder}
                strokeWidth={1}
                rx={4}
              />
            ))}

            {/* "now" marker */}
            {nowMin !== undefined && (
              <Line
                x1={xOf(nowMin)}
                y1={barY - 6}
                x2={xOf(nowMin)}
                y2={barY + barHeight + 6}
                stroke={COLORS.now}
                strokeWidth={2}
              />
            )}
          </Svg>
        )}
      </View>

      <View style={styles.legendRow}>
        <LegendDot color={COLORS.mains} label="Powered" />
        <LegendDot color={COLORS.battery} label="Outage" />
        <LegendDot color={COLORS.block} label="Scheduled" />
      </View>
    </View>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendSwatch, { backgroundColor: color }]} />
      <Text style={styles.legendLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    paddingVertical: 8,
  },
  legendRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 16,
    marginTop: 4,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  legendSwatch: {
    width: 10,
    height: 10,
    borderRadius: 3,
  },
  legendLabel: {
    fontSize: 12,
    color: COLORS.label,
  },
});

export { formatClock };
