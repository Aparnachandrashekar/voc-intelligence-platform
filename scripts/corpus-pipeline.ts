import { spawnSync } from "child_process";

const steps: [string, string[]][] = [
  ["npm", ["run", "corpus:cap"]],
  ["npm", ["run", "enrich", "--", "--force"]],
  ["npm", ["run", "embed:active", "--", "--force"]],
];

for (const [cmd, args] of steps) {
  console.log(`\n>>> ${cmd} ${args.join(" ")}\n`);
  const result = spawnSync(cmd, args, { stdio: "inherit", cwd: process.cwd() });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log("\nCorpus pipeline complete (cap → enrich → embed).");
