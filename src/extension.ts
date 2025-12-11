import * as vscode from 'vscode';
import { BackendClient, TranslateRequest, SrcLang, DstLang } from './backendClient';
import { TasksProvider, TaskStatus } from './tasksView';


export function activate(context: vscode.ExtensionContext) {
    const output = vscode.window.createOutputChannel("OpMigrate");
    const client = new BackendClient(output);

    const tasksProvider = new TasksProvider();
    const tasksView = vscode.window.createTreeView("opmigrateTasksView", {
        treeDataProvider: tasksProvider
    });
    context.subscriptions.push(tasksProvider, tasksView);

    const disposable = vscode.commands.registerCommand(
        "opmigrate.translateSelection",
        async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showErrorMessage("No active editor.");
                return;
            }

            const doc = editor.document;
            const selection = editor.selection;
            const selectedText = doc.getText(selection) || doc.getText();
            if (!selectedText.trim()) {
                vscode.window.showWarningMessage("Selected text is empty.");
                return;
            }

            const srcLang = inferSrcLang(doc);
            if (!srcLang) {
                vscode.window.showWarningMessage(`Cannot infer source language from file: ${doc.fileName}`);
                return;
            }

            const dstLang = await pickDstLang(srcLang);
            if (!dstLang) {
                return;
            }

            const taskLabel = `${srcLang} → ${dstLang}: ${basename(doc.fileName)}`;
            const task = tasksProvider.addTask(taskLabel);

            const request: TranslateRequest = {
                src_lang: srcLang,
                dst_lang: dstLang,
                src_code: selectedText,
                file_context: doc.getText()
            };

            const t0 = Date.now();

            await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: `OpMigrate: ${srcLang} → ${dstLang}`,
                    cancellable: false
                },
                async () => {
                    try {
                        const resp = await client.translate(request);
                        const elapsedMs = Date.now() - t0;

                        // 打印 raw response，方便调试
                        output.appendLine("[OpMigrate] Raw response JSON = " + JSON.stringify(resp));

                        // 只要有 generated_code 就认为成功
                        if (!resp.generated_code) {
                            const msg = resp.error_message || `Backend did not return generated_code (status=${resp.status ?? "N/A"})`;
                            vscode.window.showErrorMessage(`OpMigrate translation failed: ${msg}`);
                            tasksProvider.finishTask(task.id, "failed", elapsedMs);
                            return;
                        }

                        const languageId = guessLanguageId(dstLang);
                        const newDoc = await vscode.workspace.openTextDocument({
                            content: resp.generated_code,
                            language: languageId
                        });
                        await vscode.window.showTextDocument(newDoc, vscode.ViewColumn.Beside);

                        // 验证结果展示（安全处理 null）
                        if (resp.verify_result) {
                            const v = resp.verify_result;
                            let summary = `Functional: ${v.functional_pass ? "PASS" : "FAIL"}`;

                            if (v.max_abs_diff != null) {
                                summary += `, max_abs_diff=${v.max_abs_diff}`;
                            }

                            if (v.perf_baseline_ms != null && v.perf_new_ms != null) {
                                const baseline = v.perf_baseline_ms;
                                const newer = v.perf_new_ms;
                                const speedup = baseline / newer;
                                summary += `, baseline=${baseline.toFixed(4)} ms, new=${newer.toFixed(4)} ms, speedup=${speedup.toFixed(2)}x`;
                            }

                            vscode.window.showInformationMessage(`OpMigrate verification: ${summary}`);
                        } else {
                            vscode.window.showInformationMessage("OpMigrate translation succeeded.");
                        }


                        tasksProvider.finishTask(task.id, "success", elapsedMs);
                    } catch (e: any) {
                        const elapsedMs = Date.now() - t0;
                        const msg = e?.message || String(e);
                        vscode.window.showErrorMessage(`OpMigrate translation exception: ${msg}`);
                        tasksProvider.finishTask(task.id, "failed", elapsedMs);
                    }
                }
            );
        }
    );

    context.subscriptions.push(disposable, output);
    output.appendLine("OpMigrate extension activated.");
}




export function deactivate() {
    // nothing
}

function inferSrcLang(doc: vscode.TextDocument): SrcLang | null {
    const fileName = doc.fileName.toLowerCase();
    const langId = doc.languageId;

    if (fileName.endsWith(".mlu")) {
        // .mlu = bangc
        return "bangc";
    }

    if (fileName.endsWith(".cu") || langId === "cuda-cpp") {
        return "cuda";
    }

    if (fileName.endsWith(".c") || fileName.endsWith(".cpp")) {
        // 普通 CPU C/C++ 代码
        return "cpu";
    }

    if (fileName.endsWith(".py") || langId === "python") {
        // 简单默认：python 视为 pytorch
        return "pytorch";
    }

    if (langId === "markdown" || langId === "plaintext") {
        return "nl";
    }

    if (fileName.endsWith(".py") && doc.getText().includes("@triton.jit")) {
        return "triton";
    }

    return null;
}

// 根据源语言给出推荐的目标语言列表
async function pickDstLang(src: SrcLang): Promise<DstLang | undefined> {
    const candidates: { label: string; dst: DstLang }[] = [];

    if (src === "cuda") {
        candidates.push(
            { label: "CUDA → BangC (MLU)", dst: "bangc" },
            { label: "CUDA → Triton", dst: "triton" }
        );
    } else if (src === "pytorch") {
        candidates.push(
            { label: "PyTorch → Triton", dst: "triton" },
            { label: "PyTorch → CUDA", dst: "cuda" }
        );
    } else if (src === "nl") {
        candidates.push(
            { label: "NL → CUDA", dst: "cuda" },
            { label: "NL → Triton", dst: "triton" }
        );
    } else if (src === "bangc") {
        candidates.push(
            { label: "BangC → CUDA", dst: "cuda" },
            { label: "BangC → Triton", dst: "triton" }
        );
    } else if (src === "triton") {
        candidates.push(
            { label: "Triton → CUDA", dst: "cuda" },
            { label: "Triton → BangC", dst: "bangc" }
        );
    } else if (src === "cpu") {
        candidates.push(
            { label: "CPU C/C++ → CUDA", dst: "cuda" },
            { label: "CPU C/C++ → Triton", dst: "triton" },
            { label: "CPU C/C++ → BangC", dst: "bangc" }
        );
    }

    if (candidates.length === 0) {
        const picked = await vscode.window.showQuickPick(
            [
                { label: "To CUDA", dst: "cuda" as DstLang },
                { label: "To BangC", dst: "bangc" as DstLang },
                { label: "To Triton", dst: "triton" as DstLang }
            ],
            { title: `Select target language` }
        );
        return picked?.dst;
    }

    const picked = await vscode.window.showQuickPick(
        candidates,
        { title: `Select target language` }
    );
    return picked?.dst;
}

function guessLanguageId(dst: DstLang): string {
    if (dst === "cuda") {
        return "cuda-cpp";
    }
    if (dst === "pytorch" || dst === "triton") {
        return "python";
    }
    if (dst === "bangc" || dst === "cpu") {
        return "c";
    }
    return "plaintext";
}

function basename(filePath: string): string {
    return filePath.replace(/\\/g, "/").split("/").pop() || filePath;
}
