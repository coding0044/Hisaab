import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Hisaab — Shared ledger for Faraz & Mir" },
      { name: "description", content: "Track shared expenses, loans and cash repayments in PKR between Faraz Ahmed and Mir Hassan." },
      { property: "og:title", content: "Hisaab — Shared ledger for Faraz & Mir" },
      { property: "og:description", content: "Track shared expenses, loans and repayments in PKR." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
});
