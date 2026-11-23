import { listSellers } from "@/lib/sellers";
import { getStore } from "@/lib/store";
import type { SellerProfile } from "@/lib/types";

export async function GET() {
  return Response.json({ sellers: await listSellers() });
}

export async function POST(req: Request) {
  const s = (await req.json()) as SellerProfile;
  if (!s?.id || !s?.name) return Response.json({ error: "id and name required" }, { status: 400 });
  await getStore().saveSeller(s);
  return Response.json({ ok: true });
}
