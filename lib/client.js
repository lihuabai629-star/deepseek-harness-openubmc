window.__ModuleLoader__.load({
	id: "dsh-openubmc",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region scripts/openubmc/plugin.client.tsx
		const en = {
			description: "Accounts stay on this DSH host. Saving activates a private revision; device checks run only when requested.",
			targets: "Device accounts",
			kb: "Knowledge base",
			conan: "Conan",
			diagnostics: "Local diagnostics and dependency repair are available in each configuration page."
		};
		const zh = {
			description: "账号保存在此 DSH 主机。保存后激活私有配置版本；设备连接检查需显式执行。",
			targets: "设备账号",
			kb: "知识库",
			conan: "Conan",
			diagnostics: "各配置页均可检查本地状态和修复依赖。"
		};
		/** Required browser registries. */
		const inject = ["slots", "locale"];
		/**
		* Add configuration to the owned bundle without registering conversation presentation.
		* @param ctx - Browser plugin fiber.
		*/
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register("openubmcSettings", {
				en,
				zh
			}));
			ctx.slots.inject("plugins.bundle.config", () => ctx.slots.register({
				name: "plugins.bundle.config",
				key: "dsh-openubmc",
				locale: "openubmcSettings"
			}, Settings));
		}
		function Settings({ t }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("description") }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					style: {
						display: "flex",
						flexWrap: "wrap",
						gap: 8
					},
					children: [
						"targets",
						"kb",
						"conan"
					].map((kind) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
						variant: "outline",
						onClick: () => {
							window.open(new URL(`./openubmc?kind=${kind}`, document.baseURI), "_blank", "noopener,noreferrer");
						},
						children: t(kind)
					}, kind))
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("diagnostics") })
			] });
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
