import * as vscode from 'vscode';

export type TaskStatus = "running" | "success" | "failed";

export interface OpTask {
    id: number;
    label: string;       // 例如 "cuda → bangc: kernel.cu"
    status: TaskStatus;
    startTime: Date;
    endTime?: Date;      // 完成时间
    elapsedMs?: number;  // 后端响应总耗时（ms）
}

export class TaskNode extends vscode.TreeItem {
    constructor(public readonly task: OpTask) {
        super(task.label);

        const now = new Date();
        const end = task.endTime || now;

        const rawElapsedMs = task.elapsedMs !== undefined
            ? task.elapsedMs
            : (end.getTime() - task.startTime.getTime());

        const elapsedSec = (rawElapsedMs / 1000).toFixed(3);

        let statusText = "";
        if (task.status === "running") {
            statusText = `Running • ${elapsedSec}s`;
        } else if (task.status === "success") {
            const finishTime = task.endTime?.toLocaleTimeString();
            statusText = `Done • ${elapsedSec}s • ${finishTime}`;
        } else if (task.status === "failed") {
            const finishTime = task.endTime?.toLocaleTimeString();
            statusText = `Failed • ${elapsedSec}s • ${finishTime}`;
        }

        this.description = statusText;
        this.collapsibleState = vscode.TreeItemCollapsibleState.None;

        if (task.status === "running") {
            this.iconPath = new vscode.ThemeIcon("sync", new vscode.ThemeColor("charts.yellow"));
        } else if (task.status === "success") {
            this.iconPath = new vscode.ThemeIcon("check", new vscode.ThemeColor("testing.iconPassed"));
        } else {
            this.iconPath = new vscode.ThemeIcon("error", new vscode.ThemeColor("testing.iconFailed"));
        }

        this.contextValue = "opmigrateTask";
    }
}

export class TasksProvider implements vscode.TreeDataProvider<TaskNode>, vscode.Disposable {
    private _onDidChangeTreeData: vscode.EventEmitter<TaskNode | undefined | null | void> =
        new vscode.EventEmitter<TaskNode | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<TaskNode | undefined | null | void> =
        this._onDidChangeTreeData.event;

    private tasks: OpTask[] = [];
    private nextId = 1;
    private timer: NodeJS.Timeout;

    constructor() {
        this.timer = setInterval(() => {
            if (this.tasks.some(t => t.status === "running")) {
                this._onDidChangeTreeData.fire();
            }
        }, 1000);
    }

    dispose() {
        clearInterval(this.timer);
    }

    getTreeItem(element: TaskNode): vscode.TreeItem {
        return element;
    }

    getChildren(element?: TaskNode): Thenable<TaskNode[]> {
        if (element) {
            return Promise.resolve([]);
        }
        const sorted = this.tasks.slice().sort((a, b) => {
            if (a.status === "running" && b.status !== "running") return -1;
            if (a.status !== "running" && b.status === "running") return 1;
            return b.startTime.getTime() - a.startTime.getTime();
        });
        return Promise.resolve(sorted.map(t => new TaskNode(t)));
    }

    addTask(label: string): OpTask {
        const task: OpTask = {
            id: this.nextId++,
            label,
            status: "running",
            startTime: new Date()
        };
        this.tasks.push(task);
        this._onDidChangeTreeData.fire();
        return task;
    }

    finishTask(id: number, status: TaskStatus, elapsedMs?: number) {
        const t = this.tasks.find(x => x.id === id);
        if (!t) return;
        t.status = status;
        t.endTime = new Date();
        if (elapsedMs !== undefined) {
            t.elapsedMs = elapsedMs;
        }
        this._onDidChangeTreeData.fire();
    }
}
