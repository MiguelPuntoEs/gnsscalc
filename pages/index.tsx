import { Typography } from "@mui/material";
import { Box } from "@mui/system";
import GNSSForm from "components/Time/GNSSForm";
import GNSSTimeDifferenceForm from "components/Time/GNSSTimeDifferenceForm";
import Page from "components/Page";
import Stack from "components/Stack";
import type { NextPage } from "next";
import { useState } from "react";

const Glossary = () => (
  <Box
    component="section"
    sx={{
      display: "flex",
      borderTop: "1px solid #ddd",
      mb: 2.5,
    }}
  >
    <Box
      component="aside"
      sx={{
        p: 2,
        background: "#f5f5f5",
      }}
    >
      <Typography variant="subtitle1">Glossary</Typography>
    </Box>
    <Box sx={{ p: 2, "& > p + p": { mt: 1 } }}>
      <Typography>
        <strong>GPS Time</strong> is the number of seconds since January 6,
        1980, 00:00:00
      </Typography>
      <Typography>
        <strong>GAL Time</strong> (Galileo Time) is the number of seconds since
        August 22, 1999, 00:00:00
      </Typography>
      <Typography>
        <strong>UNIX Time</strong> is the number of seconds since January 1,
        1970, 00:00:00
      </Typography>
      <Typography>
        <strong>Julian Date</strong> is the number of days since January 1, 4713
        B.C., 12:00:00; defines the number of mean solar days elapsed since the
        epoch January 1.5d, 4713 before Christ.[Hoffman-Wellenhof]
      </Typography>
      <Typography>
        <strong>MJD</strong> (Modified Julian Date) is the number of days since
        January 1, 4713 B.C., 00:00:00, removing the first two digits.
        MJD=JD-24000000.5
      </Typography>
      <Typography>
        <strong>MJD2000</strong> (Modified Julian Date 2000) is the number of
        days since January 1, 2000, 00:00:00
      </Typography>
      <Typography>
        <em>Important note:</em> No leap seconds are considered in the
        computations except for TAI and TT
      </Typography>
      <Typography>Leap seconds to be updated Dec. 2021</Typography>
    </Box>
  </Box>
);

const Home: NextPage = () => {
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(new Date());

  return (
    <Page title="Time Calculator">
      <Stack
        sx={{
          mb: 2,
          "& > *": {
            flexBasis: "max(30%, 430px)",
            margin: "0 auto",
          },
        }}
        horizontal
      >
        <GNSSForm
          date={startDate}
          title="Initial Time"
          onDateChange={(d) => d && setStartDate(d)}
        />
        <GNSSForm
          date={endDate}
          title="Final Time"
          onDateChange={(d) => d && setEndDate(d)}
        />
        <GNSSTimeDifferenceForm
          startDate={startDate}
          endDate={endDate}
          onDifferenceChange={(d) => setEndDate(d)}
        />
      </Stack>

      <Glossary />
    </Page>
  );
};

export default Home;
