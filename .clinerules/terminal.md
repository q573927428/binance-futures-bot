# 开发规范

## 终端命令（PowerShell）
- 使用原生语法：`cd "路径"; pnpm run dev`
- HTTP请求：`Invoke-WebRequest`（禁止 curl/wget）

## Nuxt 4 + Vue 3 规范
- **测试文件**：`.mjs` 扩展名，ES 模块（import/export），禁止 require
- **路径**：使用 `@/` 别名，禁止相对路径穿透
- **Vue**：禁止 `import { ElMessage } from 'element-plus'`
- **图标**：`<el-icon><ElIconRefresh /></el-icon>`（禁止直接导入）
- **类型**：修复所有 TypeScript 类型错误
- **禁止**：查看 `data/kline-simple/` 目录

## 🔴 强制规则（测试脚本）
**编写测试脚本前，必须先执行：**
```powershell
ls server/utils/     # 查看实际有哪些文件
ls server/modules/   # 确认模块路径