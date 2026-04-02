# 开发规范

## Nuxt 4 + Vue 3 规范
- **测试文件**：`.mjs` 扩展名，ES 模块（import/export），禁止 require
- **路径**：使用 `@/` 别名，禁止相对路径穿透
- **Vue**：禁止 `import { ElMessage } from 'element-plus'`
- **图标**：`<el-icon><ElIconRefresh /></el-icon>`（禁止直接导入）
- **类型**：修复所有 TypeScript 类型错误
- **禁止**：查看直接 `data/kline-simple/` 和 `logs/` 目录下面所有文件内容 ，里面的内容很大很大
