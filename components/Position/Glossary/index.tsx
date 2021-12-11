import { Typography } from "@mui/material";
import { Box } from "@mui/system";

const PositionGlossary = () => (
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
        <strong>X</strong> [m] is the x-component of the corresponding
        position in the global (x, y, z) ECEF cartesian system.
      </Typography>
      <Typography>
        <strong>Y</strong> [m] is the y-component of the corresponding
        position in the global (x, y, z) ECEF cartesian system.
      </Typography>
      <Typography>
        <strong>Z</strong> [m] is the z-component of the corresponding
        position in the global (x, y, z) ECEF cartesian system.
      </Typography>
      <Typography>
        <strong>Height</strong> [m] is the ellipsoidal height of the
        corresponding position in the ellipsoidal (geodetic) system (φ,
        &lambda;, h) expressed in meters.
      </Typography>
      <Typography>
        <strong>&theta;</strong> [&deg;] is the elevation of the entered
        position in the reference local coordinate system expressed in
        degrees.
      </Typography>
      <Typography>
        <strong>&phi;</strong> [&deg;] is the azimuth of the entered
        position in the reference local coordinate system expressed in
        degrees.
      </Typography>
      <Typography>
        <strong>&rho;</strong> [&deg;] is the slant range of the entered
        position in the reference local coordinate system expressed in
        meters.
      </Typography>
      <Typography>
        <strong>&Delta;E</strong> [m] is the East component of the entered
        position in the reference local coordinate system East-North-Up
        (&Delta;e, &Delta;n, &Delta;u) expressed in meters.
      </Typography>
      <Typography>
        <strong>&Delta;N</strong> [m] is the North component of the entered
        position in the reference local coordinate system East-North-Up
        (&Delta;e, &Delta;n, &Delta;u) expressed in meters.
      </Typography>
      <Typography>
        <strong>&Delta;U</strong> [m] is the Up component of the entered
        position in the reference local coordinate system East-North-Up
        (&Delta;e, &Delta;n, &Delta;u) expressed in meters.
      </Typography>
      <Typography>
        <strong>ECEF</strong> Acronym for Earth-Centered, Earth-Fixed.
      </Typography>
    </Box>
  </Box>
);

export default PositionGlossary;