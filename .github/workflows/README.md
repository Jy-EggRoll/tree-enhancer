# 🚀 发布流程说明

本项目使用两个独立的 GitHub Actions 工作流来管理扩展的打包和发布：

## 📦 打包工作流 (`package.yml`)

**用途**：仅打包扩展，不发布到市场，用于开发和测试

### 触发方式：

1. **自动触发**：推送 `x.y.z.dev` 格式的标签
   ```bash
   git tag 1.3.3.dev
   git push origin 1.3.3.dev
   ```

2. **手动触发**：在 GitHub Actions 页面手动运行
   - 进入 Actions → Package Extension → Run workflow

### 输出：
- ✅ 生成 `.vsix` 文件
- ✅ 上传为 GitHub Artifact（保留 30 天）
- ✅ 创建 GitHub Release（开发版，仅在标签触发时）
- ❌ **不会发布到 VS Code 市场**

---

## 🚀 发布工作流 (`publish.yml`)

**用途**：打包并发布到 VS Code 市场，用于正式版本发布

### 触发方式：

**仅自动触发**：推送 `x.y.z` 格式的标签（不包含 `.dev`）
```bash
git tag 1.3.3
git push origin 1.3.3
```

### 输出：
- ✅ 生成 `.vsix` 文件
- ✅ **发布到 VS Code 市场**
- ✅ 创建 GitHub Release（正式版）
- ✅ 上传为 GitHub Artifact（保留 90 天）
- ✅ 自动生成发布说明

---

## 🔄 推荐的开发流程

### 1. 开发阶段
```bash
# 修改代码...
# 更新 package.json 版本为 1.3.3.dev

# 测试打包
git add .
git commit -m "feat: 新功能开发"
git tag 1.3.3.dev
git push origin main
git push origin 1.3.3.dev

# 这会触发打包工作流，生成测试版本
```

### 2. 发布阶段
```bash
# 开发完成，准备发布
# 更新 package.json 版本为 1.3.3（移除 .dev）

git add package.json
git commit -m "chore: bump version to 1.3.3"
git tag 1.3.3
git push origin main
git push origin 1.3.3

# 这会触发发布工作流，发布到市场
```

---

## ⚙️ 配置要求

### GitHub Secrets
需要在仓库中配置以下机密：

- `VSCE_TOKEN`: VS Code 市场的个人访问令牌

### 版本号管理
- **开发版本**：`x.y.z.dev`（如 `1.3.3.dev`）
- **正式版本**：`x.y.z`（如 `1.3.3`）

---

## 🎯 优势

1. **分离关注点**：开发测试与正式发布分开
2. **安全性**：用户只会收到正式版本的自动更新
3. **灵活性**：可以频繁测试打包而不影响用户
4. **可追溯性**：每个版本都有对应的 GitHub Release
5. **手动控制**：打包工作流支持手动运行

---

## 📝 注意事项

- 确保 `package.json` 中的版本号与推送的标签一致
- 开发版本不会发布到市场，仅通过 GitHub Release 提供下载
- 正式版本的发布会自动生成发布说明
- 所有构建产物都会保存为 GitHub Artifacts