import { Container } from "@mui/material";
import { Box } from "@mui/system";
import ConsentBanner from "components/Consent";
import Footer from "components/Footer";
import Header from "components/Header";

const ApplicationFrame: React.FC = ({ children }) => (
  <Box
    sx={{
      minHeight: "100%",
      width: "100%",
      display: "flex",
      flexDirection: "column",
    }}
  >
    <Header />
    <Container component="main" sx={{ flexGrow: 1, pt: 2 }} maxWidth="xl">
      {children}
    </Container>
    <Footer />
    <ConsentBanner />
  </Box>
);

export default ApplicationFrame;
