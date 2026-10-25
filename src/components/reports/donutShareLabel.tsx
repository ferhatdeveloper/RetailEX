/** Halka diliminin ortasında tam sayı yüzde. */
export function donutShareLabel(props: {
  cx?: number;
  cy?: number;
  midAngle?: number;
  innerRadius?: number;
  outerRadius?: number;
  sharePercent?: number;
  payload?: { sharePercent?: number };
}) {
  const share = Number(props.payload?.sharePercent ?? props.sharePercent) || 0;
  if (share <= 0) return null;
  const cx = Number(props.cx) || 0;
  const cy = Number(props.cy) || 0;
  const mid = Number(props.midAngle) || 0;
  const inner = Number(props.innerRadius) || 0;
  const outer = Number(props.outerRadius) || 0;
  const rad = Math.PI / 180;
  const radius = inner + (outer - inner) * 0.5;
  const x = cx + radius * Math.cos(-mid * rad);
  const y = cy + radius * Math.sin(-mid * rad);
  return (
    <text
      x={x}
      y={y}
      fill="#ffffff"
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={14}
      fontWeight={700}
      pointerEvents="none"
    >
      {`${share}%`}
    </text>
  );
}
