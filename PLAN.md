# HackStamp 当前计划

## 目标

做一个极简的黑客松项目提交证明页：

- 用户输入 GitHub 仓库 URL 和 commit hash
- 校验 commit hash 格式
- 生成可分享的 GitHub tree / zip / clone 展示信息
- 连接浏览器钱包后，把 commit hash 锚定上链

## 当前页面结构

- 居中大标题
- 两个输入框
- 一个验证 / 生成按钮
- 点击后展开两个区域：
  - 提交上链预览
  - hash 验证结果

## 当前已实现

- 支持 GitHub repo URL 解析
- 支持 commit hash 格式校验
- 生成 tree / zip / clone 展示信息
- 白色极简主题
- web 端使用浏览器钱包连接 Monad Testnet

## 下一步

1. 继续打磨钱包连接和链上提交反馈
2. 增加更清晰的交易 receipt 展示
3. 视需要再补查询入口

## 交互原则

- 保持单入口
- 不做复杂卡片流
- 结果只分两个框
- 重点讲黑客松提交证明，不讲泛化的存在性证明
- 不保留本地历史记录
- GitHub URL 只用于展示，不进入后端或合约
- 不再依赖 Privy 登录流程

## 风险提示

- 不要依赖 force push 后的历史
- 不要通过 revert / rewrite history 伪造旧 proof
- 一旦 commit hash 变化，就应视为新版本
