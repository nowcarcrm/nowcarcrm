"use client";

import { useEffect, useState } from "react";
import { formatNumberInput, parseNumberInput } from "@/app/(admin)/_lib/settlement/formatters";

type Props = {
  value: number;
  onChange: (value: number) => void;
  placeholder?: string;
  disabled?: boolean;
  min?: number;
  max?: number;
  className?: string;
  allowNegative?: boolean;
};

export function CurrencyInput({
  value,
  onChange,
  placeholder,
  disabled,
  min = 0,
  max,
  className,
  allowNegative = false,
}: Props) {
  const [display, setDisplay] = useState(() => formatNumberInput(value));

  useEffect(() => {
    setDisplay(formatNumberInput(value));
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const parsed = parseNumberInput(raw);
    const effectiveMin = allowNegative ? (min ?? Number.MIN_SAFE_INTEGER) : min;
    if (effectiveMin !== undefined && parsed < effectiveMin) return;
    if (max !== undefined && parsed > max) return;
    setDisplay(formatNumberInput(parsed));
    onChange(parsed);
  };

  return (
    <div className="relative">
      <input
        type="text"
        inputMode="numeric"
        value={display}
        onChange={handleChange}
        placeholder={placeholder}
        disabled={disabled}
        className={`crm-field pr-8 ${className ?? ""}`}
      />
      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-sm text-zinc-500">원</span>
    </div>
  );
}
