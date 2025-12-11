import * as vscode from 'vscode';

export type SrcLang = "cuda" | "pytorch" | "nl" | "triton" | "bangc" | "cpu";
export type DstLang = "cuda" | "pytorch" | "triton" | "bangc" | "cpu";


export interface TranslateRequest {
    src_lang: SrcLang;
    dst_lang: DstLang;
    src_code: string;
    file_context?: string;
    io_spec?: any;
    target_hw?: string;
    extra_hints?: string;
}

export interface TranslateResponse {
    status?: string;
    generated_code?: string;
    diagnostics?: { message: string; rangeHint?: string }[];
    verify_result?: {
        functional_pass: boolean;
        max_abs_diff?: number;
        perf_baseline_ms?: number | null;
        perf_new_ms?: number | null;
    };
    raw_log?: string;
    error_message?: string;
}


export class BackendClient {
    private output: vscode.OutputChannel;

    constructor(output: vscode.OutputChannel) {
        this.output = output;
    }

    private getServerUrl(): string {
        const config = vscode.workspace.getConfiguration("opMigrate");
        const url = config.get<string>("serverUrl") || "http://127.0.0.1:9000";
        return url.replace(/\/+$/, "");
    }

    async translate(req: TranslateRequest): Promise<TranslateResponse> {
        const url = this.getServerUrl() + "/translate";
        this.output.appendLine(`[OpMigrate] Sending request to ${url}`);
        this.output.appendLine(`[OpMigrate] src_lang=${req.src_lang}, dst_lang=${req.dst_lang}, target_hw=${req.target_hw || "N/A"}`);

        try {
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(req)
            });

            if (!response.ok) {
                const text = await response.text();
                this.output.appendLine(`[OpMigrate] HTTP error ${response.status}: ${text}`);
                return {
                    status: "failed",
                    error_message: `HTTP ${response.status}: ${text}`
                };
            }

            const json = await response.json() as TranslateResponse;
            this.output.appendLine(`[OpMigrate] Response status: ${json.status}`);
            if (json.raw_log) {
                this.output.appendLine("[OpMigrate] Backend log:");
                this.output.appendLine(json.raw_log);
            }
            return json;
        } catch (err: any) {
            const msg = err?.message || String(err);
            this.output.appendLine(`[OpMigrate] Request failed: ${msg}`);
            return {
                status: "failed",
                error_message: msg
            };
        }
    }
}
