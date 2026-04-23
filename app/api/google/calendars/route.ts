import { listCalendars, unlink } from "@/lib/google";

export async function GET() {
  try {
    const cals = await listCalendars();
    return Response.json({ calendars: cals });
  } catch (e: any) {
    return Response.json({ error: e.message, calendars: [] }, { status: 500 });
  }
}

export async function DELETE() {
  await unlink();
  return Response.json({ ok: true });
}
