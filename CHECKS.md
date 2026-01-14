# 内容正确性检查说明

## 检查项目总览

系统对每个页面的4个视口（PC普通/移动普通/PC爬虫/移动爬虫）进行以下内容正确性检查：

### 1. 横向滚动检测 (Horizontal Scroll Detection)
- **文件**: `src/checker/viewport-checker.ts`
- **检查内容**: 检测页面是否出现横向滚动条
- **检测方法**: `document.body.scrollWidth > window.innerWidth`
- **返回数据**: 超出视口的像素数量
- **严重级别**: error
- **问题类型**: `horizontal_scroll`
- **示例**: `Horizontal overflow detected: 150px exceeds viewport width`

### 2. JavaScript 错误检测 (JavaScript Errors)
- **文件**: `src/checker/error-detector.ts`
- **检查内容**: 捕获页面加载过程中的控制台错误
- **检测方法**: 监听 `page.on('console')` 事件，筛选 `error` 类型
- **等待时间**: 页面加载后等待 2 秒以确保捕获所有错误
- **严重级别**: warning
- **问题类型**: `js_error`
- **示例**: `JavaScript error: Uncaught TypeError: Cannot read property...`

### 3. 图片加载检测 (Broken Images)
- **文件**: `src/checker/error-detector.ts`
- **检查内容**: 检测页面中加载失败的图片
- **检测方法**:
  ```javascript
  img.complete && img.naturalWidth === 0 && img.naturalHeight === 0
  ```
- **说明**: 只标记已完成加载但尺寸为0的图片（已确认为失败）
- **严重级别**: warning
- **问题类型**: `broken_image`
- **示例**: `Broken image: https://example.com/image.jpg`

### 4. 页面加载超时 (Page Timeout)
- **文件**: `src/checker/multi-viewport-scanner.ts`
- **检查内容**: 检测页面导航失败或超时
- **超时设置**: 30秒（配置文件中可调整）
- **检测方法**: 捕获 `page.goto()` 抛出的异常
- **严重级别**: error
- **问题类型**: `timeout`
- **示例**: `TimeoutError: Navigation timeout of 30000ms exceeded`

### 5. 截图质量检测 (Screenshot Quality)
- **文件**: `src/utils/screenshot-analyzer.ts`
- **检查内容**: 检测截图是否全白或大面积白色（可能表示加载失败）
- **检测方法**:
  - 将截图缩放到 50x50 像素
  - 统计白色像素数量（RGB值 > 240）
  - 计算白色像素百分比
- **阈值**:
  - **全白 (error)**: ≥95% 白色像素
  - **大面积白色 (warning)**: ≥70% 白色像素
- **严重级别**: error / warning
- **问题类型**: `all_white` / `mostly_white`
- **示例**:
  - `Screenshot is 98.5% white (possibly failed to load)`
  - `Screenshot is 76.2% white (possibly incomplete)`

## 配置项

检查开关在 `config/default.json` 中配置：

```json
{
  "checks": {
    "viewportOverflow": true,      // 横向滚动检测
    "horizontalScroll": true,       // 横向滚动检测
    "httpErrors": true,             // HTTP错误检测
    "timeout": true,                // 超时检测
    "jsErrors": true,               // JavaScript错误检测
    "brokenImages": true            // 图片加载检测
  },
  "timeout": 30000                  // 超时时间（毫秒）
}
```

## 结果页面显示

### 验证摘要区
每个页面卡片顶部显示验证摘要：
- **Content Checks**: 内容检查结果（横向滚动、JS错误、图片、超时）
  - ✓ 绿色 = 通过（0个问题）
  - ✗ 红色 = 失败（显示问题数量）
- **Screenshot Quality**: 截图质量检查结果
  - ✓ 绿色 = 通过（0个问题）
  - ✗ 红色 = 失败（显示问题数量）

### 问题详情区
- **Screenshot Quality Issues**: 截图质量问题（如有）
  - 显示受影响的视口
  - 显示白色像素百分比
  - 显示严重级别

- **Content Validation Issues**: 内容验证问题（如有）
  - 按问题类型分组显示
  - 显示问题类型、消息和视口
  - color-coded by severity（红色=error，橙色=warning）

- **All Content Checks Passed**: 所有检查通过（无问题时显示）
  - 绿色背景，显示确认消息

### 视口缩略图标记
- 有截图质量问题的视口会显示红色边框和"⚠️ Issue"标签
- 无问题的视口显示绿色"OK"标签

## 数据结构

### Issue 接口
```typescript
interface Issue {
  type: string;           // 问题类型：horizontal_scroll, js_error, broken_image, timeout
  severity: 'error' | 'warning';  // 严重级别
  message: string;        // 问题描述
  viewport: string;       // 视口名称：pc_normal, mobile_normal, pc_spider, mobile_spider
}
```

### ScreenshotQualityIssue 接口
```typescript
interface ScreenshotQualityIssue {
  type: 'all_white' | 'mostly_white' | 'blank' | 'error';
  severity: 'error' | 'warning';
  message: string;
  whitePercentage: number;  // 白色像素百分比
}
```

## 性能优化

截图质量检测采用异步处理，不阻塞主扫描流程：
1. 页面扫描立即完成并保存到数据库
2. 截图质量分析在后台异步执行
3. 分析完成后更新数据库记录
4. 用户查看结果时可看到最新的分析结果

这种优化使扫描速度提升 5-8 倍。
