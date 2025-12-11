# mock_backend.py
from fastapi import FastAPI
from pydantic import BaseModel
import uvicorn

class TranslateRequest(BaseModel):
    src_lang: str
    dst_lang: str
    src_code: str
    file_context: str | None = None
    target_hw: str | None = None
    io_spec: dict | None = None
    extra_hints: str | None = None

class VerifyResult(BaseModel):
    functional_pass: bool = True
    max_abs_diff: float | None = None
    perf_baseline_ms: float | None = None
    perf_new_ms: float | None = None

class TranslateResponse(BaseModel):
    status: str
    generated_code: str | None = None
    verify_result: VerifyResult | None = None
    raw_log: str | None = None
    error_message: str | None = None

app = FastAPI()

@app.post("/translate", response_model=TranslateResponse)
def translate(req: TranslateRequest):
    # 简单 mock：加个注释，回传原始代码
    generated = f"// Mock translated from {req.src_lang} to {req.dst_lang} (target_hw={req.target_hw})\n" + req.src_code
    log = "Mock backend: no real translation performed."
    return TranslateResponse(
        status="success",
        generated_code=generated,
        verify_result=VerifyResult(functional_pass=True),
        raw_log=log
    )

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=9000)
