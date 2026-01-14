# 截图命名修复说明

## 问题描述

之前的截图文件命名规则存在问题：
1. **没有任务 ID**：无法从文件名识别是哪次测试的截图
2. **会覆盖旧截图**：同一 URL 的多次测试会相互覆盖
3. **历史记录错误**：查看旧测试记录时显示的是新测试的截图

## 修复方案

在文件名中加入 `test_id`，确保每次测试的截图都是独立的。

### 修复前
```
output/screenshots/pc_normal/en.guazi.com/_.png
output/screenshots/pc_normal/en.guazi.com/_brand-selector_.png
```

### 修复后
```
output/screenshots/pc_normal/en.guazi.com/12_homepage.png
output/screenshots/pc_normal/en.guazi.com/12_brand-selector.png
                                        ↑
                                    test_id
```

## 代码修改

### 1. `src/checker/screenshot-capture.ts`
- 添加 `testId` 参数到 `capture()` 方法
- 文件名格式：`${testId}_${sanitized_url}.png`

### 2. `src/checker/multi-viewport-scanner.ts`
- 添加 `testId` 参数到 `scanPage()` 方法
- 调用 `capture()` 时传递 `testId`

### 3. `src/server/scanner-service.ts`
- 调用 `scanner.scanPage()` 时传递 `testId`

## 优势

✅ **不会覆盖**：每次测试的截图都是独立的文件
✅ **可追溯**：从文件名就能知道是哪次测试的截图
✅ **历史记录准确**：查看历史测试时能看到正确的截图
✅ **方便管理**：可以根据 `test_id` 批量删除或归档截图

## 磁盘空间管理

由于每次测试都会产生新截图（不再覆盖），建议添加管理功能：

### 可选方案
1. **自动清理**：保留最近 N 次测试的截图
2. **手动清理**：在 Web 界面添加删除按钮
3. **按测试管理**：删除某个测试时同时删除其截图
4. **压缩归档**：将超过 30 天的截图压缩

### 当前估算
- 每个页面：4 个视口 × ~500KB = 2MB
- 每次测试（10个页面）：约 20MB
- 测试 100 次：约 2GB

## 旧数据处理

旧的截图文件（没有 test_id 前缀）仍然存在，但：
- 新测试不会覆盖旧文件
- 可以选择保留或手动删除
- 建议添加清理脚本统一处理
