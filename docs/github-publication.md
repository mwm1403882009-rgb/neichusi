# GitHub 发布配置

仓库已由维护者创建，源码和安装包仍需上传。以下配置用于维护者发布安卓版，不应将整个上级工作目录上传。

## 仓库信息

- 地址：https://github.com/mwm1403882009-rgb/neichusi
- 名称：`neichusi`
- 可见性：Public
- 简介：开源安卓做菜软件，支持 AI 菜谱推荐、一周食谱、备餐计划、冰箱库存、用餐成本和菜谱导入。
- 标签：`android`、`recipe`、`cooking`、`meal-planner`、`meal-prep`、`food-inventory`、`ai-assistant`
- 应用版本：`0.1.4`
- 发布标签：`v0.1.4`
- 许可证：MIT；本地 LICENSE 与仓库初始许可证一致。

## 上传范围

仅从 Android 独立源码准备仓库：`client/`、`native/`、`scripts/`、`tests/`、`docs/`、`package.json`、`.gitignore`、`README.md`、`THIRD_PARTY_NOTICES.md`、`baseline.json` 及确认后的 `LICENSE`。

不上传上级仓库的 Git 历史、微信小程序工程、个人备份、照片、模型密钥、`.env`、`signing/`、`.tools/`、`node_modules/`、`build/` 或 `dist/`。维护者私有签名只用于本地签发官方更新，不进入公开仓库或 Release。

首次发布前，扫描实际上传文件中的敏感内容，运行安卓回归测试，并从独立导出的源码验证构建流程。维护者同步小程序基准的脚本需要私有来源，普通构建不需要，也不应执行该同步脚本。

## Release 附件

发布经校验的 `neichusi-android-0.1.4.apk` 和对应校验摘要。源码以实际发布提交和 GitHub 自动生成的源码归档为准；现有本地源码 ZIP 在公开文档及许可证完成后需要另行核对，不能作为已发布版本。

发布完成后，将 README 下载说明更新为实际 Release 链接，填写正式许可证及已验证状态。不要填写不存在的 GitHub 用户名、仓库地址或下载链接。
