import { Box, SxProps, Theme } from "@mui/system";

type Props = {
  sx?: SxProps<Theme>;
  horizontal?: boolean;
}

const Stack: React.FC<Props> = ({ horizontal = false, sx = {}, children, }) => (
  <Box
    sx={{
      display: "flex",
      flexDirection: horizontal ? "row" : "column",
      flexWrap: "wrap",
      alignItems: "flex-end",
      alignContent: "stretch",
      gap: ({ spacing }) => spacing(4),
      ...sx
    }}
  >
    {children}
  </Box>
)

export default Stack;