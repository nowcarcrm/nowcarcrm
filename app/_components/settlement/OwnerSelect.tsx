"use client";

export type OwnerOption = {
  id: string;
  name: string;
  email: string;
  team_name: string | null;
  rank: string;
};

type Props = {
  value: string;
  onChange: (userId: string) => void;
  options: OwnerOption[];
  disabled?: boolean;
  className?: string;
};

export function OwnerSelect({ value, onChange, options, disabled, className }: Props) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={`crm-field crm-field-select ${className ?? ""}`}
    >
      <option value="">담당자 선택</option>
      {options.map((opt) => (
        <option key={opt.id} value={opt.id}>
          {opt.team_name ? `[${opt.team_name}] ` : ""}
          {opt.name} {opt.rank ? `(${opt.rank})` : ""}
          {" - "}
          {opt.email}
        </option>
      ))}
    </select>
  );
}
