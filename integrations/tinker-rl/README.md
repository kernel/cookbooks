# Computer Use RL with Kernel + Tinker

Train vision-language model (VLM) agents to perform computer use tasks using reinforcement learning.

This repository provides the infrastructure to train agents that can navigate websites, fill forms, click buttons, and complete complex web tasks—all learned from experience with real browsers.

**Key Technologies:**

- [**Kernel**](https://docs.onkernel.com) — Browser-as-a-service for scalable web environments
- [**Tinker**](https://tinker-docs.thinkingmachines.ai/) — Cloud training platform for RL with large models, including VLMs (announced [December 12th, 2025](https://thinkingmachines.ai/blog/tinker-general-availability/))
- [**WebJudge**](https://github.com/OSU-NLP-Group/Online-Mind2Web) — LLM-as-judge reward model for trajectory evaluation from the [Online-Mind2Web benchmark](https://arxiv.org/abs/2504.01382)

## Why This Approach?

Training computer use agents with RL requires three things:

1. **Environments** — Real browsers that agents can interact with
2. **Reward Signals** — A way to evaluate whether the agent succeeded
3. **Training Infrastructure** — Efficient gradient computation for large VLMs

This repo solves all three:

- **Kernel Browser Pools** provide pre-warmed browsers for fast, parallel environment interaction
- **WebJudge** evaluates trajectories using an LLM judge (85.7% human agreement)
- **Tinker** handles the GPU-heavy forward/backward passes in the cloud

---

## Quick Start

### 1. Install Dependencies

```bash
# Clone the repo
git clone https://github.com/onkernel/kernel-tinker-rl.git
cd kernel-tinker-rl

# Create virtual environment and install
uv venv
uv sync
```

### 2. Set Up API Keys

Create a `.env` file in the project root:

```bash
# Required
KERNEL_API_KEY=your-kernel-key      # https://onkernel.com
TINKER_API_KEY=your-tinker-key      # https://thinkingmachines.ai/tinker
OPENROUTER_API_KEY=your-openrouter-key  # https://openrouter.ai

# Optional
WANDB_API_KEY=your-wandb-key        # For experiment tracking
```

### 3. Create a Browser Pool

Browser pools are a key feature that makes RL training efficient. Instead of creating a new browser for each episode (slow), pools maintain pre-warmed browsers ready for instant use.

```bash
# Install Kernel CLI
brew install onkernel/tap/kernel

# Create a browser pool with 10 browsers
kernel browser-pool create --name rl-training --size 50

# Verify the pool is ready
kernel browser-pool list
```

See [Kernel Browser Pools Documentation](https://www.onkernel.com/docs/browsers/pools) for more details.

### 4. Run Your First Agent

The agent is based on the [OSWorld](https://github.com/xlang-ai/OSWorld) computer use agent architecture (see [paper](https://arxiv.org/abs/2404.07972)). The default policy is `Qwen/Qwen3.6-35B-A3B`, a vision-language model Tinker both serves for sampling and fine-tunes with LoRA.

```bash
# Run an agent on a website
uv run python -m scripts.run_agent \
    --url https://github.com \
    --task "Navigate to the sign in page"

# With WebJudge evaluation at the end
uv run python -m scripts.run_agent \
    --url https://github.com \
    --task "Navigate to the sign in page" \
    --webjudge
```

### 5. Split Dataset for Training

Create train/eval splits from a task dataset:

```bash
# Split the agent_auth tasks (80% train, 20% eval)
uv run python -m scripts.split_dataset examples/agent_auth/tasks.jsonl

# This creates:
#   examples/agent_auth/tasks_train.jsonl (training set)
#   examples/agent_auth/tasks_eval.jsonl  (held-out evaluation set)
```

### 6. Evaluate Baseline Performance

Before training, measure the base model's performance on the eval set:

```bash
uv run python -m scripts.evaluate \
    --env agent_auth \
    --task-file examples/agent_auth/tasks_eval.jsonl \
    --pool-name rl-training \
    --output results/baseline_eval.json
```

### 7. Train with RL

Smoke test the loop first. One step, one episode, one browser:

```bash
kernel browser-pool create --name tinker-rl-smoke --size 1 --stealth --timeout 300

uv run python -m scripts.train \
    --env agent_auth \
    --pool-name tinker-rl-smoke \
    --batch-size 1 --group-size 1 --max-tasks 1 --max-steps 1 \
    --lora-rank 1 --max-tokens 128 \
    --eval-every 0 --save-every 1 \
    --acquire-timeout 180 \
    --no-webjudge

kernel browser-pool delete tinker-rl-smoke
```

Then run GRPO training on the training set:

```bash
uv run python -m scripts.train \
    --env agent_auth \
    --task-file examples/agent_auth/tasks_train.jsonl \
    --pool-name rl-training \
    --wandb-project my-agent-training
```

Training outputs checkpoints to `./results/<run_name>/`. See the Tinker logs for checkpoint paths (e.g., `tinker://model_id/checkpoint_name`).

**Base models get retired.** Tinker drops models from its supported list periodically, and training
against a retired id fails with `400 - base_model <id> is not supported`. The default model and its
renderer live in one place, `core/prompts.py` (`MODEL_NAME`, `RENDERER_NAME`); update them together
when that happens. See the [Tinker deprecations page](https://tinker-docs.thinkingmachines.ai/tinker/model-deprecations)
for replacements, and [docs/getting-started.md](docs/getting-started.md) for how to check what is
currently served.

### 8. Evaluate the Trained Model

Compare your trained model against the baseline on the held-out eval set:

```bash
# Evaluate using a Tinker checkpoint
uv run python -m scripts.evaluate \
    --env agent_auth \
    --task-file examples/agent_auth/tasks_eval.jsonl \
    --model tinker://your-model-id/checkpoint-step-50 \
    --pool-name rl-training \
    --output results/trained_eval.json
```

Compare `results/baseline_eval.json` and `results/trained_eval.json` to measure improvement.

---

## Core Concepts

### The Agent Loop

The agent follows a simple observation-action loop:

```
┌─────────────┐     ┌─────────────┐     ┌───────────────────┐
│  Screenshot │────>│  VLM Agent  │────>│      Action       │
│  (1920x1080)│     │  (Qwen VLM) │     │ (click,type,etc.) │
└─────────────┘     └─────────────┘     └───────────────────┘
       ▲                                          │
       │                                          ▼
       │            ┌─────────────┐               │
       └────────────│   Browser   │<──────────────┘
                    │  (Kernel)   │
                    └─────────────┘
```

1. Capture a screenshot of the current browser state
2. Send screenshot + task to the VLM agent
3. Agent outputs an action (click, type, scroll, etc.)
4. Execute the action in the browser
5. Repeat until task is complete or max steps reached

### Browser Pools for RL

RL training requires running many parallel episodes. [Browser pools](https://www.onkernel.com/docs/browsers/pools) make this efficient:

```python
from kernel import Kernel
from core import acquired_browser

kernel = Kernel()

# Use the context manager for automatic acquire/release
with acquired_browser(kernel, "rl-training") as adapter:
    adapter.navigate("https://example.com")
    screenshot = adapter.capture_screenshot()
    # ... agent loop ...
# Browser automatically released back to pool
```

**Key benefits of browser pools:**

- **Instant acquisition** — Pre-warmed browsers are ready in <100ms
- **Browser reuse** — Released browsers return to the pool for reuse, maximizing infrastructure efficiency
- **Thread-safe** — `acquire()` is thread-safe; many threads can acquire simultaneously without conflicts

### WebJudge: LLM-as-Reward-Model

Training RL agents requires reward signals. WebJudge provides these by evaluating trajectories with an LLM:

```python
from core import WebJudge, Trajectory

webjudge = WebJudge(model="openai/gpt-5-mini")

trajectory = Trajectory(
    task_id="example",
    task="Navigate to the login page",
    action_history=["Click Sign In button", "Wait for page load"],
    screenshots=[screenshot1, screenshot2],
)

result = await webjudge.evaluate(trajectory)
print(f"Success: {result.success}, Score: {result.score}")
```

WebJudge uses a 3-phase evaluation:

1. **Key Point Identification** — Extract critical requirements from the task
2. **Screenshot Scoring** — Score each screenshot for relevance (1-5)
3. **Outcome Judgment** — Final success/failure based on key screenshots

This approach achieves 85.7% agreement with human evaluators (see the [Online-Mind2Web paper](https://arxiv.org/abs/2504.01382)).

### GRPO: Group Relative Policy Optimization

The training uses GRPO, which:

1. Runs multiple rollouts for the same task (a "group")
2. Computes advantages relative to the group mean
3. Updates the policy using importance sampling

```
Task: "Find the login page"
├── Rollout 1: Clicks "Sign In" → reward=1.0
├── Rollout 2: Gets lost → reward=0.0
├── Rollout 3: Clicks "Sign In" → reward=1.0
└── Rollout 4: Gets lost → reward=0.0

Group mean = 0.5
Advantage(1) = 1.0 - 0.5 = +0.5 (reinforce this)
Advantage(2) = 0.0 - 0.5 = -0.5 (discourage this)
```

---

## Project Structure

```
kernel-tinker-rl/
├── README.md                     # This file
├── pyproject.toml                # Dependencies and project config
│
├── core/                          # Generic, reusable infrastructure
│   ├── agent.py                   # QwenAgent VLM agent
│   ├── actions.py                 # Action types (click, type, scroll, etc.)
│   ├── browser.py                 # Kernel browser adapters
│   ├── prompts.py                 # System prompt utilities
│   ├── utils.py                   # Image processing, environment setup
│   └── reward_models/
│       ├── base.py                # Abstract reward model interface
│       └── webjudge.py            # WebJudge implementation
│
├── scripts/                        # Runnable programs
│   ├── run_agent.py               # Run agent on a single task
│   ├── train.py                   # RL training loop
│   ├── evaluate.py                # Evaluate with WebJudge
│   ├── plot_metrics.py            # Plot training metrics
│   ├── split_dataset.py           # Create train/eval splits
│   ├── download_checkpoint.py     # Download LoRA weights from Tinker
│   ├── merge_lora.py              # Merge LoRA adapter into base model
│   ├── modal_sglang_serve.py      # Deploy model with SGLang on Modal
│   └── modal_vllm_serve.py        # Deploy model with vLLM on Modal
│
├── examples/                       # Custom use cases
│   └── agent_auth/                 # Login discovery example
│       ├── README.md
│       ├── tasks.jsonl             # Pre-processed task data
│       ├── actions.py              # Custom actions
│       ├── environment.py          # RL environment
│       └── dataset.py              # Dataset builder
│
├── data/                           # Task data (gitignored)
└── docs/                           # Additional documentation
    ├── getting-started.md          # Detailed setup guide
    ├── architecture.md             # System architecture
    └── custom-environments.md      # Build your own use cases
```

**📚 See the [docs/](./docs/) folder for detailed guides.**

---

## Task Data Format

Tasks use a simple JSON Lines format:

```json
{"id": "abc123", "initial_url": "https://github.com", "task": "Navigate to the sign in page"}
{"id": "def456", "initial_url": "https://linkedin.com", "task": "Find the job search feature"}
```

Each task has:

- `id`: Unique identifier
- `initial_url`: Starting URL for the browser
- `task`: Natural language task description

---

## Extending for Your Use Case

### Adding Custom Actions

Create a new action by extending the `Action` base class:

```python
from dataclasses import dataclass
from typing import ClassVar
from core import Action


@dataclass
class MyCustomAction(Action):
    """My custom action."""

    some_field: str

    action_type: ClassVar[str] = "my_custom_action"
    description: ClassVar[str] = "Do something custom."
    is_terminal: ClassVar[bool] = True  # Stops the agent loop

    @classmethod
    def parse_args(cls, args: dict) -> "MyCustomAction | None":
        return cls(some_field=args.get("some_field", ""))

    def to_description(self) -> str:
        return f"Custom action: {self.some_field}"

    def to_tool_args(self) -> dict:
        return {"action": self.action_type, "some_field": self.some_field}
```

Then pass it to the agent:

```python
from core import AgentConfig, QwenAgent, build_system_prompt

config = AgentConfig(
    extra_actions=[MyCustomAction],
    system_prompt=build_system_prompt(extra_actions=[MyCustomAction]),
)
agent = QwenAgent(config)
```

### Building Custom Environments

See `examples/agent_auth/` for a complete example of a custom RL environment.

---

## References

### Papers

- [OSWorld: Benchmarking Multimodal Agents for Open-Ended Tasks in Real Computer Environments](https://arxiv.org/abs/2404.07972)
- [Online-Mind2Web: Evaluating Web Agents with Realistic Interaction](https://arxiv.org/abs/2504.01382)
- [GRPO: Group Relative Policy Optimization](https://arxiv.org/abs/2402.03300)

### Repositories

- [OSWorld](https://github.com/xlang-ai/OSWorld) — Computer use benchmark
- [Online-Mind2Web](https://github.com/OSU-NLP-Group/Online-Mind2Web) — WebJudge implementation
- [Tinker Cookbook](https://github.com/thinking-machines-lab/tinker) — Tinker training recipes

### Documentation

- [Kernel Docs](https://docs.onkernel.com) — Browser automation API
- [Kernel Browser Pools](https://www.onkernel.com/docs/browsers/pools) — Pre-warmed browser pools
- [Tinker Docs](https://tinker-docs.thinkingmachines.ai/) — Cloud training platform

---

## License

MIT
