// Runs every behaviour branch end-to-end in MOCK mode and asserts the outcome.
// Usage: MOCK_MODE=1 npx tsx scripts/test-branches.ts
import { createRun, executeRun, resumeRun } from "../src/lib/pipeline";
import { getStore } from "../src/lib/store";

process.env.MOCK_MODE = "1";

const cases = [
  { name: "Priya Menon", company: "Finlark", title: "VP Finance Operations", expect: "awaiting_review", branches: ["revised"], conf: "HIGH" },
  { name: "Rahul Sharma", company: "Nimbus Systems", expect: "paused", branches: ["pause"] },
  { name: "Arjun Rao", company: "Quillbyte", expect: "awaiting_review", branches: ["pivot"] },
  { name: "Meera Iyer", company: "Tessaract Retail", expect: "hold", branches: ["hold"] },
  { name: "Kavya Nair", company: "Banyan Foods", expect: "awaiting_review", branches: ["degrade"], conf: "MEDIUM" },
];

let fail = 0;
const check = (ok: boolean, msg: string) => {
  console.log(`${ok ? "  ✓" : "  ✗"} ${msg}`);
  if (!ok) fail++;
};

async function main() {
  for (const c of cases) {
    const run = await createRun({ name: c.name, company: c.company, title: c.title, sellerId: "ai-ops" });
    await getStore().claimRun(run.id);
    const r = await executeRun(run.id);
    console.log(`\n${c.name} @ ${c.company} → ${r.status} [${r.branches.join(",")}] conf=${r.state.confidence ?? "-"}${r.error ? " ERR " + r.error : ""}`);
    check(r.status === c.expect, `status ${c.expect}`);
    for (const b of c.branches) check(r.branches.includes(b as never), `branch ${b}`);
    if (c.conf) check(r.state.confidence === c.conf, `confidence ${c.conf}`);
    if (r.state.draft) {
      console.log("   subject:", r.state.draft.subject);
      console.log("   " + r.state.draft.body.replace(/\n+/g, " ⏎ "));
      check(!/40 Under 40/.test(r.state.draft.body), "no fabricated claim in final draft");
    }
    if (r.status === "paused") {
      check((r.state.identity?.candidates.length ?? 0) >= 2, "shows candidates");
      await resumeRun(r.id, 0);
      await getStore().claimRun(r.id);
      const r2 = await executeRun(r.id);
      console.log(`   resumed → ${r2.status} target=${r2.state.target.title}`);
      check(r2.status === "awaiting_review", "resumes to draft after rep picks");
    }
    if (c.expect === "hold") console.log("   ", r.state.gate?.reasons[0], "revisit", r.state.gate?.revisitOn);
    if (c.branches.includes("pivot")) check(r.state.target.company === "Corvex Logistics", "re-targeted to new company");
    if (c.branches.includes("degrade")) check((r.state.alternates?.length ?? 0) > 0, "suggests alternate contacts");
  }

  // collision: two people at the same company in one batch
  const batchId = "b-test";
  const a = await createRun({ name: "Priya Menon", company: "Finlark", title: "VP Finance Operations", sellerId: "ai-ops", batchId });
  await getStore().claimRun(a.id);
  const ra = await executeRun(a.id);
  const b = await createRun({ name: "Dev Malhotra", company: "Finlark", title: "Head of Procurement", sellerId: "ai-ops", batchId });
  await getStore().claimRun(b.id);
  const rb = await executeRun(b.id);
  const wa = ra.state.hooks?.find((h) => h.id === ra.state.winnerId)?.signalIds.map((id) => ra.state.signals.find((s) => s.id === id)?.claim);
  const wb = rb.state.hooks?.find((h) => h.id === rb.state.winnerId)?.signalIds.map((id) => rb.state.signals.find((s) => s.id === id)?.claim);
  console.log(`\nCollision: A hook=${wa} | B hook=${wb} [${rb.branches.join(",")}]`);
  check(JSON.stringify(wa) !== JSON.stringify(wb), "two colleagues get different hooks");

  // forced collision: unknown colleague whose best signal is the one Dev already got
  const c2 = await createRun({ name: "Ananya Das", company: "Finlark", title: "Procurement Lead", sellerId: "ai-ops", batchId });
  await getStore().claimRun(c2.id);
  const rc = await executeRun(c2.id);
  const wc = rc.state.hooks?.find((h) => h.id === rc.state.winnerId)?.signalIds.map((id) => rc.state.signals.find((s) => s.id === id)?.claim);
  console.log(`   C hook=${wc} [${rc.branches.join(",")}]`);
  check(rc.branches.includes("collision-avoided"), "collision detected and avoided");
  check(JSON.stringify(wc) !== JSON.stringify(wb), "third colleague avoids the already-used hook");

  console.log(fail ? `\n${fail} check(s) failed` : "\nAll checks passed");
  process.exit(fail ? 1 : 0);
}
main();
