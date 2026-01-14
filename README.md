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

## License

MIT
