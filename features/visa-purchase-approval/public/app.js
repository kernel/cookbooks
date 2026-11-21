const start = document.querySelector("#start");
const refresh = document.querySelector("#refresh");
const approval = document.querySelector("#approval");
const status = document.querySelector("#status");
let timer;

async function update(method = "GET") {
  clearTimeout(timer);
  start.disabled = true;
  refresh.disabled = true;
  try {
    const response = await fetch("/api/purchase", {
      method,
      cache: "no-store",
    });
    const data = await response.json();
    status.textContent = data.message;
    if (data.purchase) {
      document.querySelector("#merchant").textContent = data.purchase.merchant;
      document.querySelector("#amount").textContent = new Intl.NumberFormat(
        "en",
        {
          style: "currency",
          currency: data.purchase.currency,
        },
      ).format(data.purchase.amount / 100);
    }
    start.hidden = Boolean(data.started);
    start.disabled = !data.configured;
    refresh.hidden = !data.started;
    approval.hidden = !data.approvalURL;
    if (data.approvalURL) approval.href = data.approvalURL;
    else approval.removeAttribute("href");
    if (response.ok && data.approvalURL && !data.ready) {
      timer = setTimeout(() => update(), 2000);
    }
  } catch {
    status.textContent =
      "status unavailable. check the existing purchase before taking another action.";
    start.disabled = true;
    refresh.hidden = false;
  } finally {
    refresh.disabled = false;
  }
}

start.addEventListener("click", () => update("POST"));
refresh.addEventListener("click", () => update());
update();
