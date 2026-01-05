import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

export async function promptAddAnotherAccount(
  currentCount: number,
): Promise<boolean> {
  const rl = createInterface({ input, output });
  try {
    const answer = await rl.question(
      `Add another account? (${currentCount} added) (y/n): `,
    );
    const normalized = answer.trim().toLowerCase();
    return normalized === "y" || normalized === "yes";
  } finally {
    rl.close();
  }
}

export type LoginMode = "add" | "fresh";

export interface ExistingAccountInfo {
  accountId?: string;
  index: number;
}

function formatAccountLabel(accountId: string | undefined, index: number): string {
  if (!accountId) return `Account ${index + 1}`;
  const suffix = accountId.length > 6 ? accountId.slice(-6) : accountId;
  return `Account ${index + 1} (${suffix})`;
}

export async function promptLoginMode(
  existingAccounts: ExistingAccountInfo[],
): Promise<LoginMode> {
  const rl = createInterface({ input, output });
  try {
    console.log(`\n${existingAccounts.length} account(s) saved:`);
    for (const account of existingAccounts) {
      console.log(`  ${formatAccountLabel(account.accountId, account.index)}`);
    }
    console.log("");

    while (true) {
      const answer = await rl.question(
        "(a)dd new account(s) or (f)resh start? [a/f]: ",
      );
      const normalized = answer.trim().toLowerCase();
      if (normalized === "a" || normalized === "add") {
        return "add";
      }
      if (normalized === "f" || normalized === "fresh") {
        return "fresh";
      }
      console.log("Please enter 'a' to add accounts or 'f' to start fresh.");
    }
  } finally {
    rl.close();
  }
}
