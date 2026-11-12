import { HttpsError } from 'firebase-functions/v2/https';
import type { z } from 'zod';

/** Parse untrusted input; on failure return field messages, never echo the input back. */
export function validate<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const fields = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    throw new HttpsError('invalid-argument', 'הפרטים שנשלחו לא תקינים', { fields });
  }
  return result.data;
}
