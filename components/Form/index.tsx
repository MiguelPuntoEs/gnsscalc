import { Paper, Typography } from "@mui/material";

type FormProps = {
  title: string;
};

const Form: React.FC<FormProps> = ({ title, children }) => (
  <Paper
    component="form"
    variant="outlined"
    sx={{
      display: "flex",
      flexDirection: "column",
      p: 4,
      pb: 1.5,
      mb: 4,
      gap: ({ spacing }) => spacing(0.25),
    }}
  >
    <Typography
      variant="h6"
      sx={{
        mb: 1.5,
      }}
    >
      {title}
    </Typography>
    {children}
  </Paper>
);

export default Form;
