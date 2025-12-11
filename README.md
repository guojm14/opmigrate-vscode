# OpMigrate

OpMigrate 是一个由 VSCode 前端插件和模拟后端服务组成的算子迁移工具原型，包括：

- 在 VSCode 中选中算子代码并发起迁移
- 前端向后端发送请求
- 后端返回模拟的“迁移后代码”
- 前端展示生成结果、任务状态与耗时

## 功能概览

### 前端（VSCode 插件）
- 一键迁移：选中代码 → `OpMigrate: Translate Selection`
- 自动识别源语言（根据文件后缀）
- 支持选择目标平台（`cuda` / `bangc` / `cpu` / `hip`）
- 状态栏显示运行状态、耗时与结果
- 侧边栏任务面板展示正在进行与已完成的迁移任务
- 自动打开后端返回的新代码文件

### 模拟后端（Simulated Backend）
- 基于 FastAPI 提供 `/translate` 接口
- 不执行真实编译或优化，仅返回模拟结果
- 模拟内容包括：
  - 简单的“迁移后代码”（仅复制）
  
## 安装与运行

1. 安装模拟后端依赖
   ```bash
   pip install fastapi uvicorn[standard] pydantic
   ```
2. 启动模拟后端
   ```bash
   python simulated_backend.py
   ```
3. 后端默认运行在：
   ```
   http://127.0.0.1:9000
   ```

## 使用方法

1. 在 VSCode 中按 `F5` 启动 Extension Development Host。
2. 打开包含 CUDA / C++ / BangC 等代码的文件。
3. 选中希望迁移的代码段。
4. 右键 → `OpMigrate: Translate Selection`。
5. 选择目标平台。
6. 等待任务完成，结果将自动显示在新编辑窗口，侧边栏会显示任务状态、耗时与完成时间。

## 配置

可在 VSCode 设置中指定后端地址：

```json
{
  "opMigrate.serverUrl": "http://127.0.0.1:9000"
}
```
