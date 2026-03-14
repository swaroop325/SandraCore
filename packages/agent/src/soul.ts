import { readFileSync } from "fs";
import { join } from "path";

let _soul: string | null = null;

export function getSoul(): string {
  if (!_soul) {
    const path = join(process.cwd(), "workspace", "SOUL.md");
    _soul = readFileSync(path, "utf-8");
  }
  return _soul;
}

/** Reset for testing */
export function _resetSoul(): void {
  _soul = null;
}
