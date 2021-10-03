import dynamic from 'next/dynamic';
import getArrayFromObject from '../../../util/arrays';

import data from './example.json';

const Plot = dynamic(
  {
    loader: () => import('react-plotly.js').then((mod) => mod.default),
    render: (props, Plotly) => <Plotly {...props} />,
  },
  { ssr: false }
);

const mlYellow = 'rgb(.9290,.6940,.1250)';
const mlBlue = 'rgb(0,.447,.741)';
const mlRed = 'rgb(.8500,.3250,.0980)';

const config = {
  toImageButtonOptions: {
    format: 'png', // one of png, svg, jpeg, webp
    // filename: 'custom_image',
    width: 800,
    height: 500,
    scale: 2, // Multiply title/legend/axis/canvas sizes by this factor
  },
  displaylogo: false,
};

export default function NMEA() {
  return (
    <>
      <p>Hello</p>

      <Plot
        data={[
          {
            x: getArrayFromObject(data.date),
            y: getArrayFromObject(data.deltaU),
            type: 'scatter',
            mode: 'lines',
            marker: { color: mlYellow },
            name: 'ΔU',
          },
          {
            x: getArrayFromObject(data.date),
            y: getArrayFromObject(data.deltaE),
            type: 'scatter',
            mode: 'lines',
            marker: { color: mlBlue },
            name: 'ΔE',
          },
          {
            x: getArrayFromObject(data.date),
            y: getArrayFromObject(data.deltaN),
            type: 'scatter',
            mode: 'lines',
            marker: { color: mlRed },
            name: 'ΔN',
          },
        ]}
        layout={{
          width: 800,
          height: 500,
          title: 'Delta East, North, Up',
          xaxis: { tickformat: '%X' },
          yaxis: { title: 'Magnitude [m]' },
        }}
        config={config}
      />
      <Plot
        data={[
          {
            x: getArrayFromObject(data.date),
            y: getArrayFromObject(data.num_sats),
            type: 'scatter',
            mode: 'lines',
            marker: { color: mlYellow },
            name: '# Sats',
          },
        ]}
        layout={{
          width: 800,
          height: 500,
          yaxis: { title: '# Sats', tickformat: ',d' },
        }}
      />
      <Plot
        data={[
          {
            x: getArrayFromObject(data.deltaE),
            y: getArrayFromObject(data.deltaN),
            type: 'scatter',
            mode: 'markers',
            marker: { color: mlYellow },
            name: 'ΔU',
          },
        ]}
        layout={{
          width: 800,
          height: 500,
          title: 'Ground plot',
          yaxis: { title: 'ΔN [m]' },
          xaxis: { title: 'ΔE [m]' },
        }}
        config={config}
      />
    </>
  );
}
