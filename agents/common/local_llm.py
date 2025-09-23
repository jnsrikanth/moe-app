import os
from typing import Optional

try:
    from llama_cpp import Llama  # type: ignore
except Exception:
    Llama = None  # type: ignore

_singleton = None

class LocalLLM:
    def __init__(self, model_path: str, n_ctx: int = 2048):
        self.model_path = model_path
        self.llm = None
        if Llama is not None and model_path and os.path.exists(model_path):
            try:
                self.llm = Llama(model_path=model_path, n_ctx=n_ctx)
            except Exception:
                self.llm = None

    def available(self) -> bool:
        return self.llm is not None

    def generate_json(self, prompt: str, max_tokens: int = 512) -> str:
        if not self.llm:
            return ""
        try:
            out = self.llm(prompt=prompt, max_tokens=max_tokens, temperature=0.2, stop=["\n\n"])  # type: ignore
            # llama-cpp responses place text at out['choices'][0]['text'] typically
            text = (out.get('choices') or [{}])[0].get('text', '')
            return str(text)
        except Exception:
            return ""

def get_local_llm() -> Optional[LocalLLM]:
    model_path = os.getenv("LOCAL_LLM_MODEL", "")
    if not model_path:
        return None
    return LocalLLM(model_path)