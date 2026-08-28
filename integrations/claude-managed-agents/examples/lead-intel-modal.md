# Example output: `lead-intel` on modal.com

Real output from the [`lead-intel`](../src/lead-intel.ts) recipe, run against
<https://modal.com> on 2026-06-04 (~10.5 min wall-clock).

A single managed-agent **coordinator** did lightweight recon, identified 7 independent
research questions, and delegated each to its own **browser-operator subagent** running
in parallel — each driving its own Kernel cloud browser to gather cited evidence — then
synthesized the brief below. The live run also saved 28 evidence screenshots to the
session's `/mnt/session/outputs/`.

The coordinator's final synthesized brief:

---

# Lead-Intelligence Brief — Modal (modal.com)

## So What for Sales — TL;DR

- **What they are:** A **Python-native, serverless GPU/AI cloud** — _"AI infrastructure that developers love" / "The production cloud for AI."_ It hides Kubernetes/cloud ops so ML engineers deploy GPU workloads straight from Python (no YAML).
- **Where they win:** **Sub-second cold starts, autoscale 0→1000+ GPUs, scale-to-zero, pay-by-the-second.** They pool GPU capacity across multiple clouds and sell "no reservations, no capacity planning, no commitments."
- **ICP:** **AI-native startups and fast-growth teams** building production AI — LLM inference, generative media, voice AI, agent/code-execution sandboxes, fine-tuning/RL, comp-bio. Buyer = the **Python dev / ML engineer**, not a platform team.
- **Proof:** Recent, credible logos (Suno, Ramp, Runway, Lovable, Quora/Poe, Substack, Cognition, Scale, Meta, DoorDash, Physical Intelligence) + 11 case studies with hard metrics.

## 1. Positioning & Messaging — _modal.com_

- Hero: **"AI infrastructure that developers love"**; sub: _"Run inference, training, batch processing, and sandboxes with sub-second cold starts, instant autoscaling, and a developer experience that feels local."_ Master tagline: **"The production cloud for AI."**
- Four pillars: _MODAL SDK_ ("Your cloud environment, in code… Stay in Python, ship to the cloud"), _AI-NATIVE RUNTIME_ ("Built for speed, at any scale"), _ELASTIC CLOUD CAPACITY_ ("Autoscale from 0 to 1000+ GPUs, instantly"), _PRODUCTION READY_ ("Out-of-the-box observability").

## 2. Product Lineup — _modal.com/products/\*_

Six products: **Inference** ("The fastest way to scale Inference"), **Training** ("Train more, configure less"), **Sandboxes** ("Run production Sandboxes at scale"), **Batch** ("Run Batch jobs with 1 line of code" / "Spawn 1 million jobs in seconds"), **Notebooks** ("High-performance GPU Notebooks," <5s cold start, collaborative), **Core Platform**. Differentiators: "<1s" GPU container launch, "2–3× higher throughput per GPU vs static clusters," memory snapshotting, "no YAML," up to "128 B200s with 3200 Gbps Infiniband."

## 3. Pricing & Packaging — _modal.com/pricing_

- **Starter $0** ($30/mo free credits, 3 seats) · **Team $250 + compute/mo** ($100/mo credits, unlimited seats, custom domains/static IP) · **Enterprise: Custom** (HIPAA, Okta SSO, RBAC, audit logs, embedded ML eng).
- Per-second GPU rates: **H100 $0.001097/s, A100-80GB $0.000694/s, A10 $0.000306/s, T4 $0.000164/s, B200 $0.001736/s.** CPU $0.0000131/core/s; Memory $0.00000222/GiB/s; Volumes $0.09/GiB/mo (1 TiB free). **Sandbox/Notebook CPU+memory ≈3× standard.**
- Modifiers: region 1.5–1.75×; non-preemptible 3×. Available on **AWS & GCP Marketplace** for committed spend; up to **$10k credits for academics**.

## 4. How They Meter — _pricing + /docs/guide/billing_

- _"You always pay for what you use… just actual compute time, by the CPU cycle."_ Per-second metering on GPU/CPU/memory; **charge = max(requested, actual)**; minimums 0.125 cores / 128 MiB per container.
- _"Modal bills you during application load time… we keep containers alive for 60 seconds after the last inputs… which we also bill for… Once your application has scaled down to zero containers you no longer get charged."_ → cold start + 60s idle are billable (idle is configurable).

## 5. Target Segments & ICP — _customers + /solutions/\*_

Five named solutions: Audio Transcription, LLM Inference ("Save 50%+… compared to API providers"), Coding Agents ("50,000+ simultaneous… sandboxes"), Computational Bio, Image+Video ("For companies graduating from image and video APIs"). Audience statement: _"Modal is built for the fastest-growing teams in the world… companies of all sizes"_; the customers hero animates **"Startups run on Modal."**

## 6. Integrations & DX — _docs.modal.com_

Python primary (JS/TS + Go Beta, call-only). Ecosystem: **vLLM, SGLang, Unsloth, PyTorch, Hugging Face, JAX**; web via **FastAPI/Flask/Django**; UIs **Gradio/Streamlit**; **W&B, LangSmith, LangGraph, FastMCP**; storage **S3/R2/GCS, MongoDB, DuckDB**; observability **Datadog, OpenTelemetry, Prometheus**; **GitHub Actions** CI/CD; **Okta/SAML SSO**; **Tailscale**, **Docker/gVisor/CUDA 13.0**. **Multi-cloud GPU pool** ("pool capacity over all major clouds"), broad global regions, fleet up to **B200** and **128× B200 / 3,200 Gbps Infiniband**. **SOC2 & HIPAA, RBAC, customer-supplied encryption keys.**

## 7. Named Customers — _modal.com/customers_

**25 logos:** Substack, DoorDash, Meta, Fathom, Hume, Ramp, Cognition, Runway, Suno, Blend, Doppel, David AI, Contextual AI, PostHog, Physical Intelligence, Resolve.ai, Decagon, Applied Compute, Chai Discovery, Quora, Reducto, Lovable, Scale, Achira, Cartesia.
**Headline case-study metrics:** Lovable (1M+ sandboxes / 20k concurrent / 250k app creations in 48h) · Runway & Decagon (65% latency reduction) · Reducto (3× P90 latency cut, cold boot −83%) · Quora ("2 engineers' worth of time" saved) · Suno ("4 months faster to launch") · Physical Intelligence (10–15 ms robot control) · Ramp (agent writes >half of merged PRs).

---

> Coordinator's accuracy note: every figure and quote above is sourced from the live
> site; a few capacity claims (e.g., GPU counts, region list) come from docs pages and
> may evolve — the full saved brief cites each to its exact URL. Verify before any
> customer-facing use.
