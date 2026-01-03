#!/bin/bash
# Creates symlinks from supabase/migrations to fe/scripts

cd "$(dirname "$0")/migrations"

# Remove existing symlinks
rm -f *.sql 2>/dev/null

for file in ../../fe/scripts/0*.sql; do
  base=$(basename "$file")

  # Skip rollback scripts
  if [[ "$base" == *"_rollback"* ]]; then
    continue
  fi

  # Skip the original combined 042 file (we use 042_1, 042_2, 042_3 instead)
  if [[ "$base" == "042_atomic_transaction_functions.sql" ]]; then
    continue
  fi

  # Extract number part (e.g., "042_1" or "042")
  num_part=$(echo "$base" | sed 's/^\([0-9_]*\)_.*/\1/')
  name=$(echo "$base" | sed 's/^[0-9_]*_//')

  # Handle decimal versions like 042_1 -> 042001
  if [[ "$num_part" == *"_"* ]]; then
    main_num=$(echo "$num_part" | cut -d'_' -f1 | sed 's/^0*//')
    sub_num=$(echo "$num_part" | cut -d'_' -f2)
    # Create timestamp: main*1000 + sub (e.g., 042_1 -> 42001)
    combined=$((10#$main_num * 1000 + 10#$sub_num))
    timestamp="20240101$(printf '%06d' "$combined")"
  else
    # Regular number (e.g., 041 -> 41000)
    num=$(echo "$num_part" | sed 's/^0*//')
    combined=$((10#$num * 1000))
    timestamp="20240101$(printf '%06d' "$combined")"
  fi

  ln -sf "$file" "${timestamp}_${name}"
done

echo "Created $(ls *.sql 2>/dev/null | wc -l) migration symlinks"
echo ""
echo "First 5:"
ls *.sql 2>/dev/null | head -5
echo "..."
echo "Around 042:"
ls *.sql 2>/dev/null | grep -E "04[12]" | head -10
echo "..."
echo "Last 5:"
ls *.sql 2>/dev/null | tail -5
