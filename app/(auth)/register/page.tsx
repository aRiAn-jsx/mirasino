import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuthCard } from '@/components/auth/AuthCard';
import { currentUser } from '@/lib/auth';
import { safeNext } from '@/lib/auth-rules';

export const metadata: Metadata = { title: 'ثبت‌نام — نفیس' };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const next = safeNext((await searchParams).next);
  if (await currentUser()) redirect(next);
  return <AuthCard next={next} />;
}
