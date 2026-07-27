#!/bin/bash
# Vercel 构建脚本
# 1. 执行 uni-app H5 构建
# 2. 将输出重组为 Vercel Build Output v3 格式 (.vercel/output/static/)
# 这样 Vercel 自动识别正确的输出目录，无需在 Dashboard 手动配置 Output Directory

set -e

echo "==> Building H5..."
npm run build:h5

echo "==> Preparing Vercel output..."
# 清理旧的输出
rm -rf .vercel/output

# 创建 Vercel Build Output v3 目录结构
mkdir -p .vercel/output/static

# 将构建产物复制到 .vercel/output/static/
# uni-app H5 构建输出在 dist/build/h5/
cp -r dist/build/h5/* .vercel/output/static/

# 创建 Vercel 配置（SPA 路由 + 静态资源缓存）
cat > .vercel/output/config.json << 'EOF'
{
  "version": 3,
  "routes": [
    { "handle": "filesystem" },
    { "src": "/(.*)", "dest": "/index.html" }
  ]
}
EOF

echo "==> Vercel output ready at .vercel/output/static/"
ls -la .vercel/output/static/
