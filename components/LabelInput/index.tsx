import { TextField, Theme, Typography } from "@mui/material";
import { ReactNode, useEffect, useState } from "react";
import { Box, SxProps } from "@mui/system";
import { useIMask } from "react-imask";

type LabelInputProps = {
  label: ReactNode;
  value: string | number;
  disabled?: boolean;
  readOnly?: boolean;
  type?: string;
  small?: boolean;
  maskOptions?: {
    mask: string;
    definitions: any;
  };
  onCompute?: (value: string) => boolean;
};

const defaultTextFieldStyle: SxProps<Theme> = {
  input: {
    appearance: "textfield",
    py: ({ spacing }) => spacing(0.7),
  },
};

const LabelInput = ({
  label,
  value,
  disabled = false,
  type = "text",
  maskOptions,
  readOnly = false,
  small = false,
  onCompute = () => true,
}: LabelInputProps) => {
  const [id, setId] = useState("");
  const [_value, setValue] = useState(value);
  const [error, setError] = useState(false);
  const { ref } = useIMask(
    maskOptions
      ? { ...maskOptions, lazy: false, placeholder: "_" }
      : { mask: "" }
  );

  useEffect(() => {
    setId(Math.random().toString());
  }, []);

  useEffect(() => {
    setValue(value);
    setError(false);
  }, [value]);

  const handleChange: React.ChangeEventHandler<HTMLInputElement> = ({
    target,
  }) => {
    setValue(target.value);
  };

  const handleValidate = () => {
    const result = onCompute(`${_value}`);
    setError(!result);
  };

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1,
        "& > label": {
          flexBasis: small ? "3ch" : "15ch",
        },
      }}
    >
      <label htmlFor={id}>
        <Typography>{label}</Typography>
      </label>
      {maskOptions && (
        <TextField
          id={id}
          value={_value}
          onChange={handleChange}
          onKeyDown={({ key }) => {
            if (key === "Enter") {
              handleValidate();
            }
          }}
          onBlur={handleValidate}
          disabled={disabled}
          sx={defaultTextFieldStyle}
          inputRef={ref}
          variant="outlined"
          size="small"
          fullWidth
        />
      )}
      {!maskOptions && (
        <TextField
          id={id}
          value={_value}
          onChange={handleChange}
          size="small"
          onKeyDown={({ key }) => {
            if (key === "Enter") {
              handleValidate();
            }
          }}
          onBlur={handleValidate}
          disabled={disabled}
          type={type}
          InputProps={{
            readOnly,
          }}
          error={error}
          sx={defaultTextFieldStyle}
          fullWidth
        />
      )}
    </Box>
  );
};

export default LabelInput;
