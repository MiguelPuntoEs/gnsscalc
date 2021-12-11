import { AppBar, Toolbar, Typography } from "@mui/material";
import { Box } from "@mui/system";
import Link from "components/Link";
import Image from "next/image";

const Header = () => (
  <>
    <AppBar>
      <Toolbar sx={{
        display: "flex",
        flexDirection: "row",
        gap: 2
      }}>
        <Box
          sx={{
            height: (theme) => theme.spacing(5),
            width: (theme) => theme.spacing(5),
            borderRadius: "25%",
            overflow: "hidden",
            mr: 2,
          }}
        >
          <Image
            src="/icons/favicon-128x128.png"
            height="48"
            width="48"
            alt="Logo"
          />
        </Box>
        <Typography variant="h5" component="h1">
          GNSS Calculator
        </Typography>
        <Link href="/">
          Time Calculator
        </Link>
        <Link href="/positioning">
          Positioning
        </Link>
      </Toolbar>
    </AppBar>

    <Toolbar />
  </>
);

export default Header;
