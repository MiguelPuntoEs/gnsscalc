import { Box, Typography } from "@mui/material"

const TimeGlossary = () => (
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

export default TimeGlossary;