#!/usr/bin/env bash
# Idempotent VM setup for the groove repo: Node 22, extract, synthetic git repo, npm ci, then the benchmark.
set -uo pipefail
cd /content
step() { echo ""; echo "=== $* ==="; }

step "node"
if ! node -v 2>/dev/null | grep -q '^v22\.'; then
  cd /tmp
  curl -fsSL -o node.tar.xz https://nodejs.org/dist/v22.22.2/node-v22.22.2-linux-x64.tar.xz
  tar -xJf node.tar.xz -C /usr/local --strip-components=1
  rm -f node.tar.xz
fi
node -v; npm -v

step "extract"
mkdir -p /content/groove
tar -xzf /content/groove-src.tgz -C /content/groove
du -sh /content/groove

step "git"
cd /content/groove
# The shell runs as root and the extracted files are owned by `ubuntu`, so git refuses without this.
git config --global --add safe.directory /content/groove
if ! git rev-parse --git-dir >/dev/null 2>&1; then
  git init -q
  git add -A
  git -c user.email=colab@local -c user.name=colab commit -qm "colab baseline"
fi
echo "tracked files: $(git ls-files | wc -l)"

step "npm ci"
if [ ! -d node_modules ]; then
  npm ci --no-audit --no-fund
fi
echo "npm ci exit: $?"
node -e "console.log('package version', require('./package.json').version)"

step "smoke: full unit suite"
cd /content/groove
/usr/bin/time -f "wall %e s" node node_modules/vitest/vitest.mjs run --reporter=dot 2>&1 | tail -25

step "environment"
nproc
free -g | awk '/Mem:/{print "ram_gb", $2}'
df -h /content | tail -1
echo "SETUP_DONE"
