1. 使用终端命令的时候  请使用正确的PowerShell语法：示例：cd "f:\qukuailian\ai\zuoT\binance-futures-bot"; pnpm run dev
2. 使用 <el-icon> 时，禁止从 @element-plus/icons-vue 直接导入图标组件，统一通过全局注册或手动引入后再使用，示例：<el-icon><ElIconRefresh /></el-icon>。
3. 所有终端命令必须使用 PowerShell 原生语法，禁止使用 CMD 或 Bash 兼容命令，确保跨平台执行一致性。
4. 测试用例必须使用 ES 模块语法（import/export），禁止使用 CommonJS 的 1. require/module.exports，确保与项目代码规范保持一致
5. 使用TypeScript进行开发，并使用ESLint进行代码规范检查。
6. 代码不要出现错误，请使用TypeScript进行类型检查。
7. vue文件里面不需要引用这个 import { ElMessage } from 'element-plus'
8. 不要出现  不能将类型“string”分配给类型 类似类型的代码报错