export type Task = {
  id: string;
  site: "hacker-news" | "github" | "wikipedia" | "techmeme" | "daily-dev";
  url: string;
  purpose: string;
  requiredFields?: string[];
};

// Any subset can be submitted. Tasks sharing a site reuse its tab, one at a time.
export const TASKS: Task[] = [
  { id: "top-stories", site: "hacker-news", url: "https://news.ycombinator.com/", purpose: "Find discussions attracting developer attention, ranked by comment count." },
  { id: "new-projects", site: "hacker-news", url: "https://news.ycombinator.com/show", purpose: "Collect new tools to evaluate, keeping project and discussion links separate." },
  { id: "community-questions", site: "hacker-news", url: "https://news.ycombinator.com/ask", purpose: "Identify questions developers are asking that merit further research." },
  { id: "playwright-release", site: "github", url: "https://github.com/microsoft/playwright/releases/latest", purpose: "Check browser automation release changes before upgrading the test stack." },
  { id: "typescript-release", site: "github", url: "https://github.com/microsoft/TypeScript/releases/latest", purpose: "Check language tooling release notes for upgrade-relevant changes." },
  { id: "node-release", site: "github", url: "https://github.com/nodejs/node/releases/latest", purpose: "Check runtime release notes for security, fixes, and compatibility changes." },
  { id: "browser-background", site: "wikipedia", url: "https://en.wikipedia.org/wiki/Headless_browser", purpose: "Explain headless browsers so the automation release notes have context." },
  { id: "websocket-background", site: "wikipedia", url: "https://en.wikipedia.org/wiki/WebSocket", purpose: "Explain the transport used by persistent browser-control connections." },
  { id: "chromium-background", site: "wikipedia", url: "https://en.wikipedia.org/wiki/Chromium_(web_browser)", purpose: "Explain Chromium's role in the browser automation stack." },
  { id: "industry-context", site: "techmeme", url: "https://techmeme.com/", purpose: "Find AI and developer-industry stories with multiple reporting sources to investigate." },
  { id: "practical-lessons", site: "daily-dev", url: "https://daily.dev/blog/", purpose: "Read a practical agent or browser-engineering article and collect its section outline and excerpts for the learning queue." },
];

// Validate evidence shape without prescribing how the model reads each site.
for (const task of TASKS) {
  task.requiredFields = {
    "hacker-news": ["stories"],
    github: ["release", "upgradeNotes"],
    wikipedia: ["definition", "context"],
    techmeme: ["stories"],
    "daily-dev": ["title", "outline", "excerpts"],
  }[task.site];
}
