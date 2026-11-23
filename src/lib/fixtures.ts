import type { SearchHit, SearchQuery } from "./search";

// MOCK-MODE FIXTURES — fictional people and companies, used only for development
// and automated tests of every branch (happy / pause / pivot / hold / degrade / collision).
// Live mode never touches this file.

const ago = (d: number) => new Date(Date.now() - d * 864e5).toISOString();

type Lane = "identity" | "freshness" | "person" | "news" | "funding" | "hiring" | "company" | "risk" | "alternates";

interface Scenario {
  match: RegExp;
  lanes: Partial<Record<Lane, SearchHit[]>>;
}

const SCENARIOS: Scenario[] = [
  // Happy path (+ collision partner Dev Malhotra at the same company)
  {
    match: /finlark/i,
    lanes: {
      identity: [
        {
          url: "https://in.linkedin.com/in/priya-menon-finops",
          title: "Priya Menon – VP Finance Operations – Finlark",
          text: "Priya Menon. VP Finance Operations at Finlark, Bengaluru. Previously Financial Controller at a consumer lending company. Leads accounts payable, treasury ops and month-end close.",
        },
        {
          url: "https://in.linkedin.com/in/dev-malhotra-procurement",
          title: "Dev Malhotra – Head of Procurement – Finlark",
          text: "Dev Malhotra. Head of Procurement at Finlark, Bengaluru. Responsible for vendor onboarding and supplier contracts.",
        },
      ],
      person: [
        {
          url: "https://cfostack.example/podcast/42-priya-menon",
          title: "CFO Stack Podcast Ep. 42 — Priya Menon on closing the books faster",
          publishedDate: ago(25),
          text: "On the CFO Stack podcast, Priya Menon, VP Finance Operations at Finlark, said the team still processes most vendor invoices by hand and month-end close takes nine working days. Our goal for next year is a three-day close, she said. She added that invoice volume has tripled since 2025.",
        },
      ],
      news: [
        {
          url: "https://startupwire.example/finlark-series-b",
          title: "Finlark raises $40M Series B to expand into Southeast Asia",
          publishedDate: ago(20),
          text: "Bengaluru-based Finlark has raised $40 million in a Series B round led by Northgate Ventures. The company said it will use the funds to expand into Southeast Asia and double its merchant base over the next 18 months.",
        },
      ],
      funding: [
        {
          url: "https://startupwire.example/finlark-series-b",
          title: "Finlark raises $40M Series B to expand into Southeast Asia",
          publishedDate: ago(20),
          text: "Bengaluru-based Finlark has raised $40 million in a Series B round led by Northgate Ventures. The company said it will use the funds to expand into Southeast Asia and double its merchant base over the next 18 months.",
        },
      ],
      hiring: [
        {
          url: "https://careers.finlark.example/ap-specialist",
          title: "Finlark Careers — Accounts Payable Specialist (4 openings)",
          publishedDate: ago(12),
          text: "Finlark is hiring four Accounts Payable Specialists to manage a growing volume of vendor invoices across India and Singapore. Experience with three-way matching and GST reconciliation required.",
        },
        {
          url: "https://careers.finlark.example/vendor-onboarding",
          title: "Finlark Careers — Vendor Onboarding Analyst",
          publishedDate: ago(9),
          text: "Finlark is hiring a Vendor Onboarding Analyst to run KYC and document checks for new suppliers as the company enters Singapore and Malaysia.",
        },
      ],
      company: [
        {
          url: "https://finlark.example",
          title: "Finlark — Payments infrastructure for SMB merchants",
          text: "Finlark builds payments and working-capital infrastructure for small and mid-sized merchants in India.",
        },
      ],
    },
  },
  // PAUSE: ambiguous common name
  {
    match: /nimbus/i,
    lanes: {
      identity: [
        {
          url: "https://in.linkedin.com/in/rahul-sharma-fin-pune",
          title: "Rahul Sharma – Senior Manager, Finance – Nimbus Systems",
          text: "Rahul Sharma. Senior Manager, Finance at Nimbus Systems, Pune. Accounts payable and vendor payments.",
        },
        {
          url: "https://in.linkedin.com/in/rahulsharma-ops",
          title: "Rahul Sharma – Director, Business Operations – Nimbus Systems",
          text: "Rahul Sharma. Director, Business Operations at Nimbus Systems, Bengaluru. Runs procurement and partner operations.",
        },
        {
          url: "https://in.linkedin.com/in/rahul-sharma-dev",
          title: "Rahul Sharma – Software Engineer II – Nimbus Systems",
          text: "Rahul Sharma. Software Engineer II at Nimbus Systems, Hyderabad. Backend services in Go.",
        },
      ],
      news: [
        {
          url: "https://biznews.example/nimbus-pune-gcc",
          title: "Nimbus Systems opens 800-seat global capability centre in Pune",
          publishedDate: ago(30),
          text: "Nimbus Systems has opened an 800-seat global capability centre in Pune that will house its finance shared services and procurement teams.",
        },
      ],
      hiring: [
        {
          url: "https://careers.nimbus.example/ap-lead",
          title: "Nimbus Systems — AP Team Lead, Pune GCC",
          publishedDate: ago(14),
          text: "Nimbus Systems is hiring an AP Team Lead for its Pune GCC to set up invoice processing for 3 business units.",
        },
      ],
      company: [{ url: "https://nimbus.example", title: "Nimbus Systems", text: "Nimbus Systems is an enterprise software and IT services company." }],
    },
  },
  // PIVOT: person changed company
  {
    match: /quillbyte|corvex|arjun rao/i,
    lanes: {
      identity: [
        {
          url: "https://in.linkedin.com/in/arjun-rao-procurement",
          title: "Arjun Rao – Head of Procurement – Corvex Logistics",
          text: "Arjun Rao. Head of Procurement at Corvex Logistics since September 2026. Previously Procurement Manager at Quillbyte (2021–2026).",
        },
      ],
      freshness: [
        {
          url: "https://logisticsnow.example/corvex-appoints-arjun-rao",
          title: "Corvex Logistics appoints Arjun Rao as Head of Procurement",
          publishedDate: ago(50),
          text: "Corvex Logistics has appointed Arjun Rao, formerly of Quillbyte, as Head of Procurement. Rao will lead the consolidation of Corvex's 1,200-vendor supplier base.",
        },
      ],
      news: [
        {
          url: "https://logisticsnow.example/corvex-warehouses",
          title: "Corvex Logistics to add three warehouses in North India",
          publishedDate: ago(35),
          text: "Corvex Logistics will add three new warehouses in Lucknow, Jaipur and Ludhiana by March, the company said.",
        },
      ],
      hiring: [
        {
          url: "https://careers.corvex.example/vendor-onboarding",
          title: "Corvex Logistics — Vendor Onboarding Executive (3 openings)",
          publishedDate: ago(16),
          text: "Corvex Logistics is hiring three Vendor Onboarding Executives to verify documents and set up new transport vendors.",
        },
      ],
      company: [{ url: "https://corvex.example", title: "Corvex Logistics", text: "Corvex Logistics is a third-party logistics provider in India." }],
    },
  },
  // HOLD: layoffs last week
  {
    match: /tessaract/i,
    lanes: {
      identity: [
        {
          url: "https://in.linkedin.com/in/meera-iyer-finance",
          title: "Meera Iyer – Director, Finance – Tessaract Retail",
          text: "Meera Iyer. Director, Finance at Tessaract Retail, Chennai.",
        },
      ],
      risk: [
        {
          url: "https://retailtimes.example/tessaract-layoffs",
          title: "Tessaract Retail lays off 400 employees amid restructuring",
          publishedDate: ago(9),
          text: "Tessaract Retail said it will lay off about 400 employees, roughly 12% of its workforce, as part of a restructuring of its store operations.",
        },
      ],
      news: [
        {
          url: "https://retailtimes.example/tessaract-layoffs",
          title: "Tessaract Retail lays off 400 employees amid restructuring",
          publishedDate: ago(9),
          text: "Tessaract Retail said it will lay off about 400 employees, roughly 12% of its workforce, as part of a restructuring of its store operations.",
        },
        {
          url: "https://retailtimes.example/tessaract-app",
          title: "Tessaract Retail launches loyalty app",
          publishedDate: ago(80),
          text: "Tessaract Retail launched a loyalty app across its 140 stores.",
        },
      ],
      company: [{ url: "https://tessaract.example", title: "Tessaract Retail", text: "Tessaract Retail runs 140 apparel stores in South India." }],
    },
  },
  // DEGRADE: no public footprint
  {
    match: /banyan/i,
    lanes: {
      identity: [],
      hiring: [
        {
          url: "https://jobs.example/banyan-accounts-exec",
          title: "Banyan Foods — Accounts Executive (Kochi)",
          publishedDate: ago(40),
          text: "Banyan Foods is looking for an Accounts Executive to handle vendor payments and GST reconciliation for its growing distributor network.",
        },
      ],
      company: [{ url: "https://banyanfoods.example", title: "Banyan Foods", text: "Banyan Foods makes packaged regional snacks sold through distributors in Kerala and Tamil Nadu." }],
      alternates: [
        {
          url: "https://in.linkedin.com/in/thomas-kurian-banyan",
          title: "Thomas Kurian – Finance Controller – Banyan Foods",
          text: "Thomas Kurian. Finance Controller at Banyan Foods, Kochi. Speaker at Kerala CFO Forum 2026.",
        },
      ],
    },
  },
];

export function mockSearch(q: SearchQuery): SearchHit[] {
  const sc = SCENARIOS.find((s) => s.match.test(q.query));
  if (!sc) return [];
  const lane = (q.lane || "news") as Lane;
  let hits = sc.lanes[lane] || [];
  // identity search returns only candidates whose name matches the query (except ambiguous scenario)
  if (lane === "identity") {
    const first = q.query.split(" ")[0].toLowerCase();
    hits = hits.filter((h) => h.title.toLowerCase().includes(first));
  }
  // person lane: only content that mentions the quoted person name
  if (lane === "person") {
    const name = q.query.match(/"([^"]+)"/)?.[1]?.toLowerCase();
    hits = name ? hits.filter((h) => h.text.toLowerCase().includes(name)) : [];
  }
  return hits;
}
