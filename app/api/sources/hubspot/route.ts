import { NextResponse } from 'next/server';
import { fetchHubSpot } from '@/lib/sources/hubspot';

export async function GET() {
  try {
    const result = await fetchHubSpot();
    return NextResponse.json({
      tasks: result.tasks,
      source: 'hubspot',
      status: result.status,
    });
  } catch (err) {
    console.error('[hubspot]', err);
    return NextResponse.json(
      { tasks: [], source: 'hubspot', status: 'error' },
      { status: 500 }
    );
  }
}
