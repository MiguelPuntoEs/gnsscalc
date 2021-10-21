import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import {
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Grid,
  Box,
  CardContent,
  Card,
} from '@mui/material';

import { makeStyles } from '@mui/styles';
import LoadingIndicator from '../../LoadingIndicator';

import data from './test.json';
import Dropzone from '../../Dropzone';

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

const useStyles = makeStyles(() => ({
  gridItem: {
    height: '100%',
  },
}));

// const antennaData = data.antennas[0];

async function uploadANTEX(file) {
  // console.log(file);

  const formData = new FormData();
  formData.append('file', file);

  const result = await fetch('http://localhost:3000/api/upload-antex', {
    method: 'POST',
    body: formData,
  }).then((r) => r.json());

  return result;
}

export default function ANTEX() {
  const classes = useStyles();
  const [antennaIdx, setAntennaIdx] = useState(0);
  const [freqIdx, setFreqIdx] = useState(0);
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);

  const [antexData, setAntexData] = useState(data.antennas);

  const { antennaType, frequencies, elevs, azs } = antexData[antennaIdx];
  const frequencyName = frequencies[freqIdx].frequency;
  const { pcoE, pcoU, pcoN } = frequencies[freqIdx];

  const handleSubmit = async () => {
    setLoading(true);

    const newData = await uploadANTEX(file);

    if (newData.antennas !== undefined) setAntexData(newData.antennas);

    setLoading(false);
  };

  useEffect(() => handleSubmit(), [file]);

  return (
    <Grid container spacing={2}>
      <LoadingIndicator open={loading} />
      <Grid item xs={12} xl={6}>
        <Card className={classes.gridItem}>
          <CardContent
            sx={{
              '& > * + *': {
                marginTop: ({ spacing }) => spacing(2),
              },
            }}
          >
            <Dropzone
              onDrop={(files) => {
                setFile(files[0]);
              }}
            />

            <Box display="flex" gap={2}>
              <FormControl>
                <InputLabel id="antenna-select-label">Antenna</InputLabel>
                <Select
                  labelId="antenna-select-label"
                  id="antenna-select"
                  value={antennaIdx}
                  label="Antenna"
                  onChange={(e) => {
                    setAntennaIdx(e.target.value);
                  }}
                >
                  {antexData.map((val, index) => (
                    <MenuItem key={val.antennaType} value={index}>
                      {val.antennaType}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl>
                <InputLabel id="frequency-select-label">Frequency</InputLabel>
                <Select
                  labelId="frequency-select-label"
                  id="frequency-select"
                  value={freqIdx}
                  label="Frequency"
                  onChange={(e) => {
                    setFreqIdx(e.target.value);
                  }}
                >
                  {antexData[antennaIdx].frequencies.map((val, index) => (
                    <MenuItem key={val.frequency} value={index}>
                      {val.frequency}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>
          </CardContent>
        </Card>
      </Grid>
      <Grid item xs={12} xl={6}>
        <Card className={classes.gridItem}>
          <CardContent>
            <Plot
              data={[
                {
                  x: elevs,
                  y: azs,
                  z: frequencies[freqIdx].pcvValues,
                  type: 'surface',
                  contours: {
                    z: {
                      show: true,
                      usecolormap: true,
                      highlightcolor: '#42f462',
                      project: { z: true },
                    },
                    x: {
                      show: true,
                      usecolormap: true,
                    },
                  },
                  // hidesurface: true,
                  // showscale:false,
                  // visible: false,
                  // contours: {
                  //     // visible: true,
                  //     // x: { show: true },
                  //     // y: { show: true },
                  //     // z: { show: true },
                  //     // line: {color: 'blue'}
                  //   },
                },
              ]}
              layout={{
                autosize: true,
                title: `${antennaType}; Freq: ${frequencyName}<br>PCO N/E/U: ${pcoN}, ${pcoE}, ${pcoU} [mm]`,
                scene: {
                  xaxis: { title: 'Elevation [deg]' },
                  yaxis: { title: 'Azimuth [deg]' },
                  zaxis: { title: 'PCV [mm]' },
                },
              }}
              config={config}
            />
          </CardContent>
        </Card>
      </Grid>
      <Grid item xs={12} xl={6}>
        <Card className={classes.gridItem}>
          <CardContent>
            <div
              // eslint-disable-next-line react/no-danger
              dangerouslySetInnerHTML={{
                __html: antexData[antennaIdx].frequencies[freqIdx].svg,
              }}
            />
          </CardContent>
        </Card>
      </Grid>
      <Grid item xs={12} xl={6}>
        <Card className={classes.gridItem}>
          <CardContent>
            <Plot
              data={frequencies
                .filter((freqData) => freqData.frequency[0] === 'G')
                .map((freqData) => ({
                  x: elevs,
                  y: freqData.pcvMean,
                  type: 'scatter',
                  mode: 'lines',
                  name: freqData.frequency,
                }))}
              layout={{
                autosize: true,
                xaxis: { title: 'Elevation [°]' },
                yaxis: { title: 'Mean PCV [mm]' },
              }}
            />
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );
}
