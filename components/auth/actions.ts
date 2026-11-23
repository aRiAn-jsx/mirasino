'use server';

/**
 * The three things the forms can ask of the server: make an account, sign in,
 * sign out. Nothing sent by the browser is trusted — every field is checked
 * again here with the same rules the form used (lib/auth-rules.ts).
 */
import { redirect } from 'next/navigation';
import {
  authenticate,
  clearAttempts,
  createUser,
  emailTaken,
  endSession,
  noteFailedAttempt,
  startSession,
  tooManyAttempts,
} from '@/lib/auth';
import { checkAll, normalizeEmail, normalizeName, safeNext, type Field, type Values } from '@/lib/auth-rules';

export interface AuthState {
  /** something wrong with the attempt as a whole */
  message?: string;
  /** something wrong with one field */
  fields?: Partial<Record<Field, string>>;
}

const text = (form: FormData, key: string) => {
  const value = form.get(key);
  return typeof value === 'string' ? value : '';
};

const read = (form: FormData): Values => ({
  name: normalizeName(text(form, 'name')),
  email: normalizeEmail(text(form, 'email')),
  province: text(form, 'province').trim(),
  city: text(form, 'city').trim(),
  password: text(form, 'password'),
  confirm: text(form, 'confirm'),
});

const TAKEN = 'با این ایمیل پیش‌تر حسابی ساخته شده است؛ از «ورود» استفاده کنید.';

export async function register(_previous: AuthState, form: FormData): Promise<AuthState> {
  const values = read(form);
  const fields = checkAll(values, 'register');
  if (Object.keys(fields).length > 0) return { fields };
  if (emailTaken(values.email)) return { fields: { email: TAKEN } };

  const id = await createUser(values.name, values.email, values.password, values.province, values.city);
  if (id === null) return { fields: { email: TAKEN } };

  await startSession(id, true);
  redirect(safeNext(form.get('next')));
}

export async function login(_previous: AuthState, form: FormData): Promise<AuthState> {
  const values = read(form);
  const fields = checkAll(values, 'login');
  if (Object.keys(fields).length > 0) return { fields };

  if (tooManyAttempts(values.email)) {
    return { message: 'تلاش‌های ناموفق پیاپی زیاد بود. چند دقیقه‌ی دیگر دوباره امتحان کنید.' };
  }
  const id = await authenticate(values.email, values.password);
  if (id === null) {
    noteFailedAttempt(values.email);
    return { message: 'ایمیل یا رمز عبور درست نیست.' };
  }

  clearAttempts(values.email);
  await startSession(id, form.get('remember') === 'on');
  redirect(safeNext(form.get('next')));
}

export async function logout() {
  await endSession();
  redirect('/');
}
