export const CHART_THEME = {
  gridStroke: 'rgba(255,255,255,0.06)',
  axisStyle: { fontSize: 10, fill: 'rgba(208,208,211,0.5)' },
  tooltipStyle: {
    contentStyle: {
      backgroundColor: '#32323f',
      border: '1px solid rgba(74,74,90,0.6)',
      borderRadius: 8,
      fontSize: 12,
      color: '#d0d0d3',
    },
    labelStyle: { color: 'rgba(208,208,211,0.6)', fontSize: 11 },
  },
  legendColor: 'rgba(208,208,211,0.6)',
  canvasText: 'rgba(208,208,211,',
  tooltipBg: '#32323f',
  tooltipBorder: '1px solid rgba(74,74,90,0.6)',
  tooltipFg: '#d0d0d3',
  unobservedDot: 'rgba(208,208,211,0.25)',
  labelFill: 'rgba(208,208,211,0.35)',
} as const;

export type ChartTheme = typeof CHART_THEME;

export function useChartTheme(): ChartTheme {
  return CHART_THEME;
}

export function getChartTheme(): ChartTheme {
  return CHART_THEME;
}
