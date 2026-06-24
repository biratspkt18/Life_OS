interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
}

/**
 * A clean, ordinary checkbox — a tidy square that fills on completion
 * (brief §4). Not hand-drawn, not sketched.
 */
export function Checkbox({ checked, onChange, label }: CheckboxProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={[
        "flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[7px] border transition-all duration-150",
        checked
          ? "border-accent bg-accent text-paper"
          : "border-muted-soft bg-paper-card hover:border-muted",
      ].join(" ")}
    >
      {checked && (
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none">
          <path
            d="M5 12.5l4 4 10-10"
            stroke="currentColor"
            strokeWidth="2.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  );
}
