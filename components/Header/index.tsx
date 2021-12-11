import {
  AppBar,
  Button,
  Menu,
  MenuItem,
  Theme,
  Toolbar,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { Box } from "@mui/system";
import Link from "components/Link";
import Image from "next/image";
import { useRouter } from "next/router";
import KeyboardArrowDown from "@mui/icons-material/KeyboardArrowDown";
import { useState } from "react";

const PATH_LOOKUP = {
  "/": "Time Calculator",
  "/positioning": "Positioning",
};

const Header = () => {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const { pathname } = useRouter();
  const isMobile = useMediaQuery<Theme>((theme) =>
    theme.breakpoints.down("md")
  );

  const open = Boolean(anchorEl);

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };
  const handleClose = () => {
    setAnchorEl(null);
  };

  return (
    <>
      <AppBar>
        <Toolbar
          sx={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            gap: 5,
          }}
        >
          <Box
            sx={{
              display: "flex",
              gap: isMobile ? 1 : 2,
              alignItems: "center",
            }}
          >
            <Box
              sx={{
                height: (theme) => theme.spacing(isMobile ? 4 : 5),
                width: (theme) => theme.spacing(isMobile ? 4 : 5),
                borderRadius: "25%",
                overflow: "hidden",
              }}
            >
              <Image
                src="/icons/favicon-128x128.png"
                height={isMobile ? "32" : "48"}
                width={isMobile ? "32" : "48"}
                alt="Logo"
              />
            </Box>
            <Typography
              variant={isMobile ? "body1" : "h5"}
              sx={{ fontWeight: isMobile ? "bold" : "regular" }}
              component="h1"
            >
              GNSS Calculator
            </Typography>
          </Box>
          <Box
            sx={{
              pt: "2px",
              justifySelf: "flex-end",
              display: {
                xs: "none",
                sm: "flex",
              },
              gap: 2,
              flexGrow: 1,
            }}
          >
            <Link href="/">Time Calculator</Link>
            <Link href="/positioning">Positioning</Link>
          </Box>
          <Box
            sx={{
              display: {
                xs: "flex",
                sm: "none",
              },
              flexGrow: 1,
              justifyContent: "flex-end",
              alignItems: "center",
            }}
          >
            <Button
              color="inherit"
              endIcon={<KeyboardArrowDown />}
              onClick={handleClick}
              size="small"
            >
              {PATH_LOOKUP[pathname as keyof typeof PATH_LOOKUP]}
            </Button>
            <Menu open={open} onClose={handleClose} anchorEl={anchorEl}>
              <MenuItem>
                <Link href="/">Time Calculator</Link>
              </MenuItem>
              <MenuItem>
                <Link href="/positioning">Positioning</Link>
              </MenuItem>
            </Menu>
          </Box>
        </Toolbar>
      </AppBar>

      <Toolbar />
    </>
  );
};

export default Header;
