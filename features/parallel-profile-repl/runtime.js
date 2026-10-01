// Loaded into Browser REPL. The model supplies workers, not this scheduler.
function createTaskRunner(config, context) {
  const records = new Map(config.tasks.map(task => [task.id, { ...task, status: "pending", attempt: 0, history: [] }]));
  const tabs = new Map();
  const workers = new Map();
  const decisions = new Map();
  const busy = new Set();
  const events = [];
  let active = 0;
  let peakActive = 0;
  let randomState = config.seed;
  let scheduled = false;

  function random() {
    randomState = (Math.imul(1664525, randomState) + 1013904223) >>> 0;
    return randomState / 4294967296;
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      const target = 1 + Math.floor(random() * config.maxActive);
      while (active < target) {
        const eligible = [...records.values()].filter(task => workers.has(task.id) && !busy.has(task.site));
        if (!eligible.length) break;
        const task = eligible[Math.floor(random() * eligible.length)];
        const worker = workers.get(task.id);
        workers.delete(task.id);
        busy.add(task.site);
        task.status = "running";
        task.startedAt = Date.now();
        active++;
        peakActive = Math.max(peakActive, active);
        events.push({ task: task.id, attempt: task.attempt, event: "start", at: task.startedAt, active, target });
        void run(task, worker);
      }
    });
  }

  async function run(task, worker) {
    try {
      if (!tabs.has(task.site)) tabs.set(task.site, await context.newPage());
      const page = tabs.get(task.site);
      page.setDefaultTimeout(10000);
      page.setDefaultNavigationTimeout(30000);
      const checkpoint = observation => {
        task.observation = JSON.parse(JSON.stringify(observation));
        task.awaitingDecision = true;
        return new Promise(resolve => decisions.set(task.id, resolve));
      };
      const result = await worker(page, Object.freeze({ id: task.id, url: task.url, purpose: task.purpose,
        requiredFields: task.requiredFields }), checkpoint);
      if (result === undefined) throw new Error("Worker must return evidence, not undefined");
      task.result = JSON.parse(JSON.stringify(result));
      for (const field of task.requiredFields ?? []) {
        const value = task.result?.[field];
        if (value == null || (typeof value === "string" && !value.trim()) ||
          (Array.isArray(value) && !value.length) ||
          (typeof value === "object" && !Object.keys(value).length)) {
          throw new Error("Missing required evidence field: " + field);
        }
      }
      task.sourceUrl = page.url();
      await page.evaluate(({ key, value }) => localStorage.setItem(key, value), {
        key: "parallel-repl-demo:" + task.id, value: config.runId,
      });
      task.status = "succeeded";
    } catch (error) {
      task.status = "failed";
      task.error = String(error);
    } finally {
      task.finishedAt = Date.now();
      decisions.delete(task.id);
      task.awaitingDecision = false;
      active--;
      busy.delete(task.site);
      events.push({ task: task.id, attempt: task.attempt, event: task.status, at: task.finishedAt, active });
      schedule();
    }
  }

  return Object.freeze({
    retry(id, worker) {
      const task = records.get(id);
      if (!task || !["succeeded", "failed"].includes(task.status)) throw new Error("Only terminal tasks can be retried");
      if (task.attempt >= 3) throw new Error("Maximum three attempts per task");
      if (typeof worker !== "function") throw new Error("Worker must be an async function");
      const { attempt, status, startedAt, finishedAt, result, error, sourceUrl } = task;
      task.history.push({ attempt, status, startedAt, finishedAt, result, error, sourceUrl });
      for (const key of ["startedAt", "finishedAt", "result", "error", "sourceUrl", "observation"]) delete task[key];
      workers.set(id, worker);
      task.attempt++;
      task.status = "queued";
      schedule();
      return { id, status: "queued", attempt: task.attempt };
    },
    resume(id, decision) {
      const resolve = decisions.get(id);
      if (!resolve) throw new Error("Task is not awaiting a decision: " + id);
      const value = JSON.parse(JSON.stringify(decision));
      decisions.delete(id);
      records.get(id).awaitingDecision = false;
      resolve(value);
      return { id, resumed: true };
    },
    enqueue(id, worker) {
      const task = records.get(id);
      if (!task) throw new Error("Unknown task: " + id);
      if (task.status !== "pending") throw new Error("Task already submitted: " + id);
      if (typeof worker !== "function") throw new Error("Worker must be an async function");
      workers.set(id, worker);
      task.attempt++;
      task.status = "queued";
      schedule();
      return { id, status: "queued" };
    },
    snapshot(ids) {
      const tasks = [...records.values()].filter(task => !ids || ids.includes(task.id));
      return JSON.parse(JSON.stringify({ tasks, active, peakActive, events,
        complete: [...records.values()].every(task => ["succeeded", "failed"].includes(task.status)) }));
    },
  });
}
