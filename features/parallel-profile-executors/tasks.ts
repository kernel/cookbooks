export type Task = {
  id: string;
  site: "hacker-news" | "github" | "kernel" | "simon-willison" | "ars-technica" | "techmeme" | "daily-dev";
  url: string;
  purpose: string;
};

// Each task gets its own tab and agent loop; tasks on the same site can run side by side.
export const TASKS: Task[] = [
  { id: "top-stories", site: "hacker-news", url: "https://news.ycombinator.com/", purpose: "Find discussions attracting developer attention, ranked by comment count." },
  { id: "new-projects", site: "hacker-news", url: "https://news.ycombinator.com/show", purpose: "Collect new tools to evaluate, keeping project and discussion links separate." },
  { id: "community-questions", site: "hacker-news", url: "https://news.ycombinator.com/ask", purpose: "Identify questions developers are asking that merit further research." },
  { id: "playwright-release", site: "github", url: "https://github.com/microsoft/playwright/releases/latest", purpose: "Check browser automation release changes before upgrading the test stack." },
  { id: "typescript-release", site: "github", url: "https://github.com/microsoft/TypeScript/releases/latest", purpose: "Check language tooling release notes for upgrade-relevant changes." },
  { id: "node-release", site: "github", url: "https://github.com/nodejs/node/releases/latest", purpose: "Check runtime release notes for security, fixes, and compatibility changes." },
  { id: "kernel-changelog", site: "kernel", url: "https://www.kernel.sh/changelog", purpose: "Summarize the most recent Kernel changelog entries and flag changes to Playwright execution, profiles, stealth, or browser limits." },
  { id: "llm-notes", site: "simon-willison", url: "https://simonwillison.net/", purpose: "Find posts (entries, links, quotes, and notes) from the last 24 hours and summarize what each covers. If there are none, say so and give the most recent post and its date." },
  { id: "ai-policy", site: "ars-technica", url: "https://arstechnica.com/ai/", purpose: "Find AI product and policy changes that affect developers, with the key facts from the most relevant article." },
  { id: "security-incidents", site: "ars-technica", url: "https://arstechnica.com/security/", purpose: "Find recent vulnerabilities and breaches affecting software, AI agents, or web infrastructure, with affected products and any fixes." },
  { id: "industry-context", site: "techmeme", url: "https://techmeme.com/", purpose: "Find AI and developer-industry stories with multiple reporting sources to investigate." },
  { id: "practical-lessons", site: "daily-dev", url: "https://daily.dev/blog/", purpose: "Read a practical agent or browser-engineering article and collect its section outline and excerpts for the learning queue." },
];
