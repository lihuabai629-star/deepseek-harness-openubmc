import { d as object, p as string } from "./schemas-CB2WAVv6.js";
import { createRequire } from "node:module";
import z from "@deepseek-ai/schemastery";
//#region scripts/openubmc/compatibility.ts
/** Official releases qualified through the installed-package protocol tests. @module */
/** Full prerelease versions; unqualified releases fail closed at plugin load. */
const qualifiedHostVersions = [
	"0.1.7-rc.2",
	"0.2.0-rc.2",
	"0.2.1-rc.2"
];
/**
* Reject versions without installed-package evidence.
* @param version - Host package's validated complete release version.
*/
function assertQualifiedHost(version) {
	if (!qualifiedHostVersions.includes(version)) throw new Error(`openUBMC supports qualified DSH versions ${qualifiedHostVersions.join(", ")}. Select a qualified Host version.`);
}
//#endregion
//#region scripts/openubmc/plugin-config.ts
/** Deployment configuration for the installable openUBMC bundle. @module */
/** Deployment settings remain editable in the profile's own patch. */
const Config = z.object({
	python: z.string().min(1).default("python3"),
	node: z.string().min(1),
	credentialsFile: z.string().min(1),
	stateDir: z.string().min(1),
	kbConfigFile: z.string().min(1),
	authorityLockWaitMs: z.number().min(1).max(6e4).default(1e3),
	kbEnabled: z.boolean().default(true),
	operationDeadlineSeconds: z.number().min(1).max(120).default(120),
	observationDeadlineSeconds: z.number().min(1).max(2147483).default(180),
	completionGraceMs: z.number().min(1).max(2147483647).default(1e4),
	toolCallTimeoutMs: z.number().min(1).max(2147483647).default(19e4),
	setupTimeoutSeconds: z.number().min(1).max(3600).default(660),
	configurationIdleSeconds: z.number().min(1).max(3600).default(900)
});
//#endregion
//#region scripts/openubmc/plugin-entry.ts
/** Bundle entry registered by cordis.patch.yml. */
const name = "openubmc";
/** Host services used by the child plugins. */
const inject = [
	"skills",
	"tools",
	"commands",
	"sessionProjections",
	"systemPrompt"
];
/**
* Load the bundled adapter using public Host registries.
* @param ctx - Profile plugin context.
* @param config - Validated deployment settings.
*/
async function apply(ctx, config) {
	assertQualifiedHost(object({ version: string() }).parse(createRequire(import.meta.url)("@deepseek-ai/dsh-tools/package.json")).version);
	await (await import("./plugin-DTz9hP5m.js")).apply(ctx, config);
}
//#endregion
export { Config, apply, inject, name };
