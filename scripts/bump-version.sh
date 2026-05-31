#!/usr/bin/env bash
# Bumps Clipwise's app version, commits the change, and creates an annotated git tag.
# Usage: ./scripts/bump-version.sh [patch|minor|major|x.y.z]

set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./scripts/bump-version.sh [patch|minor|major|x.y.z]

Examples:
  ./scripts/bump-version.sh         # patch bump
  ./scripts/bump-version.sh minor   # minor bump
  ./scripts/bump-version.sh 1.2.3   # set exact version

Updates:
  package.json
  package-lock.json
  src-tauri/Cargo.toml
  src-tauri/Cargo.lock

Then creates:
  git commit: chore(release): bump version to x.y.z
  git tag:    vx.y.z
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ "$#" -gt 1 ]]; then
  usage >&2
  exit 1
fi

BUMP="${1:-patch}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$REPO_ROOT"

if ! command -v node >/dev/null 2>&1; then
  echo "Error: node is required to bump version files." >&2
  exit 1
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Error: must run inside a git repository." >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Error: working tree must be clean before bumping a version." >&2
  git status --short >&2
  exit 1
fi

current="$(node -p "require('./package.json').version")"

if [[ ! "$current" =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)([-+][0-9A-Za-z.-]+)?$ ]]; then
  echo "Error: package.json version is not a supported semver value: $current" >&2
  exit 1
fi

major="${BASH_REMATCH[1]}"
minor="${BASH_REMATCH[2]}"
patch="${BASH_REMATCH[3]}"

case "$BUMP" in
  major)
    next="$((major + 1)).0.0"
    ;;
  minor)
    next="${major}.$((minor + 1)).0"
    ;;
  patch)
    next="${major}.${minor}.$((patch + 1))"
    ;;
  v*)
    next="${BUMP#v}"
    ;;
  *)
    next="$BUMP"
    ;;
esac

if [[ ! "$next" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z]+([.-][0-9A-Za-z]+)*)?(\+[0-9A-Za-z]+([.-][0-9A-Za-z]+)*)?$ ]]; then
  echo "Error: unsupported version bump '$BUMP'. Use patch, minor, major, or x.y.z." >&2
  exit 1
fi

if [[ "$next" == "$current" ]]; then
  echo "Error: next version matches current version: $current" >&2
  exit 1
fi

tag="v${next}"

if ! git check-ref-format "refs/tags/${tag}"; then
  echo "Error: version produces an invalid git tag: $tag" >&2
  exit 1
fi

if git rev-parse -q --verify "refs/tags/${tag}" >/dev/null; then
  echo "Error: git tag already exists: $tag" >&2
  exit 1
fi

VERSION="$next" node <<'NODE'
const fs = require("fs");

const version = process.env.VERSION;

function writeJson(path, value) {
  fs.writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function replaceOne(path, pattern, replacement) {
  const input = fs.readFileSync(path, "utf8");
  const output = input.replace(pattern, replacement);

  if (output === input) {
    throw new Error(`Could not update version in ${path}`);
  }

  fs.writeFileSync(path, output);
}

const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
packageJson.version = version;
writeJson("package.json", packageJson);

const packageLock = JSON.parse(fs.readFileSync("package-lock.json", "utf8"));
packageLock.version = version;

if (packageLock.packages && packageLock.packages[""]) {
  packageLock.packages[""].version = version;
}

writeJson("package-lock.json", packageLock);

replaceOne(
  "src-tauri/Cargo.toml",
  /(^\[package\][\s\S]*?^version = ")[^"]+(")/m,
  `$1${version}$2`,
);

replaceOne(
  "src-tauri/Cargo.lock",
  /(\[\[package\]\]\nname = "clipwise"\nversion = ")[^"]+(")/,
  `$1${version}$2`,
);
NODE

git add package.json package-lock.json src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "chore(release): bump version to ${next}"
git tag -a "$tag" -m "$tag"

echo "Bumped Clipwise ${current} -> ${next}"
echo "Created commit and tag ${tag}"
