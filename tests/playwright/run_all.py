"""Run every test_*.py suite in this folder, aggregate PASS/FAIL.

    python3 tests/playwright/run_all.py [http://localhost:5173]

Each suite opens its own browser. The runner captures PASS/FAIL status via the
child's exit code and prints a final matrix.
"""
from __future__ import annotations

import pathlib
import subprocess
import sys
import time


HERE = pathlib.Path(__file__).parent


def main() -> int:
    url = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:5173"
    suites = sorted(p for p in HERE.glob("test_*.py"))
    if not suites:
        print("No test_*.py files found.")
        return 1

    print(f"→ Running {len(suites)} suite(s) against {url}\n")
    results: list[tuple[str, int, float]] = []
    t0 = time.time()
    for s in suites:
        name = s.stem
        ts = time.time()
        r = subprocess.run([sys.executable, str(s), url], text=True)
        dt = time.time() - ts
        results.append((name, r.returncode, dt))

    total = time.time() - t0
    print()
    print("═" * 60)
    print(f"SUMMARY ({total:.1f}s total)")
    print("═" * 60)
    failed = 0
    for name, code, dt in results:
        mark = "✓" if code == 0 else "✗"
        print(f"  {mark} {name:<42} {dt:>6.1f}s")
        if code != 0:
            failed += 1
    print()
    print(f"{len(results) - failed}/{len(results)} suites passed")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
