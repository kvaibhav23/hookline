import { connection } from "next/server";
import { health } from "@/lib/config";

export async function GET() {
  await connection(); // evaluate at request time so newly-added keys are picked up
  return Response.json(health());
}
