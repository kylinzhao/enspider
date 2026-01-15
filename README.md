# enspider

Website accessibility monitor for guazi.com domains. Automatically discovers pages, categorizes them by DOM structure, and tests samples for PC and mobile accessibility issues.

## Features

- **Automatic Page Discovery**: Crawls homepage to discover all links
- **Smart Page Categorization**: Groups pages by DOM structure similarity
- **Intelligent Sampling**: Tests up to 3 representative pages per category
- **Dual Viewport Testing**: Checks both PC (1920x1080) and mobile (375x667)
- **Screenshot Capture**: Saves screenshots for both viewports
- **Issue Detection**: Finds viewport overflow, horizontal scroll, JS errors, broken images
- **HTML Reports**: Interactive reports with side-by-side comparisons

## Installation

```bash
npm install
```

This will install all dependencies including Playwright browsers.

## Usage

### Basic Usage

Scan all configured domains:

```bash
npm run monitor
```

### Scan Specific Domain

```bash
npm run monitor -- --domain en.guazi.com
npm run monitor:en
npm run monitor:ar
```

### Options

```
Usage: enspider [options]

Options:
  -d, --domain <domain>    Domain to scan (e.g., en.guazi.com)
  -m, --max-pages <number> Maximum pages per category (default: 3)
  -c, --concurrency <number> Concurrent page visits (default: 3)
  -v, --verbose            Verbose logging
  -h, --help               Display help
```

### Examples

```bash
# Scan en.guazi.com with 5 pages per category
npm run monitor -- --domain en.guazi.com --max-pages 5

# Scan with verbose logging
npm run monitor -- --verbose

# Scan with higher concurrency
npm run monitor -- --concurrency 5
```

## Configuration

Edit `config/default.json` to customize settings:

```json
{
  "domains": ["en.guazi.com", "ar.guazi.com"],
  "maxPagesPerCategory": 3,
  "concurrency": 3,
  "timeout": 30000,
  "similarityThreshold": 0.75,
  "excludedPatterns": [
    "/api/",
    "\\.(jpg|jpeg|png|gif|svg|webp|pdf)$"
  ]
}
```

## Output

Results are saved in the `output/` directory:

```
output/
├── reports/           # HTML reports
│   └── report_*.html
├── screenshots/       # Organized by domain/device
│   ├── pc/
│   │   ├── en.guazi.com/
│   │   └── ar.guazi.com/
│   └── mobile/
│       ├── en.guazi.com/
│       └── ar.guazi.com/
└── data/             # JSON data files
    └── en.guazi.com_*.json
```

## Page Categorization Algorithm

1. **DOM Fingerprinting**: Extracts structural features (tag sequence, depth, node count)
2. **Similarity Calculation**: Uses tree edit distance + structural metrics
3. **Clustering**: Agglomerative hierarchical clustering (threshold: 0.75)
4. **Sampling**: Selects up to 3 diverse pages per cluster

## Accessibility Checks

- Viewport overflow detection
- Horizontal scroll detection
- HTTP error detection (404, 500)
- JavaScript error detection
- Broken image detection
- Viewport meta tag validation

## Project Structure

```
enspider/
├── src/
│   ├── index.ts              # Main entry point
│   ├── crawler/              # Link discovery
│   ├── classifier/           # Page categorization
│   ├── checker/              # Accessibility checks
│   ├── reporter/             # Report generation
│   ├── storage/              # Data persistence
│   └── utils/                # Utilities
├── config/                   # Configuration files
├── output/                   # Generated output
└── logs/                     # Application logs
```

## 部署与更新流程（腾讯云服务器）

### 一次性服务器初始化

1. 在服务器上创建裸仓库（只存 Git 数据）：

```bash
cd /root
git init --bare enspider-bare.git
```

2. 在服务器上准备工作目录：

```bash
cd /root
git clone /root/enspider-bare.git enspider
cd /root/enspider
```

### 本地开发机：提交与推送

在本地（能访问 GitHub 的机器）：

```bash
cd ~/guazi/work/enspider

# 提交代码
git add .
git commit -m "your message"

# 推送到 GitHub（可选）
git push origin main

# 添加服务器远程（只需一次）
git remote add server root@<server-ip>:/root/enspider-bare.git

# 推送到服务器裸仓库（关键）
git push server main
```

### 服务器：更新代码并重启服务

在服务器上：

```bash
cd /root/enspider

# 确保 main 分支跟踪 origin/main（首次或分支异常时执行一次）
git fetch origin
git checkout -B main origin/main
git branch --set-upstream-to=origin/main main

# 之后每次更新只需：
git pull
./restart-enspider.sh
```

`restart-enspider.sh` 会自动执行：

- 从裸仓库拉取最新代码
- `npm install`
- `npm run build`
- 终止旧的 `node dist/server/index.js` 进程
- 后台启动新的 `node dist/server/index.js`，日志输出到 `server.log`

## License

MIT
