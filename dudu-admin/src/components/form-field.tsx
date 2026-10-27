import { useId } from "react";
import { cn } from "@/lib/utils";
import { Field, FieldDescription, FieldError, FieldLabel } from "./ui/field";
import { Input } from "./ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Textarea } from "./ui/textarea";

export function SelectField({
  label,
  value,
  options,
  onChange,
  disabled,
  required,
}: {
  label: string;
  value: string;
  options: { value: string; label: string; disabled?: boolean }[];
  onChange: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
}) {
  const id = useId();
  return (
    <Field data-disabled={disabled}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select
        items={options}
        value={value}
        disabled={disabled}
        required={required}
        onValueChange={(next) => {
          if (next !== null) onChange(next);
        }}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="start" alignItemWithTrigger={false}>
          <SelectGroup>
            {options.map((option) => (
              <SelectItem
                key={option.value}
                value={option.value}
                disabled={option.disabled}
              >
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  );
}

type TextFieldProps = Omit<
  React.ComponentProps<typeof Input>,
  "id" | "onChange"
> & {
  onChange?: (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => void;
  label: string;
  hideLabel?: boolean;
  error?: string;
  description?: string;
  multiline?: boolean;
};

export function TextField({
  label,
  hideLabel = false,
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
    <Field
      className="gap-2"
      data-invalid={!!error}
      data-disabled={props.disabled}
    >
      <FieldLabel htmlFor={id} className={cn(hideLabel && "sr-only")}>
        {label}
      </FieldLabel>
      {multiline ? (
        <Textarea
          {...shared}
          value={props.value}
          onChange={props.onChange}
          maxLength={props.maxLength}
          disabled={props.disabled}
          required={props.required}
          placeholder={props.placeholder}
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
