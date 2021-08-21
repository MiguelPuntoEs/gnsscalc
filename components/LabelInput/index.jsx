import clsx from "clsx";
import { useEffect, useState } from "react";
import InputMask from "react-input-mask";
import styles from "./labelinput.module.scss";

export default function LabelInput({
  label,
  value,
  onCompute = () => true,
  disabled = false,
  className,
  type = "text",
  step,
  maskOptions,
  readOnly,
}) {
  // Normale Hook calls
  const [id, setId] = useState("");
  const [_value, setValue] = useState(value);
  const [error, setError] = useState(false);

  // Handler const handleChange ...
  const handleChange = ({ target }) => {
    setValue(target.value);
  };

  const handleValidate = () => {
    const result = onCompute(_value);

    // TODO useValidationResult
    setError(result === undefined);
  };

  // Allerletz useEffect
  useEffect(() => {
    setId(Math.random());
  }, []);

  useEffect(() => {
    setValue(value);
    setError(false);
  }, [value]);

  const input = maskOptions ? (
    <InputMask
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
      className={clsx(className, {
        [styles.error]: error,
      })}
      mask={maskOptions.mask}
      formatChars={maskOptions.formatChars}
    />
  ) : (
    <input
      id={id}
      type={type}
      value={_value}
      onChange={handleChange}
      onKeyDown={({ key }) => {
        if (key === "Enter") {
          handleValidate();
        }
      }}
      onBlur={handleValidate}
      disabled={disabled}
      className={clsx(className, {
        [styles.error]: error,
      })}
      step={step}
      readOnly={readOnly}
    />
  );

  return (
    <>
      <label htmlFor={id}>{label}</label>
      {input}
    </>
  );
}
