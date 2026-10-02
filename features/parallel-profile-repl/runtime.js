// Loaded into Browser REPL. REPL cells run one at a time, so each task's code runs
// as a background job on that task's own tab and the harness polls for its output.
function createTabRunner(context, { jobTimeoutMs = 60000, maxOutputChars = 8000 } = {}) {
  const tabs = new Map();
  const jobs = new Map();
  let lastJobId = 0;

  return Object.freeze({
    async open(taskId) {
      if (tabs.has(taskId)) throw new Error("Tab already open for task " + taskId);
      const page = await context.newPage();
      page.setDefaultTimeout(10000);
      page.setDefaultNavigationTimeout(30000);
      tabs.set(taskId, { page, state: {} });
      return { taskId, openTabs: tabs.size };
    },
    async close(taskId) {
      const tab = tabs.get(taskId);
      tabs.delete(taskId);
      await tab?.page.close();
      return { taskId, openTabs: tabs.size };
    },
    start(taskId, fn) {
      const tab = tabs.get(taskId);
      if (!tab) throw new Error("No open tab for task " + taskId);
      const job = { done: false, output: "" };
      const write = value => {
        job.output += typeof value === "string" ? value : JSON.stringify(value);
        if (job.output.length > maxOutputChars) job.output = job.output.slice(0, maxOutputChars) + " [output truncated]";
      };
      let timer;
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Code still running after ${jobTimeoutMs / 1000}s`)), jobTimeoutMs);
      });
      Promise.race([Promise.resolve().then(() => fn(tab.page, tab.state, { write })), timeout])
        .then(value => { if (value !== undefined) write(value); },
          error => { job.error = String(error?.message ?? error); })
        .finally(() => { clearTimeout(timer); job.done = true; });
      jobs.set(++lastJobId, job);
      return lastJobId;
    },
    poll(jobId) {
      const job = jobs.get(jobId);
      if (!job) throw new Error("Unknown job " + jobId);
      if (job.done) jobs.delete(jobId);
      return job;
    },
  });
}
