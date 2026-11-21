/**
 * Static IPC contract check: every `invoke("command", { args })` in the frontend must
 * name a command registered in src-tauri/src/main.rs and pass exactly the camelCase
 * argument names its Rust signature expects (all non-Option arguments present).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..");

function walk(dir: string, exts: string[]): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return walk(path, exts);
    return exts.some((ext) => name.endsWith(ext)) ? [path] : [];
  });
}

const camel = (snake: string) => snake.replace(/_(\w)/g, (_, c: string) => c.toUpperCase());

function rustCommands() {
  const commands = new Map<string, { name: string; optional: boolean }[]>();
  for (const file of walk(join(root, "src-tauri/src"), [".rs"])) {
    const source = readFileSync(file, "utf8");
    const pattern = /#\[tauri::command\]\s*pub (?:async )?fn (\w+)(?:<[^>]*>)?\s*\(([\s\S]*?)\)\s*->/g;
    for (const match of source.matchAll(pattern)) {
      const args = match[2]
        .split(/,(?![^<]*>)/)
        .map((p) => p.trim())
        .filter((p) => p.includes(":") && !/State<|AppHandle/.test(p))
        .map((p) => {
          const [name, type] = p.split(/:(.*)/s);
          return { name: camel(name.replace("mut ", "").trim()), optional: type.includes("Option<") };
        });
      commands.set(match[1], args);
    }
  }
  return commands;
}

function topLevelKeys(objectLiteral: string): string[] {
  const keys: string[] = [];
  let depth = 0;
  let token = "";
  const flush = () => {
    const part = token.trim();
    token = "";
    if (!part) return;
    keys.push(part.startsWith("...") ? "..." : (part.match(/^(\w+)/)?.[1] ?? part));
  };
  for (const ch of objectLiteral) {
    if ("{[(".includes(ch)) depth++;
    if ("}])".includes(ch)) depth--;
    if (ch === "," && depth === 0) flush();
    else token += ch;
  }
  flush();
  return keys;
}

function frontendInvokes() {
  const calls: { where: string; command: string; keys: string[] | null }[] = [];
  for (const file of walk(join(root, "src"), [".ts", ".tsx"])) {
    const source = readFileSync(file, "utf8");
    const pattern = /invoke(?:<[^(]*?>)?\(\s*["'](\w+)["']\s*(,\s*\{)?/g;
    for (const match of source.matchAll(pattern)) {
      let keys: string[] | null = null;
      if (match[2]) {
        let index = match.index! + match[0].length - 1;
        let depth = 0;
        const start = index;
        for (; index < source.length; index++) {
          if (source[index] === "{") depth++;
          if (source[index] === "}" && --depth === 0) break;
        }
        keys = topLevelKeys(source.slice(start + 1, index));
      }
      const line = source.slice(0, match.index).split("\n").length;
      calls.push({ where: `${file.replace(root + "/", "")}:${line}`, command: match[1], keys });
    }
  }
  return calls;
}

describe("frontend ↔ Rust IPC contract", () => {
  const commands = rustCommands();
  const registered = readFileSync(join(root, "src-tauri/src/main.rs"), "utf8");
  const calls = frontendInvokes();

  it("finds the command surface", () => {
    expect(commands.size).toBeGreaterThan(40);
    expect(calls.length).toBeGreaterThan(50);
  });

  it("every Rust command is registered in the invoke handler", () => {
    const missing = [...commands.keys()].filter((name) => !registered.includes(`commands::${name}`));
    expect(missing).toEqual([]);
  });

  it("every invoke uses a registered command with matching argument names", () => {
    const problems: string[] = [];
    for (const call of calls) {
      const args = commands.get(call.command);
      if (!args) {
        problems.push(`${call.where}: unknown command ${call.command}`);
        continue;
      }
      const keys = call.keys ?? [];
      const expected = new Set(args.map((a) => a.name));
      const extra = keys.filter((k) => k !== "..." && !expected.has(k));
      const missing = keys.includes("...") ? [] : args.filter((a) => !a.optional && !keys.includes(a.name)).map((a) => a.name);
      if (extra.length || missing.length) {
        problems.push(`${call.where}: ${call.command} extra=[${extra}] missing=[${missing}]`);
      }
    }
    expect(problems).toEqual([]);
  });
});
