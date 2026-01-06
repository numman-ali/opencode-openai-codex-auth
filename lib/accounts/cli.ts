import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

export async function promptAddAnotherAccount(currentCount: number): Promise<boolean> {
	const rl = createInterface({ input: stdin, output: stdout });
	try {
		const answer = await rl.question(
			`\nYou have ${currentCount} account(s). Add another? [y/N]: `,
		);
		return answer.toLowerCase().startsWith("y");
	} finally {
		rl.close();
	}
}
