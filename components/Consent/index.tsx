import { Button, Slide, Typography } from "@mui/material";
import { Box } from "@mui/system";
import useCookie from "hooks/cookie";

const COOKIE_NAME = "accept_cookies";

const ConsentBanner = () => {
  const [cookie, setCookie] = useCookie(COOKIE_NAME);

  return (
    <Slide
      in={cookie.length === 0}
      timeout={500}
      direction="up"
      enter
      unmountOnExit
    >
      <Box
        sx={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          width: "auto",
          backgroundColor: "#eee",
          p: 3,
          zIndex: 3000,
        }}
      >
        <Typography>
          This website uses cookies to ensure you receive the best possible
          service. By accessing further pages of our website, you are agreeing
          to our use of cookies.
        </Typography>
        <Box
          sx={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 3,
          }}
        >
          <Button
            onClick={() => {
              setCookie("false");
              // setShouldShow(false);
            }}
          >
            Deny
          </Button>
          <Button
            onClick={() => {
              setCookie("true");
              // setShouldShow(false);
            }}
            variant="contained"
            color="primary"
          >
            Allow
          </Button>
        </Box>
      </Box>
    </Slide>
  );
};

export default ConsentBanner;
