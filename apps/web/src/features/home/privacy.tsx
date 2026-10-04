import type { ReactNode } from "react";

const REPO = "https://github.com/qwontie/superteam";

const LINK =
  "text-cladd-fg underline decoration-cladd-fg-softest underline-offset-[3px] transition-colors duration-200 hover:decoration-current";

const ITEMS: { term: string; detail: ReactNode }[] = [
  {
    detail:
      "The deal you are drafting and the wallet you last connected are kept in local storage, so a reload does not lose them. The signed AI access message is kept in session storage for this tab and reused for up to 11 hours. Clearing this site's data in your browser removes all of it.",
    term: "In your browser",
  },
  {
    detail:
      "Connecting a wallet shows Pact its public address only. Your keys never leave the wallet. For AI drafts Pact may ask you to sign a short text message that proves the wallet is yours; it is not a transaction and moves no money.",
    term: "Your wallet",
  },
  {
    detail:
      "The server has no database. To limit AI drafts it counts requests per IP address and per wallet in memory; the counts reset at midnight UTC and whenever the server restarts. Its request log records your IP address, the time and what was requested.",
    term: "On our server",
  },
  {
    detail:
      "When you ask for an AI draft, your text, wallet address, time zone and current draft go to Google's Gemini API, and names in the text may be looked up on Wikidata. Your browser reads Solana through Helius, an RPC provider. When you build or open a deal that checks a fact, your browser contacts Wikidata, Bitstamp or the page the deal names. The site runs behind Cloudflare, which sees your IP address.",
    term: "Other services",
  },
  {
    detail:
      "Creating a deal writes it to Solana, publicly and for good: the title, every wallet address in it, the amount, the checks, the rules, and every signature and vote that follows. Going Pro writes your wallet address and the end date of your plan. No one, us included, can edit or delete this, so keep names, emails and other personal data out of deal titles and checks. Pact runs on Solana devnet for now.",
    term: "On the blockchain",
  },
  {
    detail:
      "Under the GDPR (RODO) you can ask what we hold about you, have it corrected or erased, object to its use, and complain to the Polish data protection authority, UODO. We can erase the server's counters and logs, and you can clear your browser storage yourself. Data written on chain cannot be erased by anyone.",
    term: "Your rights",
  },
  {
    detail: (
      <>
        Pact is built by Team Qwontie for HackYeah 2026. Open an issue at{" "}
        <a
          className={LINK}
          href={REPO}
          rel="noopener noreferrer"
          target="_blank"
        >
          github.com/qwontie/superteam
        </a>
        .
      </>
    ),
    term: "Contact",
  },
];

export function Privacy() {
  return (
    <section
      aria-labelledby="privacy-heading"
      className="grid scroll-mt-24 items-start gap-8 lg:grid-cols-[minmax(0,11fr)_minmax(0,14fr)] lg:gap-14"
      id="privacy"
    >
      <div className="flex flex-col gap-4">
        <h2
          className="font-display font-semibold text-2xl tracking-tight"
          id="privacy-heading"
        >
          Privacy and cookies
        </h2>
        <p className="max-w-[30rem] text-pretty text-cladd-fg-soft leading-relaxed">
          Pact sets no cookies and runs no analytics or tracking, so there is
          nothing to consent to. Here is what it keeps and where your data goes.
        </p>
      </div>
      <dl className="flex flex-col">
        {ITEMS.map(({ term, detail }) => (
          <div
            className="grid gap-1.5 py-4 shadow-[0_-1px_0_var(--color-cladd-bg-outline)] first:pt-0 first:shadow-none sm:grid-cols-[9.5rem_minmax(0,1fr)] sm:gap-6"
            key={term}
          >
            <dt className="font-medium text-cladd-fg text-sm">{term}</dt>
            <dd className="max-w-[68ch] text-pretty text-cladd-fg-soft text-sm leading-relaxed">
              {detail}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
