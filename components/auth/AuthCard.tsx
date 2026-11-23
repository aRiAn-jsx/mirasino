'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  useActionState,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import {
  FIELDS,
  STRENGTH_LABELS,
  check,
  checkAll,
  strength,
  type Field,
  type Mode,
  type Values,
} from '@/lib/auth-rules';
import { PROVINCES, citiesOf } from '@/lib/geo';
import { login, register, type AuthState } from './actions';
import styles from './auth.module.css';

const COPY: Record<Mode, { title: string; sub: string; submit: string; busy: string; page: string }> = {
  login: {
    title: 'خوش آمدید',
    sub: 'برای ادامه، وارد حساب خود شوید.',
    submit: 'ورود',
    busy: 'در حال ورود…',
    page: 'ورود — نفیس',
  },
  register: {
    title: 'حساب بسازید',
    sub: 'چند لحظه بیشتر طول نمی‌کشد.',
    submit: 'ساختن حساب',
    busy: 'در حال ساختن حساب…',
    page: 'ثبت‌نام — نفیس',
  },
};

const EMPTY: Values = { name: '', email: '', province: '', city: '', password: '', confirm: '' };
const NOTHING: AuthState = {};

/**
 * THE DOOR — signing in and signing up, as one card.
 *
 * `/login` and `/register` both render it, and it reads which one it is from
 * the address. Changing sides only rewrites the address (history.pushState):
 * nothing is fetched and nothing is thrown away, so what has been typed stays,
 * the selector slides, and the two extra fields of a new account open in
 * place. Back and forward still do what they should.
 *
 * Each field is checked as the visitor leaves it and again on submit, by the
 * same rules the server applies (lib/auth-rules.ts). After a refused attempt
 * the first field at fault takes the focus, or the notice if no field is.
 */
export function AuthCard({ next }: { next: string }) {
  const mode: Mode = usePathname().startsWith('/register') ? 'register' : 'login';
  const copy = COPY[mode];

  const [values, setValues] = useState<Values>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [shown, setShown] = useState(false);
  const [caps, setCaps] = useState(false);

  const [loginState, loginAction, loginBusy] = useActionState(login, NOTHING);
  const [registerState, registerAction, registerBusy] = useActionState(register, NOTHING);
  const busy = loginBusy || registerBusy;

  const formRef = useRef<HTMLFormElement>(null);
  const noticeRef = useRef<HTMLDivElement>(null);

  const focusFirst = (found: Partial<Record<Field, string>>, on: Mode) => {
    const field = FIELDS[on].find((name) => found[name]);
    if (field) formRef.current?.querySelector<HTMLElement>(`[name="${field}"]`)?.focus();
    else noticeRef.current?.focus();
  };

  // what the server said about the last attempt
  useEffect(() => {
    if (loginState === NOTHING) return;
    setErrors(loginState.fields ?? {});
    setNotice(loginState.message ?? null);
    requestAnimationFrame(() => focusFirst(loginState.fields ?? {}, 'login'));
  }, [loginState]);
  useEffect(() => {
    if (registerState === NOTHING) return;
    setErrors(registerState.fields ?? {});
    setNotice(registerState.message ?? null);
    requestAnimationFrame(() => focusFirst(registerState.fields ?? {}, 'register'));
  }, [registerState]);

  useEffect(() => {
    document.title = copy.page;
  }, [copy.page]);

  const change = (to: Mode) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    if (to === mode) return;
    setErrors({});
    setNotice(null);
    window.history.pushState(null, '', `/${to}${window.location.search}`);
  };

  const set = (field: Field) => (value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    // a correction is under way: what was said about the last attempt no longer applies
    if (errors[field]) setErrors(({ [field]: _gone, ...rest }) => rest);
    if (notice) setNotice(null);
  };

  // a new province makes the old city wrong, so the city is cleared with it
  const setProvince = (value: string) => {
    setValues((current) => ({ ...current, province: value, city: '' }));
    setErrors(({ province: _p, city: _c, ...rest }) => rest);
    if (notice) setNotice(null);
  };

  const leave = (field: Field) => () => {
    // an untouched, empty field is not yet a mistake
    if (!values[field]) return;
    const message = check(field, values, mode);
    setErrors(({ [field]: _old, ...rest }) => (message ? { ...rest, [field]: message } : rest));
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    const found = checkAll(values, mode);
    setNotice(null);
    if (Object.keys(found).length === 0) return;
    event.preventDefault();
    setErrors(found);
    focusFirst(found, mode);
  };

  const onKey = (event: KeyboardEvent<HTMLInputElement>) => setCaps(event.getModifierState('CapsLock'));

  const signup = mode === 'register';
  const level = strength(values.password);

  const eye = (
    <button
      type="button"
      className={styles.eye}
      aria-pressed={shown}
      aria-label={shown ? 'پنهان کردن رمز عبور' : 'نمایش رمز عبور'}
      onClick={() => setShown((value) => !value)}
    >
      <svg viewBox="0 0 22 22" aria-hidden="true">
        <path d="M2.2 11S5.4 5.2 11 5.2 19.8 11 19.8 11 16.6 16.8 11 16.8 2.2 11 2.2 11z" />
        <circle cx="11" cy="11" r="2.6" />
        {!shown && <path d="M4 18 18 4" />}
      </svg>
    </button>
  );

  return (
    <section className={styles.card} data-mode={mode} aria-labelledby="auth-title">
      {/* the card is a membership card: the house's seal, and a perforation to tear along */}
      <div className={styles.ticket} aria-hidden="true">
        <span className={styles.seal}>ن</span>
        <span className={styles.ticketText}>
          <b>کارت عضویت</b>
          گالریِ نفیس
        </span>
        <span className={styles.ticketMark} lang="en" dir="ltr">
          NAFIS · MEMBER
        </span>
      </div>
      <div className={styles.perforation} aria-hidden="true" />
      <div className={styles.titles} key={mode}>
        <h1 id="auth-title" className={styles.title}>
          {copy.title}
        </h1>
        <p className={styles.sub}>{copy.sub}</p>
      </div>

      <nav className={styles.tabs} aria-label="ورود یا ثبت‌نام">
        <span className={styles.thumb} aria-hidden="true" />
        <a href="/login" aria-current={signup ? undefined : 'page'} onClick={change('login')}>
          ورود
        </a>
        <a href="/register" aria-current={signup ? 'page' : undefined} onClick={change('register')}>
          ثبت‌نام
        </a>
      </nav>

      <form ref={formRef} className={styles.form} action={signup ? registerAction : loginAction} onSubmit={onSubmit} noValidate>
        <input type="hidden" name="next" value={next} />

        {notice && (
          <div ref={noticeRef} className={styles.notice} role="alert" tabIndex={-1}>
            <WarnIcon />
            <span>{notice}</span>
          </div>
        )}

        <Reveal open={signup}>
          <FieldRow
            name="name"
            label="نام و نام خانوادگی"
            autoComplete="name"
            value={values.name}
            error={errors.name}
            placeholder="مثلاً: علی محمدی"
            disabled={!signup}
            onChange={set('name')}
            onBlur={leave('name')}
          />
        </Reveal>

        <FieldRow
          name="email"
          label="ایمیل"
          type="email"
          inputMode="email"
          autoComplete="email"
          ltr
          placeholder="name@example.com"
          value={values.email}
          error={errors.email}
          onChange={set('email')}
          onBlur={leave('email')}
        />

        <Reveal open={signup}>
          <SelectRow
            name="province"
            label="استان"
            placeholder="استان را انتخاب کنید"
            options={PROVINCES.map((province) => province.name)}
            value={values.province}
            error={errors.province}
            disabled={!signup}
            onChange={setProvince}
            onBlur={leave('province')}
          />
          <SelectRow
            name="city"
            label="شهر"
            placeholder={values.province ? 'شهر را انتخاب کنید' : 'ابتدا استان را انتخاب کنید'}
            options={citiesOf(values.province)}
            value={values.city}
            error={errors.city}
            disabled={!signup || !values.province}
            onChange={set('city')}
            onBlur={leave('city')}
          />
        </Reveal>

        <FieldRow
          name="password"
          label="رمز عبور"
          type={shown ? 'text' : 'password'}
          autoComplete={signup ? 'new-password' : 'current-password'}
          ltr
          value={values.password}
          error={errors.password}
          hint={caps ? 'Caps Lock روشن است.' : signup && !values.password ? 'دست‌کم ۸ نویسه.' : undefined}
          trailing={eye}
          onChange={set('password')}
          onBlur={leave('password')}
          onKeyUp={onKey}
        >
          {signup && values.password && (
            <div className={styles.meter} data-level={level}>
              <span className={styles.meterBars} aria-hidden="true">
                <i />
                <i />
                <i />
                <i />
              </span>
              <span className={styles.meterLabel} aria-live="polite">
                قدرت رمز: {STRENGTH_LABELS[level]}
              </span>
            </div>
          )}
        </FieldRow>

        <Reveal open={signup}>
          <FieldRow
            name="confirm"
            label="تکرار رمز عبور"
            type={shown ? 'text' : 'password'}
            autoComplete="new-password"
            ltr
            value={values.confirm}
            error={errors.confirm}
            disabled={!signup}
            onChange={set('confirm')}
            onBlur={leave('confirm')}
            onKeyUp={onKey}
          />
        </Reveal>

        <Reveal open={!signup}>
          <label className={styles.remember}>
            <input type="checkbox" name="remember" defaultChecked disabled={signup} />
            <span className={styles.box} aria-hidden="true">
              <svg viewBox="0 0 12 12">
                <path d="M2.4 6.3 5 8.8l4.6-5.4" />
              </svg>
            </span>
            <span>مرا به خاطر بسپار</span>
          </label>
        </Reveal>

        <button type="submit" className={styles.submit} disabled={busy} aria-busy={busy}>
          {busy && <span className={styles.spinner} aria-hidden="true" />}
          <span>{busy ? copy.busy : copy.submit}</span>
        </button>
      </form>

      <p className={styles.other}>
        {signup ? 'پیش‌تر حساب ساخته‌اید؟ ' : 'هنوز حساب ندارید؟ '}
        <a href={signup ? '/login' : '/register'} onClick={change(signup ? 'login' : 'register')}>
          {signup ? 'وارد شوید' : 'ثبت‌نام کنید'}
        </a>
      </p>
      <p className={styles.home}>
        <Link href="/">بازگشت به گالری</Link>
      </p>
    </section>
  );
}

/** Opens and closes in place. While closed, what is inside can be neither reached nor sent. */
function Reveal({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div className={styles.reveal} data-open={open ? '1' : '0'} inert={!open}>
      <div>{children}</div>
    </div>
  );
}

function WarnIcon() {
  return (
    <svg className={styles.warn} viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="6.4" />
      <path d="M8 4.7v3.9M8 11v.2" />
    </svg>
  );
}

interface FieldRowProps {
  name: Field;
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  onKeyUp?: (event: KeyboardEvent<HTMLInputElement>) => void;
  type?: string;
  inputMode?: 'email' | 'text';
  autoComplete: string;
  placeholder?: string;
  /** emails and passwords are written left to right, whatever the page */
  ltr?: boolean;
  disabled?: boolean;
  error?: string;
  hint?: string;
  trailing?: ReactNode;
  children?: ReactNode;
}

interface SelectRowProps {
  name: Field;
  label: string;
  placeholder: string;
  options: readonly string[];
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  disabled?: boolean;
  error?: string;
}

/** a menu of fixed choices; the empty first option is what the visitor has not yet picked */
function SelectRow(props: SelectRowProps) {
  const id = `auth-${props.name}`;
  return (
    <div className={styles.field} data-invalid={props.error ? '1' : undefined}>
      <label htmlFor={id}>{props.label}</label>
      <div className={styles.control}>
        <select
          id={id}
          name={props.name}
          value={props.value}
          disabled={props.disabled}
          required
          aria-invalid={props.error ? true : undefined}
          aria-describedby={props.error ? `${id}-error` : undefined}
          onChange={(event) => props.onChange(event.target.value)}
          onBlur={props.onBlur}
        >
          <option value="">{props.placeholder}</option>
          {props.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>
      {props.error && (
        <p id={`${id}-error`} className={styles.error}>
          <WarnIcon />
          <span>{props.error}</span>
        </p>
      )}
    </div>
  );
}

function FieldRow(props: FieldRowProps) {
  const id = `auth-${props.name}`;
  const says = props.error ? `${id}-error` : props.hint ? `${id}-hint` : undefined;
  return (
    <div className={styles.field} data-invalid={props.error ? '1' : undefined}>
      <label htmlFor={id}>{props.label}</label>
      <div className={styles.control}>
        <input
          id={id}
          name={props.name}
          type={props.type ?? 'text'}
          inputMode={props.inputMode}
          autoComplete={props.autoComplete}
          autoCapitalize={props.ltr ? 'none' : undefined}
          spellCheck={false}
          placeholder={props.placeholder}
          dir={props.ltr ? 'ltr' : undefined}
          value={props.value}
          disabled={props.disabled}
          required
          aria-invalid={props.error ? true : undefined}
          aria-describedby={says}
          data-trailing={props.trailing ? '1' : undefined}
          onChange={(event) => props.onChange(event.target.value)}
          onBlur={props.onBlur}
          onKeyUp={props.onKeyUp}
        />
        {props.trailing}
      </div>
      {props.error ? (
        <p id={`${id}-error`} className={styles.error}>
          <WarnIcon />
          <span>{props.error}</span>
        </p>
      ) : (
        props.hint && (
          <p id={`${id}-hint`} className={styles.hint}>
            {props.hint}
          </p>
        )
      )}
      {props.children}
    </div>
  );
}
