import { Box } from "@mui/system";

const FormActions: React.FC = ({ children }) => (
  <Box
    sx={{
      display: "flex",
      py: 2,
      gap: ({ spacing }) => spacing(2),
      "& > *": {
        flexBasis: "50%",
        flexGrow: 1,
      },
    }}
  >
    {children}
  </Box>
);

export default FormActions;
