import type { Metadata } from 'next';
import RoomExperience from '@/components/room/RoomExperience';

export const metadata: Metadata = {
  title: 'اتاق شما — نفیس',
  description: 'Try a Nafis rug on the floor of a living room, at its true size, and arrange the room around it.',
};

export default async function RoomPage({ searchParams }: { searchParams: Promise<{ rug?: string | string[] }> }) {
  const asked = (await searchParams).rug;
  const rug = Array.isArray(asked) ? asked[0] : asked;
  return (
    <main>
      <RoomExperience rug={rug ?? null} />
    </main>
  );
}
