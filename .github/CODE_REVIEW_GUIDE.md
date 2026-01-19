# Code Review 留痕指南

本指南说明如何系统化地进行 code review 并将结果留痕在 Git 历史中。

## 🎯 为什么需要系统化 CR 留痕？

1. **可追溯性** - 每个 commit 都有对应的 review 记录
2. **质量保证** - 强制性 review 流程
3. **知识传承** - 新人可以通过 git log 学习 review 标准
4. **审计需求** - 满足合规和质量审计要求
5. **持续改进** - 累积的 review 记录可用于流程优化

## 📝 使用 Git Trailers 进行 CR 留痕

### 标准 Trailer 格式

```bash
Reviewed-By: Reviewer Name <email>
Reviewed-Date: YYYY-MM-DD
Review-Grade: A|B|C|D|F
Review-Status: Approved|Approved-with-Suggestions|Request-Changes|Comment
Review-Risk: Low|Medium|High
Review-Issue-N: Issue description. Priority: HIGH|MEDIUM|LOW. Fix: Suggested fix.
Review-Suggestion-N: Suggestion description. Priority: MEDIUM|LOW.
Review-Recommendation: Overall recommendation and next steps.
```

### 工作流程

#### 1. 创建 Review 文件

创建一个文本文件（例如 `review-pr-123.txt`）：

```
Reviewed-By: Zhang San <zhangsan@example.com>
Reviewed-Date: 2025-01-19
Review-Grade: B
Review-Status: Approved-with-Required-Changes
Review-Risk: Medium
Review-Issue-1: Performance regression for non-listing pages. Priority: HIGH. Fix: Reduce wait time.
Review-Issue-2: Missing input validation. Priority: HIGH. Fix: Add validation function.
Review-Suggestion-1: Extract magic numbers to constants. Priority: MEDIUM.
Review-Recommendation: Fix HIGH issues before merging.
```

#### 2. 添加 Review 到 Commit

**方法 A: 使用脚本（推荐）**
```bash
.github/scripts/add-review.sh HEAD review-pr-123.txt
```

**方法 B: 手动 amend**
```bash
git commit --amend -m "$(git log -1 --pretty=%B)

Reviewed-By: Zhang San <zhangsan@example.com>
Reviewed-Date: 2025-01-19
Review-Grade: B
Review-Status: Approved-with-Required-Changes
Review-Risk: Medium
Review-Issue-1: Issue description. Priority: HIGH. Fix: Fix details.
Review-Recommendation: Recommendation text."
```

#### 3. 查看 Review 信息

```bash
# 查看特定 commit 的 review
.github/scripts/show-review.sh HEAD

# 或使用 git log
git log -1 --format=fuller
```

#### 4. 推送到远程

```bash
# 使用 force-with-lease 更安全
git push origin branch-name --force-with-lease
```

## 🔍 查询 Review 记录

### 查找所有被 Review 的 Commits

```bash
git log --grep="Review-Grade" --oneline
```

### 查找特定状态的 Review

```bash
# 查找所有 Approved 的
git log --grep="Review-Status: Approved" --oneline

# 查找需要修改的
git log --grep="Review-Status: Request-Changes" --oneline
```

### 查找特定 Reviewer 的记录

```bash
git log --author="Zhang San" --grep="Review-Grade" --oneline
```

### 统计 Review 质量

```bash
# 统计评分分布
git log --grep="Review-Grade" --pretty=format:"%(Review-Grade)" | sort | uniq -c

# 统计高风险 commits
git log --grep="Review-Risk: High" --oneline | wc -l
```

## 📊 Review 评分标准

| Grade | 标准 | 示例 |
|-------|------|------|
| **A** | 优秀，无问题或仅有 minor 建议 | 文档改进、命名优化 |
| **B** | 良好，需小修改后可合并 | 性能优化、边界情况处理 |
| **C** | 及格，需中等修改 | 逻辑错误、缺失重要功能 |
| **D** | 不及格，需大改 | 架构问题、安全漏洞 |
| **F** | 拒绝，需重写 | 完全不符合需求 |

## ⚠️ Review 风险等级

| 风险等级 | 定义 | 示例 |
|----------|------|------|
| **Low** | 影响小，容易修复 | 文档错误、命名 |
| **Medium** | 有一定影响，需测试 | 性能回退、边界情况 |
| **High** | 严重影响，必须修复 | 数据丢失、安全漏洞 |

## 🎨 GitHub PR 集成

### 在 PR 中显示 Review 信息

由于使用了 Git trailers，review 信息会自动显示在：

1. **Commit 详细页面** - GitHub 会解析 trailers
2. **PR Files Changed 标签** - Commit message 中的 grade 和 status
3. **Git Blame** - 每次修改都有 review 记录

### 设置 PR 保护规则

在 `.github/CODEOWNERS` 中：

```
# 所有的 PR 都需要 code review
* @reviewer-team

# 特定文件的 expert review
/src/checker/* @performance-expert-team
/src/database/* @database-expert-team
```

## 🤖 自动化工具

### Pre-commit Hook

创建 `.git/hooks/pre-commit`：

```bash
#!/bin/bash
# 检查 commit message 是否包含 review（如果已 review）

LAST_REVIEWED=$(git log -1 --grep="Review-Grade" --format=%H 2>/dev/null)
CURRENT_HEAD=$(git rev-parse HEAD)

if [ "$LAST_REVIEWED" = "$CURRENT_HEAD" ]; then
  echo "✅ This commit has been reviewed"
else
  echo "⚠️  This commit has not been reviewed yet"
  echo "   Run: .github/scripts/add-review.sh HEAD review.txt"
fi
```

### CI/CD 集成

在 `.github/workflows/review-check.yml` 中：

```yaml
name: Review Check

on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  check-review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
        with:
          fetch-depth: 0

      - name: Check Review Status
        run: |
          # 检查最新的 commits 是否有 review
          COMMITS=$(git log origin/main..HEAD --format=%H)
          for commit in $COMMITS; do
            if ! git show $commit --format=%B | grep -q "Review-Grade"; then
              echo "❌ Commit $commit lacks review"
              exit 1
            fi
          done
          echo "✅ All commits have been reviewed"
```

## 📚 最佳实践

### 1. Review 前

- [ ] 阅读 CODE_REVIEW_TEMPLATE.md
- [ ] 运行代码并测试功能
- [ ] 检查是否有性能影响
- [ ] 验证边界情况

### 2. Review 时

- [ ] 使用标准 trailer 格式
- [ ] 问题描述具体明确
- [ ] 提供可执行的修复建议
- [ ] 标注优先级和风险等级

### 3. Review 后

- [ ] 使用 `--force-with-lease` 推送
- [ ] 通知作者 review 结果
- [ ] 跟踪问题修复状态
- [ ] 更新 review 记录（如需要）

## 🔄 持续改进

定期分析 review 记录：

```bash
# 每月 review 统计
git log --since="1 month ago" --grep="Review-Grade" | \
  grep "Review-Grade" | sort | uniq -c

# 常见问题类型
git log --since="3 months ago" --grep="Review-Issue" --format=%B | \
  grep "Review-Issue" | cut -d: -f2 | sort | uniq -c | sort -rn
```

## 📞 获取帮助

- 查看模板：`.github/CODE_REVIEW_TEMPLATE.md`
- 运行脚本：`.github/scripts/show-review.sh HEAD`
- 查看示例：`git log --grep="Review-Grade" -1`
