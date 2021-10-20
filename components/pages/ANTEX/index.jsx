import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import getArrayFromObject from '../../../util/arrays';
import styles from './antex.module.scss';
import LoadingIndicator from '../../LoadingIndicator';

import data from './test.json';
import Dropzone from '../../Dropzone';
import {
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  CircularProgress,
  Backdrop,
  Grid,
  CardContent,
  Card,
  CardHeader,
} from '@mui/material';
import { Box } from '@mui/system';

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

// const antennaData = data.antennas[0];

async function uploadANTEX(file) {
  // console.log(file);

  const formData = new FormData();
  formData.append('file', file);

  const data = await fetch('http://localhost:3000/api/upload-antex', {
    method: 'POST',
    body: formData,
  }).then((r) => r.json());

  return data;
}

export default function ANTEX() {
  const [antennaIdx, setAntennaIdx] = useState(0);
  const [freqIdx, setFreqIdx] = useState(0);
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);

  const [antexData, setAntexData] = useState(data.antennas);

  const antennaType = antexData[antennaIdx].antennaType;
  const frequencyName = antexData[antennaIdx].frequencies[freqIdx].frequency;
  const pcoE = antexData[antennaIdx].frequencies[freqIdx].pcoE;
  const pcoN = antexData[antennaIdx].frequencies[freqIdx].pcoN;
  const pcoU = antexData[antennaIdx].frequencies[freqIdx].pcoU;

  const handleFormSubmit = async (e) => {
    e.preventDefault();

    handleSubmit();
  };

  const handleSubmit = async () => {
    setLoading(true);

    const newData = await uploadANTEX(file);

    console.log('newData', newData);

    // console.log(antexData[0].frequencies[0].pcvValues);
    // // const max = Math.max(...antexData[0].frequencies[0].pcvValuesRaveled);
    // console.log(Math.max(...antexData[0].frequencies[0].pcvValuesRaveled));
    // console.log(Math.min(...antexData[0].frequencies[0].pcvValuesRaveled));

    if (newData.antennas !== undefined) setAntexData(newData.antennas);

    setLoading(false);
  };

  useEffect(() => handleSubmit(), [file]);

  return (
    <Grid container spacing={2}>
      <LoadingIndicator open={loading} />
      <Grid item xs={12} xl={4}>
        <Card>
          <CardContent
            sx={{
              "& > * + *": {
                marginTop: ({ spacing }) => spacing(2)
              }
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
                    console.log(e.target.value);
                    setAntennaIdx(e.target.value);
                  }}
                >
                  {antexData.map((val, index) => {
                    return (
                      <MenuItem key={index} value={index}>
                        {val.antennaType}
                      </MenuItem>
                    );
                  })}
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
                  {antexData[antennaIdx].frequencies.map((val, index) => {
                    return (
                      <MenuItem key={index} value={index}>
                        {val.frequency}
                      </MenuItem>
                    );
                  })}
                </Select>
              </FormControl>
            </Box>
          </CardContent>
        </Card>
      </Grid>
      <Grid item xs={12} xl={8} >
        <Card>
          <CardContent>
            <Plot
              data={[
                {
                  x: antexData[antennaIdx].elevs,
                  y: antexData[antennaIdx].azs,
                  z: antexData[antennaIdx].frequencies[freqIdx].pcvValues,
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
        3
      </Grid>
      <Grid item xs={12} xl={6}>
        4
      </Grid>

      <Plot
        data={antexData[antennaIdx].frequencies
          .filter((freqData) => freqData.frequency[0] === 'G')
          .map((freqData) => {
            return {
              x: antexData[antennaIdx].elevs,
              y: freqData.pcvMean,
              type: 'scatter',
              mode: 'lines',
              name: freqData.frequency,
            };
          })}
        layout={{
          width: 800,
          height: 500,
          xaxis: { title: 'Elevation [°]' },
          yaxis: { title: 'Mean PCV [mm]' },
        }}
      />

      <div
        dangerouslySetInnerHTML={{
          __html: antexData[antennaIdx].frequencies[freqIdx].svg,
        }}
      />
    </Grid>
  );
}
