import z from "@deepseek-ai/schemastery";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { LlmAdapter, ToolCallId } from "@deepseek-ai/dsh-llm";
//#region packages/mcp/mcp-client/tests/fixtures/runtime-status-model.ts
var RuntimePreflightModel = class extends LlmAdapter {
	async resolveModel(provider, model) {
		return {
			provider,
			id: model,
			name: model
		};
	}
	async *stream(options) {
		const runtimeTools = options.tools?.filter((tool) => tool.name.startsWith("mcp__openubmc-target-runtime__")).map((tool) => tool.name).sort();
		if (JSON.stringify(runtimeTools) !== JSON.stringify(["mcp__openubmc-target-runtime__execute", "mcp__openubmc-target-runtime__observe"])) throw new Error("Native Agent tools must be exactly observe and execute");
		if (!options.tools?.some((tool) => tool.name.startsWith("mcp__openubmc-kb__"))) throw new Error("Knowledge tools were not discovered");
		const last = options.messages.at(-1);
		const result = last?.role === "tool" ? last : void 0;
		if (result === void 0) {
			const block = {
				type: "tool-call",
				id: ToolCallId("runtime-status"),
				name: "mcp__openubmc-target-runtime__observe",
				arguments: "{}"
			};
			yield {
				type: "block-start",
				index: 0,
				blockType: "tool-call"
			};
			yield {
				type: "block-end",
				index: 0,
				block
			};
			yield {
				type: "finish",
				reason: { kind: "tool-calls" }
			};
		} else {
			if (result.isError !== true || !JSON.stringify(result).includes("observation-receipt") || !JSON.stringify(result).includes("error")) throw new Error("Structured Agent preflight failure is missing");
			yield {
				type: "block-start",
				index: 0,
				blockType: "text"
			};
			yield {
				type: "block-end",
				index: 0,
				block: {
					type: "text",
					text: "OPENUBMC_OFFLINE_OK"
				}
			};
			yield {
				type: "finish",
				reason: { kind: "stop" }
			};
		}
	}
};
/** Register the offline model; it submits only an invalid observe query. @param ctx - Owning fixture context. */
function apply$1(ctx) {
	ctx.effect(() => ctx.llm.registerAdapter(["deepseek-official"], new RuntimePreflightModel()));
}
//#endregion
//#region scripts/openubmc/plugin-preflight.ts
/** Preflight provider entry. */
const name = "openubmc-preflight";
/** Registries inspected by the optional lifecycle check. */
const inject = [
	"llm",
	"loader",
	"tools",
	"skills",
	"commands"
];
/** Lifecycle verification is disabled for ordinary preflight runs. */
const Config = z.object({
	verifyLifecycle: z.boolean().default(false),
	verifySetupOnly: z.boolean().default(false)
});
var SetupOnlyModel = class extends LlmAdapter {
	resolveModel(provider, id) {
		return Promise.resolve({
			provider,
			id,
			name: id
		});
	}
	async *stream(options) {
		await Promise.resolve();
		if (!options.tools?.some((tool) => tool.name === "openubmc_setup_status") || options.tools.some((tool) => tool.name.startsWith("mcp__openubmc-target-runtime__"))) throw new Error("Setup-only tool discovery failed");
		const last = options.messages.at(-1);
		if (last?.role !== "tool") {
			yield {
				type: "block-start",
				index: 0,
				blockType: "tool-call"
			};
			yield {
				type: "block-end",
				index: 0,
				block: {
					type: "tool-call",
					id: ToolCallId("setup-status"),
					name: "openubmc_setup_status",
					arguments: "{}"
				}
			};
			yield {
				type: "finish",
				reason: { kind: "tool-calls" }
			};
		} else {
			const text = last.content.flatMap((block) => block.type === "text" ? [block.text] : []).join("\n");
			if (last.isError === true || !text.includes("\"interpreter\":false")) throw new Error("Missing interpreter diagnostic was not retained");
			yield {
				type: "block-start",
				index: 0,
				blockType: "text"
			};
			yield {
				type: "block-end",
				index: 0,
				block: {
					type: "text",
					text: "OPENUBMC_SETUP_ONLY_OK"
				}
			};
			yield {
				type: "finish",
				reason: { kind: "stop" }
			};
		}
	}
};
/**
* Register the scripted preflight and optional registry cleanup assertions.
* @param ctx - Composed profile context.
* @param config - Whether to exercise disposal and remount without saving settings.
*/
function apply(ctx, config) {
	if (config.verifySetupOnly) ctx.effect(() => ctx.llm.registerAdapter(["deepseek-official"], new SetupOnlyModel()));
	else apply$1(ctx);
	if (!config.verifyLifecycle) return;
	let completed = false;
	ctx.on("agent/turn-stopping", async ({ agent }) => {
		if (completed) return;
		completed = true;
		const entry = [...ctx.loader.entries()].find((entry) => entry.options.name === "dsh-openubmc");
		if (entry?.fiber === void 0) throw new Error("The installed openUBMC bundle is unavailable.");
		const selected = async () => ({
			tools: ctx.tools.schemas().filter((tool) => tool.name.startsWith("mcp__openubmc-")).map((tool) => tool.name).sort(),
			skills: (await ctx.skills.list()).filter((skill) => skill.provider === "openubmc-packaged").map((skill) => skill.name).sort(),
			commands: ctx.commands.list(agent).filter((command) => [
				"run",
				"case",
				"target-authorize",
				"target-action",
				"target-reconcile",
				"openubmc-configure",
				"openubmc-doctor",
				"openubmc-repair",
				"openubmc-records"
			].includes(command.name)).map((command) => command.name).sort()
		});
		const before = await selected();
		if (before.tools.length === 0 || before.skills.length === 0 || before.commands.length === 0) throw new Error("openUBMC registrations are missing before disposal.");
		const setup = await ctx.skills.get("openubmc-environment-setup");
		if (setup?.provider !== "openubmc-packaged" || !setup.content.includes("dsh plugin --profile")) throw new Error("The packaged environment Skill must use DSH plugin management.");
		const debug = await ctx.skills.get("openubmc-debug");
		if (debug?.resourceBase?.kind !== "directory") throw new Error("The packaged Debug resources are unavailable.");
		const references = debug.resourceBase.path;
		const instructions = await readFile(join(references, "references/diagnostic-advice.md"), "utf8");
		if (instructions.includes("$HOME/.agents/skills/") || !instructions.includes(join(references, "scripts/diagnostic_advice.py"))) throw new Error("Packaged reference commands do not resolve to their installed resource generation.");
		await readFile(join(references, "scripts/diagnostic_advice.py"));
		const doctor = await ctx.commands.execute(agent, "/openubmc-doctor", [], new AbortController().signal);
		if (doctor?.result.kind !== "success" || doctor.result.text?.includes("\"integrity\": true") !== true) throw new Error("The installed plugin did not pass its native local readiness check.");
		const records = await ctx.commands.execute(agent, "/openubmc-records export", [], new AbortController().signal);
		if (records?.result.kind !== "success" || records.result.text?.includes("content_digest") !== true) throw new Error("The installed plugin could not export the current Session records.");
		const page = await ctx.commands.execute(agent, "/openubmc-configure", [], new AbortController().signal);
		if (page?.result.kind !== "success" || page.result.text === void 0) throw new Error("The native configuration command is unavailable.");
		const url = new URL(page.result.text);
		const headers = {
			"X-OpenUBMC-Session": url.hash.slice(1),
			Origin: url.origin,
			"Content-Type": "application/json"
		};
		if ((await fetch(new URL("/api/state", url))).status !== 403) throw new Error("Private configuration accepted an unauthenticated request.");
		if (!(await fetch(new URL("/api/state", url), { headers })).ok) throw new Error("The native configuration page cannot read its local state.");
		if (!(await fetch(new URL("/api/plugin", url), {
			method: "POST",
			headers,
			body: JSON.stringify({ action: "status" })
		})).ok) throw new Error("The configuration page cannot run DSH-owned diagnostics.");
		if (!(await fetch(new URL("/api/close", url), {
			method: "POST",
			headers,
			body: "{}"
		})).ok) throw new Error("The configuration page could not close its owned server.");
		if ((await ctx.commands.execute(agent, "/target-authorize execute 192.0.2.39 diagnose-and-fix source-only", [], new AbortController().signal))?.result.kind !== "success") throw new Error("The official Host could not record native scoped authorization.");
		entry.options.disabled = true;
		await entry.fiber.dispose();
		const after = await selected();
		if (after.tools.length || after.skills.length || after.commands.length) throw new Error("openUBMC registrations survived disposal.");
		entry.options.disabled = false;
		await entry.init();
		await entry.fiber.await();
		if (JSON.stringify(await selected()) !== JSON.stringify(before)) throw new Error("openUBMC registrations changed after remount.");
		if ((await ctx.commands.execute(agent, "/target-authorize revoke", [], new AbortController().signal))?.result.kind !== "success") throw new Error("The remounted provider could not revoke retained authorization.");
		console.log("OPENUBMC_LIFECYCLE_OK");
	});
}
//#endregion
export { Config, apply, inject, name };
