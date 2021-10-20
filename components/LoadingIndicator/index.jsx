import {
    CircularProgress,
    Backdrop,
  } from '@mui/material';

export default function LoadingIndicator({ open }) {
  return (
    <Backdrop
      open={open}
      sx={{ color: '#fff', zIndex: (theme) => theme.zIndex.drawer + 1 }}
    >
      <CircularProgress color="inherit" />
    </Backdrop>
  );
}
