import { useId } from "react";
import { Field, FieldDescription, FieldError, FieldLabel } from "./ui/field";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";

type TextFieldProps = Omit<
  React.ComponentProps<typeof Input>,
  "id" | "onChange"
> & {
  onChange?: (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => void;
  label: string;
  error?: string;
  description?: string;
  multiline?: boolean;
};

export function TextField({
  label,
  error,
  description,
  multiline,
  ...props
}: TextFieldProps) {
  const id = useId();
  const shared = {
    id,
    "aria-invalid": !!error,
    "aria-describedby": error || description ? `${id}-help` : undefined,
  };
  return (
    <Field data-invalid={!!error} data-disabled={props.disabled}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {multiline ? (
        <Textarea
          {...shared}
          value={props.value}
          onChange={props.onChange}
          maxLength={props.maxLength}
          disabled={props.disabled}
          required={props.required}
          rows={3}
        />
      ) : (
        <Input {...props} {...shared} />
      )}
      {error ? (
        <FieldError id={`${id}-help`}>{error}</FieldError>
      ) : (
        description && (
          <FieldDescription id={`${id}-help`}>{description}</FieldDescription>
        )
      )}
    </Field>
  );
}
