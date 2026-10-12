import React from "react";
import { GenreRadarMetrics } from "../types";
import { useLanguage } from "../i18n/LanguageContext";

export interface RadarAxis {
  key: keyof GenreRadarMetrics;
  labelZh: string;
  labelEn: string;
}

export const RADAR_AXES: RadarAxis[] = [
  { key: "groove", labelZh: "律动", labelEn: "Groove" },
  { key: "brightness", labelZh: "明亮", labelEn: "Bright" },
  { key: "harmonicComplexity", labelZh: "和声", labelEn: "Harmonic" },
  { key: "rhythmDensity", labelZh: "密度", labelEn: "Density" },
  { key: "bassEnergy", labelZh: "低频", labelEn: "Bass" },
  { key: "melodicFocus", labelZh: "旋律", labelEn: "Melodic" },
];

export interface RadarChartProps {
  metrics: GenreRadarMetrics;
  comparisonMetrics?: GenreRadarMetrics;
  primaryLabel?: string;
  comparisonLabel?: string;
  size?: number;
  className?: string;
  "aria-label": string;
  language?: "zh" | "en";
}

export const RadarChart: React.FC<RadarChartProps> = ({
  metrics,
  comparisonMetrics,
  primaryLabel = "当前流派",
  comparisonLabel = "对比流派",
  size = 240,
  className = "",
  "aria-label": ariaLabel,
  language: _propLanguage,
}) => {
  const { t } = useLanguage();
  const center = size / 2;
  const radius = (size / 2) * 0.68;
  const totalAxes = RADAR_AXES.length;

  // Generate grid points for ring levels (2, 4, 6, 8, 10)
  const rings = [0.2, 0.4, 0.6, 0.8, 1.0];

  const getPoints = (radar: GenreRadarMetrics) => {
    return RADAR_AXES.map((axis, idx) => {
      const angle = (Math.PI * 2 * idx) / totalAxes - Math.PI / 2;
      const val = radar[axis.key] ?? 5;
      const r = (val / 10) * radius;
      const x = center + r * Math.cos(angle);
      const y = center + r * Math.sin(angle);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
  };

  const primaryPoints = getPoints(metrics);
  const comparisonPoints = comparisonMetrics ? getPoints(comparisonMetrics) : null;

  return (
    <div className={`flex flex-col items-center select-none ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={ariaLabel}
        className="overflow-visible"
      >
        {/* Background Grid Rings */}
        {rings.map((factor, rIdx) => {
          const ringRadius = radius * factor;
          const ringPoints = RADAR_AXES.map((_, idx) => {
            const angle = (Math.PI * 2 * idx) / totalAxes - Math.PI / 2;
            const x = center + ringRadius * Math.cos(angle);
            const y = center + ringRadius * Math.sin(angle);
            return `${x.toFixed(1)},${y.toFixed(1)}`;
          }).join(" ");

          return (
            <polygon
              key={`ring-${rIdx}`}
              points={ringPoints}
              fill={rIdx === rings.length - 1 ? "rgba(255,255,255,0.02)" : "none"}
              stroke="var(--color-line, #23262d)"
              strokeWidth={rIdx === rings.length - 1 ? "1.5" : "1"}
              strokeDasharray={rIdx < rings.length - 1 ? "3 3" : undefined}
            />
          );
        })}

        {/* Axis Spokes */}
        {RADAR_AXES.map((axis, idx) => {
          const angle = (Math.PI * 2 * idx) / totalAxes - Math.PI / 2;
          const x2 = center + radius * Math.cos(angle);
          const y2 = center + radius * Math.sin(angle);

          // Label Position with baseline offset
          const labelDist = radius + 18;
          const lx = center + labelDist * Math.cos(angle);
          const ly = center + labelDist * Math.sin(angle);

          const labelText = t(`radar_${axis.key}` as any) || axis.labelEn;

          return (
            <g key={`axis-${String(axis.key)}`}>
              <line
                x1={center}
                y1={center}
                x2={x2}
                y2={y2}
                stroke="var(--color-line, #23262d)"
                strokeWidth="1"
              />
              <text
                x={lx}
                y={ly}
                textAnchor="middle"
                dominantBaseline="central"
                className="text-[11px] font-mono fill-text-sub select-none"
              >
                {labelText}
              </text>
            </g>
          );
        })}

        {/* Comparison Polygon (if provided) */}
        {comparisonPoints && (
          <polygon
            points={comparisonPoints}
            fill="rgba(59, 130, 246, 0.25)"
            stroke="#3b82f6"
            strokeWidth="2"
            strokeLinejoin="round"
            className="transition-all duration-300"
          />
        )}

        {/* Primary Data Polygon */}
        <polygon
          points={primaryPoints}
          fill="rgba(245, 183, 61, 0.35)"
          stroke="#f5b73d"
          strokeWidth="2"
          strokeLinejoin="round"
          className="transition-all duration-300"
        />

        {/* Data Vertices */}
        {RADAR_AXES.map((axis, idx) => {
          const angle = (Math.PI * 2 * idx) / totalAxes - Math.PI / 2;
          const val = metrics[axis.key] ?? 5;
          const r = (val / 10) * radius;
          const x = center + r * Math.cos(angle);
          const y = center + r * Math.sin(angle);

          return (
            <circle
              key={`vertex-${String(axis.key)}`}
              cx={x}
              cy={y}
              r="3.5"
              fill="#f5b73d"
              stroke="#0a0a0c"
              strokeWidth="1.5"
            />
          );
        })}
      </svg>

      {/* Screen Reader Accessible Data Table (P1-07 / P2-15) */}
      <table className="sr-only">
        <caption>{ariaLabel}</caption>
        <thead>
          <tr>
            <th scope="col">维度 / Dimension</th>
            <th scope="col">{primaryLabel}</th>
            {comparisonMetrics && <th scope="col">{comparisonLabel}</th>}
          </tr>
        </thead>
        <tbody>
          {RADAR_AXES.map((axis) => (
            <tr key={`sr-${String(axis.key)}`}>
              <td>{t(`radar_${axis.key}` as any) || axis.labelEn}</td>
              <td>{metrics[axis.key] ?? 5} / 10</td>
              {comparisonMetrics && <td>{comparisonMetrics[axis.key] ?? 5} / 10</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
