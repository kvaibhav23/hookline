import type { SellerProfile } from "./types";
import { getStore } from "./store";

// Seller profiles = "what are we selling". Personalisation only works if the hook
// connects the prospect's situation to something specific we offer.
// Edit these in the app (/sellers) — rename the first one to the company you're pitching for.

export const DEFAULT_SELLERS: SellerProfile[] = [
  {
    id: "ai-ops",
    name: "Your Company (AI ops automation) — rename me",
    website: "",
    oneLiner: "We build AI-run operational processes for finance and ops teams — invoice processing, vendor onboarding and GTM execution — that handle messy real inputs end-to-end.",
    valueProps: [
      { id: "V1", title: "Invoice processing on autopilot", description: "Extract, match and route vendor invoices (PDF, email, scans) with exceptions escalated to humans; cuts manual AP effort and shortens month-end close." },
      { id: "V2", title: "Vendor onboarding without the back-and-forth", description: "Collect and verify vendor documents, KYC and bank details automatically; new suppliers go live in days, not weeks." },
      { id: "V3", title: "GTM execution that scales", description: "Research-backed, personalised outreach and CRM hygiene handled by an AI process with a human approving every send." },
    ],
    proofPoints: [
      { id: "P1", text: "A mid-size fintech moved most of its invoice volume to automated processing within a quarter." },
      { id: "P2", text: "A logistics company cut vendor onboarding time from weeks to days." },
    ],
    targetPersonas: ["CFO", "VP / Head of Finance Operations", "Financial Controller", "Head of Procurement", "COO", "Head of Sales / RevOps"],
    competitors: [],
    customers: [],
    senderName: "Vaibhav",
    senderTitle: "AI Solutions",
    cta: "Worth a 20-minute call next week to see if this fits?",
    tone: "Warm, plain-spoken, concise. No hype words. Sounds like a thoughtful peer, not a marketer.",
  },
  {
    id: "cloud-cost",
    name: "CloudLedger (demo seller) — cloud cost optimisation",
    website: "",
    oneLiner: "CloudLedger finds and removes wasted cloud spend for fast-growing engineering teams.",
    valueProps: [
      { id: "V1", title: "Spend visibility per team", description: "Allocates every rupee of AWS/GCP spend to the team and feature that caused it." },
      { id: "V2", title: "Automated rightsizing", description: "Safely rightsizes idle and over-provisioned resources, typically cutting cloud bills 20–30%." },
    ],
    proofPoints: [{ id: "P1", text: "A Series B SaaS company cut its monthly cloud bill by a quarter in six weeks." }],
    targetPersonas: ["CTO", "VP Engineering", "Head of Platform", "CFO"],
    competitors: [],
    customers: [],
    senderName: "Vaibhav",
    senderTitle: "CloudLedger",
    cta: "Open to a quick look at where your spend is going?",
    tone: "Direct and numerate. Short sentences.",
  },
];

export async function listSellers(): Promise<SellerProfile[]> {
  const stored = await getStore().listSellers();
  const byId = new Map(DEFAULT_SELLERS.map((s) => [s.id, s]));
  for (const s of stored) byId.set(s.id, s);
  return [...byId.values()];
}

export async function getSeller(id: string): Promise<SellerProfile> {
  const all = await listSellers();
  return all.find((s) => s.id === id) || all[0];
}
