import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { fetchGranola } from '@/lib/sources/granola';

export async function GET() {
  try {
    const session = await auth();
    const result = await fetchGranola(session?.user?.email ?? null);
    return NextResponse.json({
      tasks: result.tasks,
      source: 'granola',
      status: result.status,
    });
  } catch (err) {
    console.error('[granola]', err);
    return NextResponse.json(
      { tasks: [], source: 'granola', status: 'error' },
      { status: 500 }
    );
  }
}
