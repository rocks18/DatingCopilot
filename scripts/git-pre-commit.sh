#!/bin/sh
# Git pre-commit hook to block committing candidate data, photos, screenshots, or SQLite databases.

BLOCKED_FILES=$(git diff --cached --name-only | grep -E '^public/(screenshots|photos)/|^\.data/|\.(sqlite|sqlite-shm|sqlite-wal|db|png|jpg|jpeg|webp)$' | grep -v '^docs/')

if [ -n "$BLOCKED_FILES" ]; then
  echo "🚫 [PRE-COMMIT HOOK ERROR] Attempted to commit disallowed data/media files:"
  echo "$BLOCKED_FILES"
  echo ""
  echo "Commit blocked to protect user privacy and prevent data leakage."
  echo "To unstage these files, run: git reset HEAD <file>"
  exit 1
fi

exit 0
