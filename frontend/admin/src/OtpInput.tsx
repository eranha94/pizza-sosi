import { useEffect, useRef, type ClipboardEvent, type KeyboardEvent } from 'react';

/**
 * Six boxes for the authenticator code. Typing moves forward, Backspace moves back,
 * pasting "123456" fills all boxes; onComplete fires when all six digits are in.
 * Laid out left-to-right (codes are read that way) inside the RTL page.
 */
export function OtpInput({ value, onChange, onComplete, disabled }: { value: string; onChange: (v: string) => void; onComplete?: (v: string) => void; disabled?: boolean }) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length: 6 }, (_, i) => value[i] ?? '');
  // After a wrong code the boxes are cleared – put the cursor back in the first one.
  useEffect(() => {
    if (value === '' && !disabled) refs.current[0]?.focus();
  }, [value, disabled]);

  function setAt(i: number, d: string) {
    const next = (value.slice(0, i) + d + value.slice(i + 1)).replace(/\D/g, '').slice(0, 6);
    onChange(next);
    if (d && i < 5) refs.current[i + 1]?.focus();
    if (next.length === 6) onComplete?.(next);
  }

  function onKeyDown(i: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      e.preventDefault();
      onChange(value.slice(0, i - 1));
      refs.current[i - 1]?.focus();
    } else if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus();
    else if (e.key === 'ArrowRight' && i < 5) refs.current[i + 1]?.focus();
  }

  function onPaste(e: ClipboardEvent<HTMLInputElement>) {
    const code = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!code) return;
    e.preventDefault();
    onChange(code);
    refs.current[Math.min(code.length, 5)]?.focus();
    if (code.length === 6) onComplete?.(code);
  }

  return (
    <div className="otp" dir="ltr" role="group" aria-label="קוד אימות בן 6 ספרות">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          className="otp__box"
          inputMode="numeric"
          pattern="[0-9]"
          maxLength={1}
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          autoFocus={i === 0}
          aria-label={`ספרה ${i + 1}`}
          value={d}
          disabled={disabled}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, '');
            // Some phones put the whole SMS/autofill code into the first box.
            if (v.length > 1) {
              onChange(v.slice(0, 6));
              if (v.length >= 6) onComplete?.(v.slice(0, 6));
              return;
            }
            setAt(i, v);
          }}
          onKeyDown={(e) => onKeyDown(i, e)}
          onPaste={onPaste}
          onFocus={(e) => e.target.select()}
        />
      ))}
    </div>
  );
}
