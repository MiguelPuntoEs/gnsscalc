import clsx from "clsx";
import { useEffect, useState } from "react";
import styles from "./labelinput.module.scss";

export default function LabelInput({
  label,
  value,
  onCompute,
  disabled = false,
  className,
  type = "text",
  step,
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

  return (
    <>
      <label htmlFor={id}>{label}</label>
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
      />
    </>
  );
}
