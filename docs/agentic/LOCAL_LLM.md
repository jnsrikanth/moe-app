# Local Tiny LLM (Offline/On-device) Integration

This project can optionally use a tiny local LLM (llama-cpp-python) as an offline fallback for agents.

- Model: Provide a GGUF-quantized small instruct model, e.g. Qwen2.5-0.5B-Instruct Q4_K_M (~200–250MB).
- Storage: Commit the model via Git LFS under vendor/models/.

Environment variables
- LOCAL_LLM_MODEL=/absolute/path/to/vendor/models/qwen2.5-0.5b-instruct-q4_k_m.gguf
- USE_LOCAL_LLM=1 (optional; Python agents will prefer local if Vertex is disabled)

Python dependency
- llama-cpp-python (optional): agents can run without it; they will fallback to heuristics.

How it works
- Credit Agent: if Vertex is disabled and LOCAL_LLM_MODEL is set, the agent prompts the local model for a strict JSON response and parses it.
- Similar hooks can be enabled for Fraud/ESG agents by following the pattern in agents/common/local_llm.py.

Notes
- Keep prompts short and deterministic. Always request strict JSON.
- For performance, keep n_ctx small (e.g., 2048) and temperature low.
- On CloudPC, ensure no internet is required by committing the model with LFS and installing wheels from vendor.
