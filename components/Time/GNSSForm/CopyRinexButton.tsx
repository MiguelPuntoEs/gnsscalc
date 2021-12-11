import { Button } from "@mui/material";
import { useState } from "react";

type Props = {
  rinex: string;
};

const CopyRinexButton = ({ rinex }: Props) => {
  const [error, setError] = useState(false);

  const handleCopyRinexClick = () => {
    const copy = () => {
      if (navigator && navigator.clipboard) {
        return navigator.clipboard.writeText(rinex);
      }
      return Promise.reject();
    };

    copy().catch(() => {
      setTimeout(() => setError(false), 1500);
      setError(true);
    });
  };

  return (
    <Button
      color={error ? "error" : "primary"}
      variant="outlined"
      onClick={handleCopyRinexClick}
    >
      {error ? "Failed to copy" : "Copy RINEX"}
    </Button>
  );
};

export default CopyRinexButton;
