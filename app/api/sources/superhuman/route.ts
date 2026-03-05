import { NextResponse } from 'next/server';
import { fetchSuperhuman } from '@/lib/sources/superhuman';

export async function GET() {
  try {
    const result = await fetchSuperhuman();
    return NextResponse.json({
      tasks: result.tasks,
      source: 'superhuman',
      status: result.status,
    });
  } catch (err) {
    console.error('[superhuman]', err);
    return NextResponse.json(
      { tasks: [], source: 'superhuman', status: 'error' },
      { status: 500 }
    );
  }
}
