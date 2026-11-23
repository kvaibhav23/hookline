import Link from "next/link";

const STEPS = [
  ["Find the right person", "Search public profiles. If several people match (two Rahul Sharmas at one company), stop and ask the rep instead of guessing."],
  ["Check they're still there", "Lists go stale. If the person has moved companies, research the new company and use the move itself as the reason to write."],
  ["Gather signals", "Search six places in parallel: things they've said, company news, funding, hiring, the company itself, and red flags. If one source fails, the run carries on."],
  ["Turn pages into facts", "Each signal is one dated fact with a verbatim quote from its source. If the quote isn't actually on the page, the fact is thrown out."],
  ["Decide whether to reach out at all", "Layoffs this month, an existing customer, a competitor: the process holds and gives a date to try again. Personal-life details are never used."],
  ["Pick the best angle", "Three angles are pitched, each linking a signal → a likely problem → one thing we sell. A separate judge scores them, and the best one wins."],
  ["Write short", "Under ~110 words, starts with their world rather than ours, one ask, plus a LinkedIn version."],
  ["Prove every claim", "A fact-checker matches each claim in the email to a source. Anything unsupported is sent back for a rewrite, then cut if it's still unsupported."],
  ["A human decides", "The rep sees the draft with the source behind every fact, edits, then approves or rejects. Nothing is sent automatically. Edits are measured."],
];

export default function HowItWorks() {
  return (
    <div className="max-w-3xl">
      <p className="label">For the people who&apos;ll use it</p>
      <h1 className="text-3xl font-semibold tracking-tight mt-1">How Hookline works, in plain English</h1>
      <p className="text-muted mt-3">
        A rep with 200 prospects can&apos;t spend 20 minutes researching each one, so they send generic emails that get ignored. Hookline does that research in under a minute and writes a draft that mentions something real. It is built to do three things a rushed human doesn&apos;t:{" "}
        <b className="text-ink">show where every fact came from</b>, <b className="text-ink">say when not to send</b>, and <b className="text-ink">ask when it isn&apos;t sure</b>.
      </p>

      <ol className="mt-8 space-y-3">
        {STEPS.map(([t, d], i) => (
          <li key={t} className="card p-4 flex gap-4">
            <span className="w-7 h-7 shrink-0 rounded-full bg-ink text-white grid place-items-center text-xs font-semibold">{i + 1}</span>
            <div>
              <p className="font-medium">{t}</p>
              <p className="text-sm text-muted mt-0.5">{d}</p>
            </div>
          </li>
        ))}
      </ol>

      <h2 className="text-xl font-semibold mt-10">Four situations where it behaves differently</h2>
      <div className="grid md:grid-cols-2 gap-3 mt-4">
        {[
          ["⏸ Pause", "Several people share the name.", "Stops and asks the rep to pick. Emailing the wrong person is worse than waiting a minute."],
          ["↪ Pivot", "The person changed jobs.", "Re-targets the new company, uses the new role as the hook and flags the CRM record."],
          ["✋ Hold", "Layoffs, a crisis, or they're already a customer.", "Writes nothing. Explains why and when to try again."],
          ["⤓ Degrade", "Almost nothing about them is public.", "Falls back to team, then company signals. Writes a short, honest note and suggests better-documented colleagues."],
        ].map(([t, w, d]) => (
          <div key={t} className="card p-4">
            <p className="font-semibold">{t}</p>
            <p className="text-sm mt-1">
              <span className="text-muted">When:</span> {w}
            </p>
            <p className="text-sm mt-1">
              <span className="text-muted">Does:</span> {d}
            </p>
          </div>
        ))}
      </div>

      <h2 className="text-xl font-semibold mt-10">Deliberate choices</h2>
      <ul className="mt-3 space-y-2 text-sm">
        <li>
          • <b>No LinkedIn scraping.</b> It uses the public web, and reps can paste what they already know. Scraping LinkedIn breaks its terms, and LinkedIn has sued companies that do it.
        </li>
        <li>
          • <b>Rules you can read.</b> The decision to hold off is made by explicit rules, so you can always see exactly why.
        </li>
        <li>
          • <b>Cost and time are shown on every run</b>, so the business case is visible rather than assumed.
        </li>
        <li>
          • <b>The main metric is the share of drafts approved with less than 10% edits.</b> That is what tells you the drafts are genuinely send-ready.
        </li>
      </ul>

      <Link href="/" className="btn btn-primary mt-8">
        Try it →
      </Link>
    </div>
  );
}
