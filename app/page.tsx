import Hero from '@/components/hero/Hero';
import { currentUser } from '@/lib/auth';

export default async function Page() {
  const signedIn = (await currentUser()) !== null;
  return (
    <main>
      <Hero signedIn={signedIn} />
    </main>
  );
}
