import { a as discriminatedUnion, c as json, d as object$1, f as record$1, g as toJSONSchema, h as url, i as boolean, l as literal, m as union, n as _null, o as ipv4, p as string, r as array, s as ipv6, t as _enum, u as number } from "./schemas-CB2WAVv6.js";
import z from "@deepseek-ai/schemastery";
import { lstat, mkdir, mkdtemp, open, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { ToolCallId, createToolResultMessage, createUserMessage } from "@deepseek-ai/dsh-llm";
import { fileURLToPath } from "node:url";
import { isSea } from "node:sea";
import { dshHomePath } from "@deepseek-ai/dsh-home-paths";
import * as mcp from "@deepseek-ai/dsh-mcp-client";
import { BUNDLED_SKILL_RANK } from "@deepseek-ai/dsh-skill";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { CommandDefinitionId, CommandId } from "@deepseek-ai/dsh-commands";
import { scrubbedParentEnv } from "@deepseek-ai/dsh-subprocess";
import { createHash, randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { brandString } from "@deepseek-ai/dsh-brand";
import { SessionLogOffset, SessionSeq, TOOL_OUTCOME_UNKNOWN } from "@deepseek-ai/dsh-session";
import { TOOL_ABORTED } from "@deepseek-ai/dsh-tools";
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
//#region node_modules/.pnpm/js-yaml@4.2.0/node_modules/js-yaml/dist/js-yaml.mjs
/*! js-yaml 4.2.0 https://github.com/nodeca/js-yaml @license MIT */
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJSMin = (cb, mod) => () => (mod || (cb((mod = { exports: {} }).exports, mod), cb = null), mod.exports);
var __copyProps = (to, from, except, desc) => {
	if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
		key = keys[i];
		if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
			get: ((k) => from[k]).bind(null, key),
			enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
		});
	}
	return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", {
	value: mod,
	enumerable: true
}) : target, mod));
var require_common = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	function isNothing(subject) {
		return typeof subject === "undefined" || subject === null;
	}
	function isObject(subject) {
		return typeof subject === "object" && subject !== null;
	}
	function toArray(sequence) {
		if (Array.isArray(sequence)) return sequence;
		else if (isNothing(sequence)) return [];
		return [sequence];
	}
	function extend(target, source) {
		if (source) {
			const sourceKeys = Object.keys(source);
			for (let index = 0, length = sourceKeys.length; index < length; index += 1) {
				const key = sourceKeys[index];
				target[key] = source[key];
			}
		}
		return target;
	}
	function repeat(string, count) {
		let result = "";
		for (let cycle = 0; cycle < count; cycle += 1) result += string;
		return result;
	}
	function isNegativeZero(number) {
		return number === 0 && Number.NEGATIVE_INFINITY === 1 / number;
	}
	module.exports.isNothing = isNothing;
	module.exports.isObject = isObject;
	module.exports.toArray = toArray;
	module.exports.repeat = repeat;
	module.exports.isNegativeZero = isNegativeZero;
	module.exports.extend = extend;
}));
var require_exception = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	function formatError(exception, compact) {
		let where = "";
		const message = exception.reason || "(unknown reason)";
		if (!exception.mark) return message;
		if (exception.mark.name) where += "in \"" + exception.mark.name + "\" ";
		where += "(" + (exception.mark.line + 1) + ":" + (exception.mark.column + 1) + ")";
		if (!compact && exception.mark.snippet) where += "\n\n" + exception.mark.snippet;
		return message + " " + where;
	}
	function YAMLException(reason, mark) {
		Error.call(this);
		this.name = "YAMLException";
		this.reason = reason;
		this.mark = mark;
		this.message = formatError(this, false);
		if (Error.captureStackTrace) Error.captureStackTrace(this, this.constructor);
		else this.stack = (/* @__PURE__ */ new Error()).stack || "";
	}
	YAMLException.prototype = Object.create(Error.prototype);
	YAMLException.prototype.constructor = YAMLException;
	YAMLException.prototype.toString = function toString(compact) {
		return this.name + ": " + formatError(this, compact);
	};
	module.exports = YAMLException;
}));
var require_snippet = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var common = require_common();
	function getLine(buffer, lineStart, lineEnd, position, maxLineLength) {
		let head = "";
		let tail = "";
		const maxHalfLength = Math.floor(maxLineLength / 2) - 1;
		if (position - lineStart > maxHalfLength) {
			head = " ... ";
			lineStart = position - maxHalfLength + head.length;
		}
		if (lineEnd - position > maxHalfLength) {
			tail = " ...";
			lineEnd = position + maxHalfLength - tail.length;
		}
		return {
			str: head + buffer.slice(lineStart, lineEnd).replace(/\t/g, "→") + tail,
			pos: position - lineStart + head.length
		};
	}
	function padStart(string, max) {
		return common.repeat(" ", max - string.length) + string;
	}
	function makeSnippet(mark, options) {
		options = Object.create(options || null);
		if (!mark.buffer) return null;
		if (!options.maxLength) options.maxLength = 79;
		if (typeof options.indent !== "number") options.indent = 1;
		if (typeof options.linesBefore !== "number") options.linesBefore = 3;
		if (typeof options.linesAfter !== "number") options.linesAfter = 2;
		const re = /\r?\n|\r|\0/g;
		const lineStarts = [0];
		const lineEnds = [];
		let match;
		let foundLineNo = -1;
		while (match = re.exec(mark.buffer)) {
			lineEnds.push(match.index);
			lineStarts.push(match.index + match[0].length);
			if (mark.position <= match.index && foundLineNo < 0) foundLineNo = lineStarts.length - 2;
		}
		if (foundLineNo < 0) foundLineNo = lineStarts.length - 1;
		let result = "";
		const lineNoLength = Math.min(mark.line + options.linesAfter, lineEnds.length).toString().length;
		const maxLineLength = options.maxLength - (options.indent + lineNoLength + 3);
		for (let i = 1; i <= options.linesBefore; i++) {
			if (foundLineNo - i < 0) break;
			const line = getLine(mark.buffer, lineStarts[foundLineNo - i], lineEnds[foundLineNo - i], mark.position - (lineStarts[foundLineNo] - lineStarts[foundLineNo - i]), maxLineLength);
			result = common.repeat(" ", options.indent) + padStart((mark.line - i + 1).toString(), lineNoLength) + " | " + line.str + "\n" + result;
		}
		const line = getLine(mark.buffer, lineStarts[foundLineNo], lineEnds[foundLineNo], mark.position, maxLineLength);
		result += common.repeat(" ", options.indent) + padStart((mark.line + 1).toString(), lineNoLength) + " | " + line.str + "\n";
		result += common.repeat("-", options.indent + lineNoLength + 3 + line.pos) + "^\n";
		for (let i = 1; i <= options.linesAfter; i++) {
			if (foundLineNo + i >= lineEnds.length) break;
			const line = getLine(mark.buffer, lineStarts[foundLineNo + i], lineEnds[foundLineNo + i], mark.position - (lineStarts[foundLineNo] - lineStarts[foundLineNo + i]), maxLineLength);
			result += common.repeat(" ", options.indent) + padStart((mark.line + i + 1).toString(), lineNoLength) + " | " + line.str + "\n";
		}
		return result.replace(/\n$/, "");
	}
	module.exports = makeSnippet;
}));
var require_type = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var YAMLException = require_exception();
	var TYPE_CONSTRUCTOR_OPTIONS = [
		"kind",
		"multi",
		"resolve",
		"construct",
		"instanceOf",
		"predicate",
		"represent",
		"representName",
		"defaultStyle",
		"styleAliases"
	];
	var YAML_NODE_KINDS = [
		"scalar",
		"sequence",
		"mapping"
	];
	function compileStyleAliases(map) {
		const result = {};
		if (map !== null) Object.keys(map).forEach(function(style) {
			map[style].forEach(function(alias) {
				result[String(alias)] = style;
			});
		});
		return result;
	}
	function Type(tag, options) {
		options = options || {};
		Object.keys(options).forEach(function(name) {
			if (TYPE_CONSTRUCTOR_OPTIONS.indexOf(name) === -1) throw new YAMLException("Unknown option \"" + name + "\" is met in definition of \"" + tag + "\" YAML type.");
		});
		this.options = options;
		this.tag = tag;
		this.kind = options["kind"] || null;
		this.resolve = options["resolve"] || function() {
			return true;
		};
		this.construct = options["construct"] || function(data) {
			return data;
		};
		this.instanceOf = options["instanceOf"] || null;
		this.predicate = options["predicate"] || null;
		this.represent = options["represent"] || null;
		this.representName = options["representName"] || null;
		this.defaultStyle = options["defaultStyle"] || null;
		this.multi = options["multi"] || false;
		this.styleAliases = compileStyleAliases(options["styleAliases"] || null);
		if (YAML_NODE_KINDS.indexOf(this.kind) === -1) throw new YAMLException("Unknown kind \"" + this.kind + "\" is specified for \"" + tag + "\" YAML type.");
	}
	module.exports = Type;
}));
var require_schema = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var YAMLException = require_exception();
	var Type = require_type();
	function compileList(schema, name) {
		const result = [];
		schema[name].forEach(function(currentType) {
			let newIndex = result.length;
			result.forEach(function(previousType, previousIndex) {
				if (previousType.tag === currentType.tag && previousType.kind === currentType.kind && previousType.multi === currentType.multi) newIndex = previousIndex;
			});
			result[newIndex] = currentType;
		});
		return result;
	}
	function compileMap() {
		const result = {
			scalar: {},
			sequence: {},
			mapping: {},
			fallback: {},
			multi: {
				scalar: [],
				sequence: [],
				mapping: [],
				fallback: []
			}
		};
		function collectType(type) {
			if (type.multi) {
				result.multi[type.kind].push(type);
				result.multi["fallback"].push(type);
			} else result[type.kind][type.tag] = result["fallback"][type.tag] = type;
		}
		for (let index = 0, length = arguments.length; index < length; index += 1) arguments[index].forEach(collectType);
		return result;
	}
	function Schema(definition) {
		return this.extend(definition);
	}
	Schema.prototype.extend = function extend(definition) {
		let implicit = [];
		let explicit = [];
		if (definition instanceof Type) explicit.push(definition);
		else if (Array.isArray(definition)) explicit = explicit.concat(definition);
		else if (definition && (Array.isArray(definition.implicit) || Array.isArray(definition.explicit))) {
			if (definition.implicit) implicit = implicit.concat(definition.implicit);
			if (definition.explicit) explicit = explicit.concat(definition.explicit);
		} else throw new YAMLException("Schema.extend argument should be a Type, [ Type ], or a schema definition ({ implicit: [...], explicit: [...] })");
		implicit.forEach(function(type) {
			if (!(type instanceof Type)) throw new YAMLException("Specified list of YAML types (or a single Type object) contains a non-Type object.");
			if (type.loadKind && type.loadKind !== "scalar") throw new YAMLException("There is a non-scalar type in the implicit list of a schema. Implicit resolving of such types is not supported.");
			if (type.multi) throw new YAMLException("There is a multi type in the implicit list of a schema. Multi tags can only be listed as explicit.");
		});
		explicit.forEach(function(type) {
			if (!(type instanceof Type)) throw new YAMLException("Specified list of YAML types (or a single Type object) contains a non-Type object.");
		});
		const result = Object.create(Schema.prototype);
		result.implicit = (this.implicit || []).concat(implicit);
		result.explicit = (this.explicit || []).concat(explicit);
		result.compiledImplicit = compileList(result, "implicit");
		result.compiledExplicit = compileList(result, "explicit");
		result.compiledTypeMap = compileMap(result.compiledImplicit, result.compiledExplicit);
		return result;
	};
	module.exports = Schema;
}));
var require_str = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = new (require_type())("tag:yaml.org,2002:str", {
		kind: "scalar",
		construct: function(data) {
			return data !== null ? data : "";
		}
	});
}));
var require_seq = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = new (require_type())("tag:yaml.org,2002:seq", {
		kind: "sequence",
		construct: function(data) {
			return data !== null ? data : [];
		}
	});
}));
var require_map = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = new (require_type())("tag:yaml.org,2002:map", {
		kind: "mapping",
		construct: function(data) {
			return data !== null ? data : {};
		}
	});
}));
var require_failsafe = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = new (require_schema())({ explicit: [
		require_str(),
		require_seq(),
		require_map()
	] });
}));
var require_null = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var Type = require_type();
	function resolveYamlNull(data) {
		if (data === null) return true;
		const max = data.length;
		return max === 1 && data === "~" || max === 4 && (data === "null" || data === "Null" || data === "NULL");
	}
	function constructYamlNull() {
		return null;
	}
	function isNull(object) {
		return object === null;
	}
	module.exports = new Type("tag:yaml.org,2002:null", {
		kind: "scalar",
		resolve: resolveYamlNull,
		construct: constructYamlNull,
		predicate: isNull,
		represent: {
			canonical: function() {
				return "~";
			},
			lowercase: function() {
				return "null";
			},
			uppercase: function() {
				return "NULL";
			},
			camelcase: function() {
				return "Null";
			},
			empty: function() {
				return "";
			}
		},
		defaultStyle: "lowercase"
	});
}));
var require_bool = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var Type = require_type();
	function resolveYamlBoolean(data) {
		if (data === null) return false;
		const max = data.length;
		return max === 4 && (data === "true" || data === "True" || data === "TRUE") || max === 5 && (data === "false" || data === "False" || data === "FALSE");
	}
	function constructYamlBoolean(data) {
		return data === "true" || data === "True" || data === "TRUE";
	}
	function isBoolean(object) {
		return Object.prototype.toString.call(object) === "[object Boolean]";
	}
	module.exports = new Type("tag:yaml.org,2002:bool", {
		kind: "scalar",
		resolve: resolveYamlBoolean,
		construct: constructYamlBoolean,
		predicate: isBoolean,
		represent: {
			lowercase: function(object) {
				return object ? "true" : "false";
			},
			uppercase: function(object) {
				return object ? "TRUE" : "FALSE";
			},
			camelcase: function(object) {
				return object ? "True" : "False";
			}
		},
		defaultStyle: "lowercase"
	});
}));
var require_int = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var common = require_common();
	var Type = require_type();
	function isHexCode(c) {
		return c >= 48 && c <= 57 || c >= 65 && c <= 70 || c >= 97 && c <= 102;
	}
	function isOctCode(c) {
		return c >= 48 && c <= 55;
	}
	function isDecCode(c) {
		return c >= 48 && c <= 57;
	}
	function resolveYamlInteger(data) {
		if (data === null) return false;
		const max = data.length;
		let index = 0;
		let hasDigits = false;
		if (!max) return false;
		let ch = data[index];
		if (ch === "-" || ch === "+") ch = data[++index];
		if (ch === "0") {
			if (index + 1 === max) return true;
			ch = data[++index];
			if (ch === "b") {
				index++;
				for (; index < max; index++) {
					ch = data[index];
					if (ch !== "0" && ch !== "1") return false;
					hasDigits = true;
				}
				return hasDigits && Number.isFinite(parseYamlInteger(data));
			}
			if (ch === "x") {
				index++;
				for (; index < max; index++) {
					if (!isHexCode(data.charCodeAt(index))) return false;
					hasDigits = true;
				}
				return hasDigits && Number.isFinite(parseYamlInteger(data));
			}
			if (ch === "o") {
				index++;
				for (; index < max; index++) {
					if (!isOctCode(data.charCodeAt(index))) return false;
					hasDigits = true;
				}
				return hasDigits && Number.isFinite(parseYamlInteger(data));
			}
		}
		for (; index < max; index++) {
			if (!isDecCode(data.charCodeAt(index))) return false;
			hasDigits = true;
		}
		if (!hasDigits) return false;
		return Number.isFinite(parseYamlInteger(data));
	}
	function parseYamlInteger(data) {
		let value = data;
		let sign = 1;
		let ch = value[0];
		if (ch === "-" || ch === "+") {
			if (ch === "-") sign = -1;
			value = value.slice(1);
			ch = value[0];
		}
		if (value === "0") return 0;
		if (ch === "0") {
			if (value[1] === "b") return sign * parseInt(value.slice(2), 2);
			if (value[1] === "x") return sign * parseInt(value.slice(2), 16);
			if (value[1] === "o") return sign * parseInt(value.slice(2), 8);
		}
		return sign * parseInt(value, 10);
	}
	function constructYamlInteger(data) {
		return parseYamlInteger(data);
	}
	function isInteger(object) {
		return Object.prototype.toString.call(object) === "[object Number]" && object % 1 === 0 && !common.isNegativeZero(object);
	}
	module.exports = new Type("tag:yaml.org,2002:int", {
		kind: "scalar",
		resolve: resolveYamlInteger,
		construct: constructYamlInteger,
		predicate: isInteger,
		represent: {
			binary: function(obj) {
				return obj >= 0 ? "0b" + obj.toString(2) : "-0b" + obj.toString(2).slice(1);
			},
			octal: function(obj) {
				return obj >= 0 ? "0o" + obj.toString(8) : "-0o" + obj.toString(8).slice(1);
			},
			decimal: function(obj) {
				return obj.toString(10);
			},
			hexadecimal: function(obj) {
				return obj >= 0 ? "0x" + obj.toString(16).toUpperCase() : "-0x" + obj.toString(16).toUpperCase().slice(1);
			}
		},
		defaultStyle: "decimal",
		styleAliases: {
			binary: [2, "bin"],
			octal: [8, "oct"],
			decimal: [10, "dec"],
			hexadecimal: [16, "hex"]
		}
	});
}));
var require_float = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var common = require_common();
	var Type = require_type();
	var YAML_FLOAT_PATTERN = /* @__PURE__ */ new RegExp("^(?:[-+]?(?:[0-9]+)(?:\\.[0-9]*)?(?:[eE][-+]?[0-9]+)?|\\.[0-9]+(?:[eE][-+]?[0-9]+)?|[-+]?\\.(?:inf|Inf|INF)|\\.(?:nan|NaN|NAN))$");
	var YAML_FLOAT_SPECIAL_PATTERN = /* @__PURE__ */ new RegExp("^(?:[-+]?\\.(?:inf|Inf|INF)|\\.(?:nan|NaN|NAN))$");
	function resolveYamlFloat(data) {
		if (data === null) return false;
		if (!YAML_FLOAT_PATTERN.test(data)) return false;
		if (Number.isFinite(parseFloat(data, 10))) return true;
		return YAML_FLOAT_SPECIAL_PATTERN.test(data);
	}
	function constructYamlFloat(data) {
		let value = data.toLowerCase();
		const sign = value[0] === "-" ? -1 : 1;
		if ("+-".indexOf(value[0]) >= 0) value = value.slice(1);
		if (value === ".inf") return sign === 1 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
		else if (value === ".nan") return NaN;
		return sign * parseFloat(value, 10);
	}
	var SCIENTIFIC_WITHOUT_DOT = /^[-+]?[0-9]+e/;
	function representYamlFloat(object, style) {
		if (isNaN(object)) switch (style) {
			case "lowercase": return ".nan";
			case "uppercase": return ".NAN";
			case "camelcase": return ".NaN";
		}
		else if (Number.POSITIVE_INFINITY === object) switch (style) {
			case "lowercase": return ".inf";
			case "uppercase": return ".INF";
			case "camelcase": return ".Inf";
		}
		else if (Number.NEGATIVE_INFINITY === object) switch (style) {
			case "lowercase": return "-.inf";
			case "uppercase": return "-.INF";
			case "camelcase": return "-.Inf";
		}
		else if (common.isNegativeZero(object)) return "-0.0";
		const res = object.toString(10);
		return SCIENTIFIC_WITHOUT_DOT.test(res) ? res.replace("e", ".e") : res;
	}
	function isFloat(object) {
		return Object.prototype.toString.call(object) === "[object Number]" && (object % 1 !== 0 || common.isNegativeZero(object));
	}
	module.exports = new Type("tag:yaml.org,2002:float", {
		kind: "scalar",
		resolve: resolveYamlFloat,
		construct: constructYamlFloat,
		predicate: isFloat,
		represent: representYamlFloat,
		defaultStyle: "lowercase"
	});
}));
var require_json = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = require_failsafe().extend({ implicit: [
		require_null(),
		require_bool(),
		require_int(),
		require_float()
	] });
}));
var require_core = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = require_json();
}));
var require_timestamp = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var Type = require_type();
	var YAML_DATE_REGEXP = /* @__PURE__ */ new RegExp("^([0-9][0-9][0-9][0-9])-([0-9][0-9])-([0-9][0-9])$");
	var YAML_TIMESTAMP_REGEXP = /* @__PURE__ */ new RegExp("^([0-9][0-9][0-9][0-9])-([0-9][0-9]?)-([0-9][0-9]?)(?:[Tt]|[ \\t]+)([0-9][0-9]?):([0-9][0-9]):([0-9][0-9])(?:\\.([0-9]*))?(?:[ \\t]*(Z|([-+])([0-9][0-9]?)(?::([0-9][0-9]))?))?$");
	function resolveYamlTimestamp(data) {
		if (data === null) return false;
		if (YAML_DATE_REGEXP.exec(data) !== null) return true;
		if (YAML_TIMESTAMP_REGEXP.exec(data) !== null) return true;
		return false;
	}
	function constructYamlTimestamp(data) {
		let fraction = 0;
		let delta = null;
		let match = YAML_DATE_REGEXP.exec(data);
		if (match === null) match = YAML_TIMESTAMP_REGEXP.exec(data);
		if (match === null) throw new Error("Date resolve error");
		const year = +match[1];
		const month = +match[2] - 1;
		const day = +match[3];
		if (!match[4]) return new Date(Date.UTC(year, month, day));
		const hour = +match[4];
		const minute = +match[5];
		const second = +match[6];
		if (match[7]) {
			fraction = match[7].slice(0, 3);
			while (fraction.length < 3) fraction += "0";
			fraction = +fraction;
		}
		if (match[9]) {
			const tzHour = +match[10];
			const tzMinute = +(match[11] || 0);
			delta = (tzHour * 60 + tzMinute) * 6e4;
			if (match[9] === "-") delta = -delta;
		}
		const date = new Date(Date.UTC(year, month, day, hour, minute, second, fraction));
		if (delta) date.setTime(date.getTime() - delta);
		return date;
	}
	function representYamlTimestamp(object) {
		return object.toISOString();
	}
	module.exports = new Type("tag:yaml.org,2002:timestamp", {
		kind: "scalar",
		resolve: resolveYamlTimestamp,
		construct: constructYamlTimestamp,
		instanceOf: Date,
		represent: representYamlTimestamp
	});
}));
var require_merge = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var Type = require_type();
	function resolveYamlMerge(data) {
		return data === "<<" || data === null;
	}
	module.exports = new Type("tag:yaml.org,2002:merge", {
		kind: "scalar",
		resolve: resolveYamlMerge
	});
}));
var require_binary = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var Type = require_type();
	var BASE64_MAP = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=\n\r";
	function resolveYamlBinary(data) {
		if (data === null) return false;
		let bitlen = 0;
		const max = data.length;
		const map = BASE64_MAP;
		for (let idx = 0; idx < max; idx++) {
			const code = map.indexOf(data.charAt(idx));
			if (code > 64) continue;
			if (code < 0) return false;
			bitlen += 6;
		}
		return bitlen % 8 === 0;
	}
	function constructYamlBinary(data) {
		const input = data.replace(/[\r\n=]/g, "");
		const max = input.length;
		const map = BASE64_MAP;
		let bits = 0;
		const result = [];
		for (let idx = 0; idx < max; idx++) {
			if (idx % 4 === 0 && idx) {
				result.push(bits >> 16 & 255);
				result.push(bits >> 8 & 255);
				result.push(bits & 255);
			}
			bits = bits << 6 | map.indexOf(input.charAt(idx));
		}
		const tailbits = max % 4 * 6;
		if (tailbits === 0) {
			result.push(bits >> 16 & 255);
			result.push(bits >> 8 & 255);
			result.push(bits & 255);
		} else if (tailbits === 18) {
			result.push(bits >> 10 & 255);
			result.push(bits >> 2 & 255);
		} else if (tailbits === 12) result.push(bits >> 4 & 255);
		return new Uint8Array(result);
	}
	function representYamlBinary(object) {
		let result = "";
		let bits = 0;
		const max = object.length;
		const map = BASE64_MAP;
		for (let idx = 0; idx < max; idx++) {
			if (idx % 3 === 0 && idx) {
				result += map[bits >> 18 & 63];
				result += map[bits >> 12 & 63];
				result += map[bits >> 6 & 63];
				result += map[bits & 63];
			}
			bits = (bits << 8) + object[idx];
		}
		const tail = max % 3;
		if (tail === 0) {
			result += map[bits >> 18 & 63];
			result += map[bits >> 12 & 63];
			result += map[bits >> 6 & 63];
			result += map[bits & 63];
		} else if (tail === 2) {
			result += map[bits >> 10 & 63];
			result += map[bits >> 4 & 63];
			result += map[bits << 2 & 63];
			result += map[64];
		} else if (tail === 1) {
			result += map[bits >> 2 & 63];
			result += map[bits << 4 & 63];
			result += map[64];
			result += map[64];
		}
		return result;
	}
	function isBinary(obj) {
		return Object.prototype.toString.call(obj) === "[object Uint8Array]";
	}
	module.exports = new Type("tag:yaml.org,2002:binary", {
		kind: "scalar",
		resolve: resolveYamlBinary,
		construct: constructYamlBinary,
		predicate: isBinary,
		represent: representYamlBinary
	});
}));
var require_omap = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var Type = require_type();
	var _hasOwnProperty = Object.prototype.hasOwnProperty;
	var _toString = Object.prototype.toString;
	function resolveYamlOmap(data) {
		if (data === null) return true;
		const objectKeys = [];
		const object = data;
		for (let index = 0, length = object.length; index < length; index += 1) {
			const pair = object[index];
			let pairHasKey = false;
			if (_toString.call(pair) !== "[object Object]") return false;
			let pairKey;
			for (pairKey in pair) if (_hasOwnProperty.call(pair, pairKey)) if (!pairHasKey) pairHasKey = true;
			else return false;
			if (!pairHasKey) return false;
			if (objectKeys.indexOf(pairKey) === -1) objectKeys.push(pairKey);
			else return false;
		}
		return true;
	}
	function constructYamlOmap(data) {
		return data !== null ? data : [];
	}
	module.exports = new Type("tag:yaml.org,2002:omap", {
		kind: "sequence",
		resolve: resolveYamlOmap,
		construct: constructYamlOmap
	});
}));
var require_pairs = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var Type = require_type();
	var _toString = Object.prototype.toString;
	function resolveYamlPairs(data) {
		if (data === null) return true;
		const object = data;
		const result = new Array(object.length);
		for (let index = 0, length = object.length; index < length; index += 1) {
			const pair = object[index];
			if (_toString.call(pair) !== "[object Object]") return false;
			const keys = Object.keys(pair);
			if (keys.length !== 1) return false;
			result[index] = [keys[0], pair[keys[0]]];
		}
		return true;
	}
	function constructYamlPairs(data) {
		if (data === null) return [];
		const object = data;
		const result = new Array(object.length);
		for (let index = 0, length = object.length; index < length; index += 1) {
			const pair = object[index];
			const keys = Object.keys(pair);
			result[index] = [keys[0], pair[keys[0]]];
		}
		return result;
	}
	module.exports = new Type("tag:yaml.org,2002:pairs", {
		kind: "sequence",
		resolve: resolveYamlPairs,
		construct: constructYamlPairs
	});
}));
var require_set = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var Type = require_type();
	var _hasOwnProperty = Object.prototype.hasOwnProperty;
	function resolveYamlSet(data) {
		if (data === null) return true;
		const object = data;
		for (const key in object) if (_hasOwnProperty.call(object, key)) {
			if (object[key] !== null) return false;
		}
		return true;
	}
	function constructYamlSet(data) {
		return data !== null ? data : {};
	}
	module.exports = new Type("tag:yaml.org,2002:set", {
		kind: "mapping",
		resolve: resolveYamlSet,
		construct: constructYamlSet
	});
}));
var require_default = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = require_core().extend({
		implicit: [require_timestamp(), require_merge()],
		explicit: [
			require_binary(),
			require_omap(),
			require_pairs(),
			require_set()
		]
	});
}));
var require_loader = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var common = require_common();
	var YAMLException = require_exception();
	var makeSnippet = require_snippet();
	var DEFAULT_SCHEMA = require_default();
	var _hasOwnProperty = Object.prototype.hasOwnProperty;
	var CONTEXT_FLOW_IN = 1;
	var CONTEXT_FLOW_OUT = 2;
	var CONTEXT_BLOCK_IN = 3;
	var CONTEXT_BLOCK_OUT = 4;
	var CHOMPING_CLIP = 1;
	var CHOMPING_STRIP = 2;
	var CHOMPING_KEEP = 3;
	var PATTERN_NON_PRINTABLE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x84\x86-\x9F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/;
	var PATTERN_NON_ASCII_LINE_BREAKS = /[\x85\u2028\u2029]/;
	var PATTERN_FLOW_INDICATORS = /[,\[\]{}]/;
	var PATTERN_TAG_HANDLE = /^(?:!|!!|![0-9A-Za-z-]+!)$/;
	var PATTERN_TAG_URI = /^(?:!|[^,\[\]{}])(?:%[0-9a-f]{2}|[0-9a-z\-#;/?:@&=+$,_.!~*'()\[\]])*$/i;
	function _class(obj) {
		return Object.prototype.toString.call(obj);
	}
	function isEol(c) {
		return c === 10 || c === 13;
	}
	function isWhiteSpace(c) {
		return c === 9 || c === 32;
	}
	function isWsOrEol(c) {
		return c === 9 || c === 32 || c === 10 || c === 13;
	}
	function isFlowIndicator(c) {
		return c === 44 || c === 91 || c === 93 || c === 123 || c === 125;
	}
	function fromHexCode(c) {
		if (c >= 48 && c <= 57) return c - 48;
		const lc = c | 32;
		if (lc >= 97 && lc <= 102) return lc - 97 + 10;
		return -1;
	}
	function escapedHexLen(c) {
		if (c === 120) return 2;
		if (c === 117) return 4;
		if (c === 85) return 8;
		return 0;
	}
	function fromDecimalCode(c) {
		if (c >= 48 && c <= 57) return c - 48;
		return -1;
	}
	function simpleEscapeSequence(c) {
		switch (c) {
			case 48: return "\0";
			case 97: return "\x07";
			case 98: return "\b";
			case 116: return "	";
			case 9: return "	";
			case 110: return "\n";
			case 118: return "\v";
			case 102: return "\f";
			case 114: return "\r";
			case 101: return "\x1B";
			case 32: return " ";
			case 34: return "\"";
			case 47: return "/";
			case 92: return "\\";
			case 78: return "";
			case 95: return "\xA0";
			case 76: return "\u2028";
			case 80: return "\u2029";
			default: return "";
		}
	}
	function charFromCodepoint(c) {
		if (c <= 65535) return String.fromCharCode(c);
		return String.fromCharCode((c - 65536 >> 10) + 55296, (c - 65536 & 1023) + 56320);
	}
	function setProperty(object, key, value) {
		if (key === "__proto__") Object.defineProperty(object, key, {
			configurable: true,
			enumerable: true,
			writable: true,
			value
		});
		else object[key] = value;
	}
	var simpleEscapeCheck = new Array(256);
	var simpleEscapeMap = new Array(256);
	for (let i = 0; i < 256; i++) {
		simpleEscapeCheck[i] = simpleEscapeSequence(i) ? 1 : 0;
		simpleEscapeMap[i] = simpleEscapeSequence(i);
	}
	function State(input, options) {
		this.input = input;
		this.filename = options["filename"] || null;
		this.schema = options["schema"] || DEFAULT_SCHEMA;
		this.onWarning = options["onWarning"] || null;
		this.legacy = options["legacy"] || false;
		this.json = options["json"] || false;
		this.listener = options["listener"] || null;
		this.maxDepth = typeof options["maxDepth"] === "number" ? options["maxDepth"] : 100;
		this.maxMergeSeqLength = typeof options["maxMergeSeqLength"] === "number" ? options["maxMergeSeqLength"] : 20;
		this.implicitTypes = this.schema.compiledImplicit;
		this.typeMap = this.schema.compiledTypeMap;
		this.length = input.length;
		this.position = 0;
		this.line = 0;
		this.lineStart = 0;
		this.lineIndent = 0;
		this.depth = 0;
		this.firstTabInLine = -1;
		this.documents = [];
		this.anchorMapTransactions = [];
	}
	function generateError(state, message) {
		const mark = {
			name: state.filename,
			buffer: state.input.slice(0, -1),
			position: state.position,
			line: state.line,
			column: state.position - state.lineStart
		};
		mark.snippet = makeSnippet(mark);
		return new YAMLException(message, mark);
	}
	function throwError(state, message) {
		throw generateError(state, message);
	}
	function throwWarning(state, message) {
		if (state.onWarning) state.onWarning.call(null, generateError(state, message));
	}
	function storeAnchor(state, name, value) {
		const transactions = state.anchorMapTransactions;
		if (transactions.length !== 0) {
			const transaction = transactions[transactions.length - 1];
			if (!_hasOwnProperty.call(transaction, name)) transaction[name] = {
				existed: _hasOwnProperty.call(state.anchorMap, name),
				value: state.anchorMap[name]
			};
		}
		state.anchorMap[name] = value;
	}
	function beginAnchorTransaction(state) {
		state.anchorMapTransactions.push(Object.create(null));
	}
	function commitAnchorTransaction(state) {
		const transaction = state.anchorMapTransactions.pop();
		const transactions = state.anchorMapTransactions;
		if (transactions.length === 0) return;
		const parent = transactions[transactions.length - 1];
		const names = Object.keys(transaction);
		for (let index = 0, length = names.length; index < length; index += 1) {
			const name = names[index];
			if (!_hasOwnProperty.call(parent, name)) parent[name] = transaction[name];
		}
	}
	function rollbackAnchorTransaction(state) {
		const transaction = state.anchorMapTransactions.pop();
		const names = Object.keys(transaction);
		for (let index = names.length - 1; index >= 0; index -= 1) {
			const entry = transaction[names[index]];
			if (entry.existed) state.anchorMap[names[index]] = entry.value;
			else delete state.anchorMap[names[index]];
		}
	}
	function snapshotState(state) {
		return {
			position: state.position,
			line: state.line,
			lineStart: state.lineStart,
			lineIndent: state.lineIndent,
			firstTabInLine: state.firstTabInLine,
			tag: state.tag,
			anchor: state.anchor,
			kind: state.kind,
			result: state.result
		};
	}
	function restoreState(state, snapshot) {
		state.position = snapshot.position;
		state.line = snapshot.line;
		state.lineStart = snapshot.lineStart;
		state.lineIndent = snapshot.lineIndent;
		state.firstTabInLine = snapshot.firstTabInLine;
		state.tag = snapshot.tag;
		state.anchor = snapshot.anchor;
		state.kind = snapshot.kind;
		state.result = snapshot.result;
	}
	var directiveHandlers = {
		YAML: function handleYamlDirective(state, name, args) {
			if (state.version !== null) throwError(state, "duplication of %YAML directive");
			if (args.length !== 1) throwError(state, "YAML directive accepts exactly one argument");
			const match = /^([0-9]+)\.([0-9]+)$/.exec(args[0]);
			if (match === null) throwError(state, "ill-formed argument of the YAML directive");
			const major = parseInt(match[1], 10);
			const minor = parseInt(match[2], 10);
			if (major !== 1) throwError(state, "unacceptable YAML version of the document");
			state.version = args[0];
			state.checkLineBreaks = minor < 2;
			if (minor !== 1 && minor !== 2) throwWarning(state, "unsupported YAML version of the document");
		},
		TAG: function handleTagDirective(state, name, args) {
			let prefix;
			if (args.length !== 2) throwError(state, "TAG directive accepts exactly two arguments");
			const handle = args[0];
			prefix = args[1];
			if (!PATTERN_TAG_HANDLE.test(handle)) throwError(state, "ill-formed tag handle (first argument) of the TAG directive");
			if (_hasOwnProperty.call(state.tagMap, handle)) throwError(state, "there is a previously declared suffix for \"" + handle + "\" tag handle");
			if (!PATTERN_TAG_URI.test(prefix)) throwError(state, "ill-formed tag prefix (second argument) of the TAG directive");
			try {
				prefix = decodeURIComponent(prefix);
			} catch (err) {
				throwError(state, "tag prefix is malformed: " + prefix);
			}
			state.tagMap[handle] = prefix;
		}
	};
	function captureSegment(state, start, end, checkJson) {
		if (start < end) {
			const _result = state.input.slice(start, end);
			if (checkJson) for (let _position = 0, _length = _result.length; _position < _length; _position += 1) {
				const _character = _result.charCodeAt(_position);
				if (!(_character === 9 || _character >= 32 && _character <= 1114111)) throwError(state, "expected valid JSON character");
			}
			else if (PATTERN_NON_PRINTABLE.test(_result)) throwError(state, "the stream contains non-printable characters");
			state.result += _result;
		}
	}
	function mergeMappings(state, destination, source, overridableKeys) {
		if (!common.isObject(source)) throwError(state, "cannot merge mappings; the provided source object is unacceptable");
		const sourceKeys = Object.keys(source);
		for (let index = 0, quantity = sourceKeys.length; index < quantity; index += 1) {
			const key = sourceKeys[index];
			if (!_hasOwnProperty.call(destination, key)) {
				setProperty(destination, key, source[key]);
				overridableKeys[key] = true;
			}
		}
	}
	function storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, startLine, startLineStart, startPos) {
		if (Array.isArray(keyNode)) {
			keyNode = Array.prototype.slice.call(keyNode);
			for (let index = 0, quantity = keyNode.length; index < quantity; index += 1) {
				if (Array.isArray(keyNode[index])) throwError(state, "nested arrays are not supported inside keys");
				if (typeof keyNode === "object" && _class(keyNode[index]) === "[object Object]") keyNode[index] = "[object Object]";
			}
		}
		if (typeof keyNode === "object" && _class(keyNode) === "[object Object]") keyNode = "[object Object]";
		keyNode = String(keyNode);
		if (_result === null) _result = {};
		if (keyTag === "tag:yaml.org,2002:merge") if (Array.isArray(valueNode)) {
			if (valueNode.length > state.maxMergeSeqLength) throwError(state, "merge sequence length exceeded maxMergeSeqLength (" + state.maxMergeSeqLength + ")");
			const seen = /* @__PURE__ */ new Set();
			for (let index = 0, quantity = valueNode.length; index < quantity; index += 1) {
				const src = valueNode[index];
				if (seen.has(src)) continue;
				seen.add(src);
				mergeMappings(state, _result, src, overridableKeys);
			}
		} else mergeMappings(state, _result, valueNode, overridableKeys);
		else {
			if (!state.json && !_hasOwnProperty.call(overridableKeys, keyNode) && _hasOwnProperty.call(_result, keyNode)) {
				state.line = startLine || state.line;
				state.lineStart = startLineStart || state.lineStart;
				state.position = startPos || state.position;
				throwError(state, "duplicated mapping key");
			}
			setProperty(_result, keyNode, valueNode);
			delete overridableKeys[keyNode];
		}
		return _result;
	}
	function readLineBreak(state) {
		const ch = state.input.charCodeAt(state.position);
		if (ch === 10) state.position++;
		else if (ch === 13) {
			state.position++;
			if (state.input.charCodeAt(state.position) === 10) state.position++;
		} else throwError(state, "a line break is expected");
		state.line += 1;
		state.lineStart = state.position;
		state.firstTabInLine = -1;
	}
	function skipSeparationSpace(state, allowComments, checkIndent) {
		let lineBreaks = 0;
		let ch = state.input.charCodeAt(state.position);
		while (ch !== 0) {
			while (isWhiteSpace(ch)) {
				if (ch === 9 && state.firstTabInLine === -1) state.firstTabInLine = state.position;
				ch = state.input.charCodeAt(++state.position);
			}
			if (allowComments && ch === 35) do
				ch = state.input.charCodeAt(++state.position);
			while (ch !== 10 && ch !== 13 && ch !== 0);
			if (isEol(ch)) {
				readLineBreak(state);
				ch = state.input.charCodeAt(state.position);
				lineBreaks++;
				state.lineIndent = 0;
				while (ch === 32) {
					state.lineIndent++;
					ch = state.input.charCodeAt(++state.position);
				}
			} else break;
		}
		if (checkIndent !== -1 && lineBreaks !== 0 && state.lineIndent < checkIndent) throwWarning(state, "deficient indentation");
		return lineBreaks;
	}
	function testDocumentSeparator(state) {
		let _position = state.position;
		let ch = state.input.charCodeAt(_position);
		if ((ch === 45 || ch === 46) && ch === state.input.charCodeAt(_position + 1) && ch === state.input.charCodeAt(_position + 2)) {
			_position += 3;
			ch = state.input.charCodeAt(_position);
			if (ch === 0 || isWsOrEol(ch)) return true;
		}
		return false;
	}
	function writeFoldedLines(state, count) {
		if (count === 1) state.result += " ";
		else if (count > 1) state.result += common.repeat("\n", count - 1);
	}
	function readPlainScalar(state, nodeIndent, withinFlowCollection) {
		let captureStart;
		let captureEnd;
		let hasPendingContent;
		let _line;
		let _lineStart;
		let _lineIndent;
		const _kind = state.kind;
		const _result = state.result;
		let ch = state.input.charCodeAt(state.position);
		if (isWsOrEol(ch) || isFlowIndicator(ch) || ch === 35 || ch === 38 || ch === 42 || ch === 33 || ch === 124 || ch === 62 || ch === 39 || ch === 34 || ch === 37 || ch === 64 || ch === 96) return false;
		if (ch === 63 || ch === 45) {
			const following = state.input.charCodeAt(state.position + 1);
			if (isWsOrEol(following) || withinFlowCollection && isFlowIndicator(following)) return false;
		}
		state.kind = "scalar";
		state.result = "";
		captureStart = captureEnd = state.position;
		hasPendingContent = false;
		while (ch !== 0) {
			if (ch === 58) {
				const following = state.input.charCodeAt(state.position + 1);
				if (isWsOrEol(following) || withinFlowCollection && isFlowIndicator(following)) break;
			} else if (ch === 35) {
				if (isWsOrEol(state.input.charCodeAt(state.position - 1))) break;
			} else if (state.position === state.lineStart && testDocumentSeparator(state) || withinFlowCollection && isFlowIndicator(ch)) break;
			else if (isEol(ch)) {
				_line = state.line;
				_lineStart = state.lineStart;
				_lineIndent = state.lineIndent;
				skipSeparationSpace(state, false, -1);
				if (state.lineIndent >= nodeIndent) {
					hasPendingContent = true;
					ch = state.input.charCodeAt(state.position);
					continue;
				} else {
					state.position = captureEnd;
					state.line = _line;
					state.lineStart = _lineStart;
					state.lineIndent = _lineIndent;
					break;
				}
			}
			if (hasPendingContent) {
				captureSegment(state, captureStart, captureEnd, false);
				writeFoldedLines(state, state.line - _line);
				captureStart = captureEnd = state.position;
				hasPendingContent = false;
			}
			if (!isWhiteSpace(ch)) captureEnd = state.position + 1;
			ch = state.input.charCodeAt(++state.position);
		}
		captureSegment(state, captureStart, captureEnd, false);
		if (state.result) return true;
		state.kind = _kind;
		state.result = _result;
		return false;
	}
	function readSingleQuotedScalar(state, nodeIndent) {
		let captureStart;
		let captureEnd;
		let ch = state.input.charCodeAt(state.position);
		if (ch !== 39) return false;
		state.kind = "scalar";
		state.result = "";
		state.position++;
		captureStart = captureEnd = state.position;
		while ((ch = state.input.charCodeAt(state.position)) !== 0) if (ch === 39) {
			captureSegment(state, captureStart, state.position, true);
			ch = state.input.charCodeAt(++state.position);
			if (ch === 39) {
				captureStart = state.position;
				state.position++;
				captureEnd = state.position;
			} else return true;
		} else if (isEol(ch)) {
			captureSegment(state, captureStart, captureEnd, true);
			writeFoldedLines(state, skipSeparationSpace(state, false, nodeIndent));
			captureStart = captureEnd = state.position;
		} else if (state.position === state.lineStart && testDocumentSeparator(state)) throwError(state, "unexpected end of the document within a single quoted scalar");
		else {
			state.position++;
			if (!isWhiteSpace(ch)) captureEnd = state.position;
		}
		throwError(state, "unexpected end of the stream within a single quoted scalar");
	}
	function readDoubleQuotedScalar(state, nodeIndent) {
		let captureStart;
		let captureEnd;
		let tmp;
		let ch = state.input.charCodeAt(state.position);
		if (ch !== 34) return false;
		state.kind = "scalar";
		state.result = "";
		state.position++;
		captureStart = captureEnd = state.position;
		while ((ch = state.input.charCodeAt(state.position)) !== 0) if (ch === 34) {
			captureSegment(state, captureStart, state.position, true);
			state.position++;
			return true;
		} else if (ch === 92) {
			captureSegment(state, captureStart, state.position, true);
			ch = state.input.charCodeAt(++state.position);
			if (isEol(ch)) skipSeparationSpace(state, false, nodeIndent);
			else if (ch < 256 && simpleEscapeCheck[ch]) {
				state.result += simpleEscapeMap[ch];
				state.position++;
			} else if ((tmp = escapedHexLen(ch)) > 0) {
				let hexLength = tmp;
				let hexResult = 0;
				for (; hexLength > 0; hexLength--) {
					ch = state.input.charCodeAt(++state.position);
					if ((tmp = fromHexCode(ch)) >= 0) hexResult = (hexResult << 4) + tmp;
					else throwError(state, "expected hexadecimal character");
				}
				state.result += charFromCodepoint(hexResult);
				state.position++;
			} else throwError(state, "unknown escape sequence");
			captureStart = captureEnd = state.position;
		} else if (isEol(ch)) {
			captureSegment(state, captureStart, captureEnd, true);
			writeFoldedLines(state, skipSeparationSpace(state, false, nodeIndent));
			captureStart = captureEnd = state.position;
		} else if (state.position === state.lineStart && testDocumentSeparator(state)) throwError(state, "unexpected end of the document within a double quoted scalar");
		else {
			state.position++;
			if (!isWhiteSpace(ch)) captureEnd = state.position;
		}
		throwError(state, "unexpected end of the stream within a double quoted scalar");
	}
	function readFlowCollection(state, nodeIndent) {
		let readNext = true;
		let _line;
		let _lineStart;
		let _pos;
		const _tag = state.tag;
		let _result;
		const _anchor = state.anchor;
		let terminator;
		let isPair;
		let isExplicitPair;
		let isMapping;
		const overridableKeys = Object.create(null);
		let keyNode;
		let keyTag;
		let valueNode;
		let ch = state.input.charCodeAt(state.position);
		if (ch === 91) {
			terminator = 93;
			isMapping = false;
			_result = [];
		} else if (ch === 123) {
			terminator = 125;
			isMapping = true;
			_result = {};
		} else return false;
		if (state.anchor !== null) storeAnchor(state, state.anchor, _result);
		ch = state.input.charCodeAt(++state.position);
		while (ch !== 0) {
			skipSeparationSpace(state, true, nodeIndent);
			ch = state.input.charCodeAt(state.position);
			if (ch === terminator) {
				state.position++;
				state.tag = _tag;
				state.anchor = _anchor;
				state.kind = isMapping ? "mapping" : "sequence";
				state.result = _result;
				return true;
			} else if (!readNext) throwError(state, "missed comma between flow collection entries");
			else if (ch === 44) throwError(state, "expected the node content, but found ','");
			keyTag = keyNode = valueNode = null;
			isPair = isExplicitPair = false;
			if (ch === 63) {
				if (isWsOrEol(state.input.charCodeAt(state.position + 1))) {
					isPair = isExplicitPair = true;
					state.position++;
					skipSeparationSpace(state, true, nodeIndent);
				}
			}
			_line = state.line;
			_lineStart = state.lineStart;
			_pos = state.position;
			composeNode(state, nodeIndent, CONTEXT_FLOW_IN, false, true);
			keyTag = state.tag;
			keyNode = state.result;
			skipSeparationSpace(state, true, nodeIndent);
			ch = state.input.charCodeAt(state.position);
			if ((isExplicitPair || state.line === _line) && ch === 58) {
				isPair = true;
				ch = state.input.charCodeAt(++state.position);
				skipSeparationSpace(state, true, nodeIndent);
				composeNode(state, nodeIndent, CONTEXT_FLOW_IN, false, true);
				valueNode = state.result;
			}
			if (isMapping) storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, _line, _lineStart, _pos);
			else if (isPair) _result.push(storeMappingPair(state, null, overridableKeys, keyTag, keyNode, valueNode, _line, _lineStart, _pos));
			else _result.push(keyNode);
			skipSeparationSpace(state, true, nodeIndent);
			ch = state.input.charCodeAt(state.position);
			if (ch === 44) {
				readNext = true;
				ch = state.input.charCodeAt(++state.position);
			} else readNext = false;
		}
		throwError(state, "unexpected end of the stream within a flow collection");
	}
	function readBlockScalar(state, nodeIndent) {
		let folding;
		let chomping = CHOMPING_CLIP;
		let didReadContent = false;
		let detectedIndent = false;
		let textIndent = nodeIndent;
		let emptyLines = 0;
		let atMoreIndented = false;
		let tmp;
		let ch = state.input.charCodeAt(state.position);
		if (ch === 124) folding = false;
		else if (ch === 62) folding = true;
		else return false;
		state.kind = "scalar";
		state.result = "";
		while (ch !== 0) {
			ch = state.input.charCodeAt(++state.position);
			if (ch === 43 || ch === 45) if (CHOMPING_CLIP === chomping) chomping = ch === 43 ? CHOMPING_KEEP : CHOMPING_STRIP;
			else throwError(state, "repeat of a chomping mode identifier");
			else if ((tmp = fromDecimalCode(ch)) >= 0) if (tmp === 0) throwError(state, "bad explicit indentation width of a block scalar; it cannot be less than one");
			else if (!detectedIndent) {
				textIndent = nodeIndent + tmp - 1;
				detectedIndent = true;
			} else throwError(state, "repeat of an indentation width identifier");
			else break;
		}
		if (isWhiteSpace(ch)) {
			do
				ch = state.input.charCodeAt(++state.position);
			while (isWhiteSpace(ch));
			if (ch === 35) do
				ch = state.input.charCodeAt(++state.position);
			while (!isEol(ch) && ch !== 0);
		}
		while (ch !== 0) {
			readLineBreak(state);
			state.lineIndent = 0;
			ch = state.input.charCodeAt(state.position);
			while ((!detectedIndent || state.lineIndent < textIndent) && ch === 32) {
				state.lineIndent++;
				ch = state.input.charCodeAt(++state.position);
			}
			if (!detectedIndent && state.lineIndent > textIndent) textIndent = state.lineIndent;
			if (isEol(ch)) {
				emptyLines++;
				continue;
			}
			if (!detectedIndent && textIndent === 0) throwError(state, "missing indentation for block scalar");
			if (state.lineIndent < textIndent) {
				if (chomping === CHOMPING_KEEP) state.result += common.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
				else if (chomping === CHOMPING_CLIP) {
					if (didReadContent) state.result += "\n";
				}
				break;
			}
			if (folding) if (isWhiteSpace(ch)) {
				atMoreIndented = true;
				state.result += common.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
			} else if (atMoreIndented) {
				atMoreIndented = false;
				state.result += common.repeat("\n", emptyLines + 1);
			} else if (emptyLines === 0) {
				if (didReadContent) state.result += " ";
			} else state.result += common.repeat("\n", emptyLines);
			else state.result += common.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
			didReadContent = true;
			detectedIndent = true;
			emptyLines = 0;
			const captureStart = state.position;
			while (!isEol(ch) && ch !== 0) ch = state.input.charCodeAt(++state.position);
			captureSegment(state, captureStart, state.position, false);
		}
		return true;
	}
	function readBlockSequence(state, nodeIndent) {
		const _tag = state.tag;
		const _anchor = state.anchor;
		const _result = [];
		let detected = false;
		if (state.firstTabInLine !== -1) return false;
		if (state.anchor !== null) storeAnchor(state, state.anchor, _result);
		let ch = state.input.charCodeAt(state.position);
		while (ch !== 0) {
			if (state.firstTabInLine !== -1) {
				state.position = state.firstTabInLine;
				throwError(state, "tab characters must not be used in indentation");
			}
			if (ch !== 45) break;
			if (!isWsOrEol(state.input.charCodeAt(state.position + 1))) break;
			detected = true;
			state.position++;
			if (skipSeparationSpace(state, true, -1)) {
				if (state.lineIndent <= nodeIndent) {
					_result.push(null);
					ch = state.input.charCodeAt(state.position);
					continue;
				}
			}
			const _line = state.line;
			composeNode(state, nodeIndent, CONTEXT_BLOCK_IN, false, true);
			_result.push(state.result);
			skipSeparationSpace(state, true, -1);
			ch = state.input.charCodeAt(state.position);
			if ((state.line === _line || state.lineIndent > nodeIndent) && ch !== 0) throwError(state, "bad indentation of a sequence entry");
			else if (state.lineIndent < nodeIndent) break;
		}
		if (detected) {
			state.tag = _tag;
			state.anchor = _anchor;
			state.kind = "sequence";
			state.result = _result;
			return true;
		}
		return false;
	}
	function readBlockMapping(state, nodeIndent, flowIndent) {
		let allowCompact;
		let _keyLine;
		let _keyLineStart;
		let _keyPos;
		const _tag = state.tag;
		const _anchor = state.anchor;
		const _result = {};
		const overridableKeys = Object.create(null);
		let keyTag = null;
		let keyNode = null;
		let valueNode = null;
		let atExplicitKey = false;
		let detected = false;
		if (state.firstTabInLine !== -1) return false;
		if (state.anchor !== null) storeAnchor(state, state.anchor, _result);
		let ch = state.input.charCodeAt(state.position);
		while (ch !== 0) {
			if (!atExplicitKey && state.firstTabInLine !== -1) {
				state.position = state.firstTabInLine;
				throwError(state, "tab characters must not be used in indentation");
			}
			const following = state.input.charCodeAt(state.position + 1);
			const _line = state.line;
			if ((ch === 63 || ch === 58) && isWsOrEol(following)) {
				if (ch === 63) {
					if (atExplicitKey) {
						storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
						keyTag = keyNode = valueNode = null;
					}
					detected = true;
					atExplicitKey = true;
					allowCompact = true;
				} else if (atExplicitKey) {
					atExplicitKey = false;
					allowCompact = true;
				} else throwError(state, "incomplete explicit mapping pair; a key node is missed; or followed by a non-tabulated empty line");
				state.position += 1;
				ch = following;
			} else {
				_keyLine = state.line;
				_keyLineStart = state.lineStart;
				_keyPos = state.position;
				if (!composeNode(state, flowIndent, CONTEXT_FLOW_OUT, false, true)) break;
				if (state.line === _line) {
					ch = state.input.charCodeAt(state.position);
					while (isWhiteSpace(ch)) ch = state.input.charCodeAt(++state.position);
					if (ch === 58) {
						ch = state.input.charCodeAt(++state.position);
						if (!isWsOrEol(ch)) throwError(state, "a whitespace character is expected after the key-value separator within a block mapping");
						if (atExplicitKey) {
							storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
							keyTag = keyNode = valueNode = null;
						}
						detected = true;
						atExplicitKey = false;
						allowCompact = false;
						keyTag = state.tag;
						keyNode = state.result;
					} else if (detected) throwError(state, "can not read an implicit mapping pair; a colon is missed");
					else {
						state.tag = _tag;
						state.anchor = _anchor;
						return true;
					}
				} else if (detected) throwError(state, "can not read a block mapping entry; a multiline key may not be an implicit key");
				else {
					state.tag = _tag;
					state.anchor = _anchor;
					return true;
				}
			}
			if (state.line === _line || state.lineIndent > nodeIndent) {
				if (atExplicitKey) {
					_keyLine = state.line;
					_keyLineStart = state.lineStart;
					_keyPos = state.position;
				}
				if (composeNode(state, nodeIndent, CONTEXT_BLOCK_OUT, true, allowCompact)) if (atExplicitKey) keyNode = state.result;
				else valueNode = state.result;
				if (!atExplicitKey) {
					storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, _keyLine, _keyLineStart, _keyPos);
					keyTag = keyNode = valueNode = null;
				}
				skipSeparationSpace(state, true, -1);
				ch = state.input.charCodeAt(state.position);
			}
			if ((state.line === _line || state.lineIndent > nodeIndent) && ch !== 0) throwError(state, "bad indentation of a mapping entry");
			else if (state.lineIndent < nodeIndent) break;
		}
		if (atExplicitKey) storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
		if (detected) {
			state.tag = _tag;
			state.anchor = _anchor;
			state.kind = "mapping";
			state.result = _result;
		}
		return detected;
	}
	function readTagProperty(state) {
		let isVerbatim = false;
		let isNamed = false;
		let tagHandle;
		let tagName;
		let ch = state.input.charCodeAt(state.position);
		if (ch !== 33) return false;
		if (state.tag !== null) throwError(state, "duplication of a tag property");
		ch = state.input.charCodeAt(++state.position);
		if (ch === 60) {
			isVerbatim = true;
			ch = state.input.charCodeAt(++state.position);
		} else if (ch === 33) {
			isNamed = true;
			tagHandle = "!!";
			ch = state.input.charCodeAt(++state.position);
		} else tagHandle = "!";
		let _position = state.position;
		if (isVerbatim) {
			do
				ch = state.input.charCodeAt(++state.position);
			while (ch !== 0 && ch !== 62);
			if (state.position < state.length) {
				tagName = state.input.slice(_position, state.position);
				ch = state.input.charCodeAt(++state.position);
			} else throwError(state, "unexpected end of the stream within a verbatim tag");
		} else {
			while (ch !== 0 && !isWsOrEol(ch)) {
				if (ch === 33) if (!isNamed) {
					tagHandle = state.input.slice(_position - 1, state.position + 1);
					if (!PATTERN_TAG_HANDLE.test(tagHandle)) throwError(state, "named tag handle cannot contain such characters");
					isNamed = true;
					_position = state.position + 1;
				} else throwError(state, "tag suffix cannot contain exclamation marks");
				ch = state.input.charCodeAt(++state.position);
			}
			tagName = state.input.slice(_position, state.position);
			if (PATTERN_FLOW_INDICATORS.test(tagName)) throwError(state, "tag suffix cannot contain flow indicator characters");
		}
		if (tagName && !PATTERN_TAG_URI.test(tagName)) throwError(state, "tag name cannot contain such characters: " + tagName);
		try {
			tagName = decodeURIComponent(tagName);
		} catch (err) {
			throwError(state, "tag name is malformed: " + tagName);
		}
		if (isVerbatim) state.tag = tagName;
		else if (_hasOwnProperty.call(state.tagMap, tagHandle)) state.tag = state.tagMap[tagHandle] + tagName;
		else if (tagHandle === "!") state.tag = "!" + tagName;
		else if (tagHandle === "!!") state.tag = "tag:yaml.org,2002:" + tagName;
		else throwError(state, "undeclared tag handle \"" + tagHandle + "\"");
		return true;
	}
	function readAnchorProperty(state) {
		let ch = state.input.charCodeAt(state.position);
		if (ch !== 38) return false;
		if (state.anchor !== null) throwError(state, "duplication of an anchor property");
		ch = state.input.charCodeAt(++state.position);
		const _position = state.position;
		while (ch !== 0 && !isWsOrEol(ch) && !isFlowIndicator(ch)) ch = state.input.charCodeAt(++state.position);
		if (state.position === _position) throwError(state, "name of an anchor node must contain at least one character");
		state.anchor = state.input.slice(_position, state.position);
		return true;
	}
	function readAlias(state) {
		let ch = state.input.charCodeAt(state.position);
		if (ch !== 42) return false;
		ch = state.input.charCodeAt(++state.position);
		const _position = state.position;
		while (ch !== 0 && !isWsOrEol(ch) && !isFlowIndicator(ch)) ch = state.input.charCodeAt(++state.position);
		if (state.position === _position) throwError(state, "name of an alias node must contain at least one character");
		const alias = state.input.slice(_position, state.position);
		if (!_hasOwnProperty.call(state.anchorMap, alias)) throwError(state, "unidentified alias \"" + alias + "\"");
		state.result = state.anchorMap[alias];
		skipSeparationSpace(state, true, -1);
		return true;
	}
	function tryReadBlockMappingFromProperty(state, propertyStart, nodeIndent, flowIndent) {
		const fallbackState = snapshotState(state);
		beginAnchorTransaction(state);
		restoreState(state, propertyStart);
		state.tag = null;
		state.anchor = null;
		state.kind = null;
		state.result = null;
		if (readBlockMapping(state, nodeIndent, flowIndent) && state.kind === "mapping") {
			commitAnchorTransaction(state);
			return true;
		}
		rollbackAnchorTransaction(state);
		restoreState(state, fallbackState);
		return false;
	}
	function composeNode(state, parentIndent, nodeContext, allowToSeek, allowCompact) {
		let allowBlockScalars;
		let allowBlockCollections;
		let indentStatus = 1;
		let atNewLine = false;
		let hasContent = false;
		let propertyStart = null;
		let type;
		let flowIndent;
		let blockIndent;
		if (state.depth >= state.maxDepth) throwError(state, "nesting exceeded maxDepth (" + state.maxDepth + ")");
		state.depth += 1;
		if (state.listener !== null) state.listener("open", state);
		state.tag = null;
		state.anchor = null;
		state.kind = null;
		state.result = null;
		const allowBlockStyles = allowBlockScalars = allowBlockCollections = CONTEXT_BLOCK_OUT === nodeContext || CONTEXT_BLOCK_IN === nodeContext;
		if (allowToSeek) {
			if (skipSeparationSpace(state, true, -1)) {
				atNewLine = true;
				if (state.lineIndent > parentIndent) indentStatus = 1;
				else if (state.lineIndent === parentIndent) indentStatus = 0;
				else if (state.lineIndent < parentIndent) indentStatus = -1;
			}
		}
		if (indentStatus === 1) while (true) {
			const ch = state.input.charCodeAt(state.position);
			const propertyState = snapshotState(state);
			if (atNewLine && (ch === 33 && state.tag !== null || ch === 38 && state.anchor !== null)) break;
			if (!readTagProperty(state) && !readAnchorProperty(state)) break;
			if (propertyStart === null) propertyStart = propertyState;
			if (skipSeparationSpace(state, true, -1)) {
				atNewLine = true;
				allowBlockCollections = allowBlockStyles;
				if (state.lineIndent > parentIndent) indentStatus = 1;
				else if (state.lineIndent === parentIndent) indentStatus = 0;
				else if (state.lineIndent < parentIndent) indentStatus = -1;
			} else allowBlockCollections = false;
		}
		if (allowBlockCollections) allowBlockCollections = atNewLine || allowCompact;
		if (indentStatus === 1 || CONTEXT_BLOCK_OUT === nodeContext) {
			if (CONTEXT_FLOW_IN === nodeContext || CONTEXT_FLOW_OUT === nodeContext) flowIndent = parentIndent;
			else flowIndent = parentIndent + 1;
			blockIndent = state.position - state.lineStart;
			if (indentStatus === 1) if (allowBlockCollections && (readBlockSequence(state, blockIndent) || readBlockMapping(state, blockIndent, flowIndent)) || readFlowCollection(state, flowIndent)) hasContent = true;
			else {
				const ch = state.input.charCodeAt(state.position);
				if (propertyStart !== null && allowBlockStyles && !allowBlockCollections && ch !== 124 && ch !== 62 && tryReadBlockMappingFromProperty(state, propertyStart, propertyStart.position - propertyStart.lineStart, flowIndent)) hasContent = true;
				else if (allowBlockScalars && readBlockScalar(state, flowIndent) || readSingleQuotedScalar(state, flowIndent) || readDoubleQuotedScalar(state, flowIndent)) hasContent = true;
				else if (readAlias(state)) {
					hasContent = true;
					if (state.tag !== null || state.anchor !== null) throwError(state, "alias node should not have any properties");
				} else if (readPlainScalar(state, flowIndent, CONTEXT_FLOW_IN === nodeContext)) {
					hasContent = true;
					if (state.tag === null) state.tag = "?";
				}
				if (state.anchor !== null) storeAnchor(state, state.anchor, state.result);
			}
			else if (indentStatus === 0) hasContent = allowBlockCollections && readBlockSequence(state, blockIndent);
		}
		if (state.tag === null) {
			if (state.anchor !== null) storeAnchor(state, state.anchor, state.result);
		} else if (state.tag === "?") {
			if (state.result !== null && state.kind !== "scalar") throwError(state, "unacceptable node kind for !<?> tag; it should be \"scalar\", not \"" + state.kind + "\"");
			for (let typeIndex = 0, typeQuantity = state.implicitTypes.length; typeIndex < typeQuantity; typeIndex += 1) {
				type = state.implicitTypes[typeIndex];
				if (type.resolve(state.result)) {
					state.result = type.construct(state.result);
					state.tag = type.tag;
					if (state.anchor !== null) storeAnchor(state, state.anchor, state.result);
					break;
				}
			}
		} else if (state.tag !== "!") {
			if (_hasOwnProperty.call(state.typeMap[state.kind || "fallback"], state.tag)) type = state.typeMap[state.kind || "fallback"][state.tag];
			else {
				type = null;
				const typeList = state.typeMap.multi[state.kind || "fallback"];
				for (let typeIndex = 0, typeQuantity = typeList.length; typeIndex < typeQuantity; typeIndex += 1) if (state.tag.slice(0, typeList[typeIndex].tag.length) === typeList[typeIndex].tag) {
					type = typeList[typeIndex];
					break;
				}
			}
			if (!type) throwError(state, "unknown tag !<" + state.tag + ">");
			if (state.result !== null && type.kind !== state.kind) throwError(state, "unacceptable node kind for !<" + state.tag + "> tag; it should be \"" + type.kind + "\", not \"" + state.kind + "\"");
			if (!type.resolve(state.result, state.tag)) throwError(state, "cannot resolve a node with !<" + state.tag + "> explicit tag");
			else {
				state.result = type.construct(state.result, state.tag);
				if (state.anchor !== null) storeAnchor(state, state.anchor, state.result);
			}
		}
		if (state.listener !== null) state.listener("close", state);
		state.depth -= 1;
		return state.tag !== null || state.anchor !== null || hasContent;
	}
	function readDocument(state) {
		const documentStart = state.position;
		let hasDirectives = false;
		let ch;
		state.version = null;
		state.checkLineBreaks = state.legacy;
		state.tagMap = Object.create(null);
		state.anchorMap = Object.create(null);
		while ((ch = state.input.charCodeAt(state.position)) !== 0) {
			skipSeparationSpace(state, true, -1);
			ch = state.input.charCodeAt(state.position);
			if (state.lineIndent > 0 || ch !== 37) break;
			hasDirectives = true;
			ch = state.input.charCodeAt(++state.position);
			let _position = state.position;
			while (ch !== 0 && !isWsOrEol(ch)) ch = state.input.charCodeAt(++state.position);
			const directiveName = state.input.slice(_position, state.position);
			const directiveArgs = [];
			if (directiveName.length < 1) throwError(state, "directive name must not be less than one character in length");
			while (ch !== 0) {
				while (isWhiteSpace(ch)) ch = state.input.charCodeAt(++state.position);
				if (ch === 35) {
					do
						ch = state.input.charCodeAt(++state.position);
					while (ch !== 0 && !isEol(ch));
					break;
				}
				if (isEol(ch)) break;
				_position = state.position;
				while (ch !== 0 && !isWsOrEol(ch)) ch = state.input.charCodeAt(++state.position);
				directiveArgs.push(state.input.slice(_position, state.position));
			}
			if (ch !== 0) readLineBreak(state);
			if (_hasOwnProperty.call(directiveHandlers, directiveName)) directiveHandlers[directiveName](state, directiveName, directiveArgs);
			else throwWarning(state, "unknown document directive \"" + directiveName + "\"");
		}
		skipSeparationSpace(state, true, -1);
		if (state.lineIndent === 0 && state.input.charCodeAt(state.position) === 45 && state.input.charCodeAt(state.position + 1) === 45 && state.input.charCodeAt(state.position + 2) === 45) {
			state.position += 3;
			skipSeparationSpace(state, true, -1);
		} else if (hasDirectives) throwError(state, "directives end mark is expected");
		composeNode(state, state.lineIndent - 1, CONTEXT_BLOCK_OUT, false, true);
		skipSeparationSpace(state, true, -1);
		if (state.checkLineBreaks && PATTERN_NON_ASCII_LINE_BREAKS.test(state.input.slice(documentStart, state.position))) throwWarning(state, "non-ASCII line breaks are interpreted as content");
		state.documents.push(state.result);
		if (state.position === state.lineStart && testDocumentSeparator(state)) {
			if (state.input.charCodeAt(state.position) === 46) {
				state.position += 3;
				skipSeparationSpace(state, true, -1);
			}
			return;
		}
		if (state.position < state.length - 1) throwError(state, "end of the stream or a document separator is expected");
	}
	function loadDocuments(input, options) {
		input = String(input);
		options = options || {};
		if (input.length !== 0) {
			if (input.charCodeAt(input.length - 1) !== 10 && input.charCodeAt(input.length - 1) !== 13) input += "\n";
			if (input.charCodeAt(0) === 65279) input = input.slice(1);
		}
		const state = new State(input, options);
		const nullpos = input.indexOf("\0");
		if (nullpos !== -1) {
			state.position = nullpos;
			throwError(state, "null byte is not allowed in input");
		}
		state.input += "\0";
		while (state.input.charCodeAt(state.position) === 32) {
			state.lineIndent += 1;
			state.position += 1;
		}
		while (state.position < state.length - 1) readDocument(state);
		return state.documents;
	}
	function loadAll(input, iterator, options) {
		if (iterator !== null && typeof iterator === "object" && typeof options === "undefined") {
			options = iterator;
			iterator = null;
		}
		const documents = loadDocuments(input, options);
		if (typeof iterator !== "function") return documents;
		for (let index = 0, length = documents.length; index < length; index += 1) iterator(documents[index]);
	}
	function load(input, options) {
		const documents = loadDocuments(input, options);
		if (documents.length === 0) return;
		else if (documents.length === 1) return documents[0];
		throw new YAMLException("expected a single document in the stream, but found more");
	}
	module.exports.loadAll = loadAll;
	module.exports.load = load;
}));
var require_dumper = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var common = require_common();
	var YAMLException = require_exception();
	var DEFAULT_SCHEMA = require_default();
	var _toString = Object.prototype.toString;
	var _hasOwnProperty = Object.prototype.hasOwnProperty;
	var CHAR_BOM = 65279;
	var CHAR_TAB = 9;
	var CHAR_LINE_FEED = 10;
	var CHAR_CARRIAGE_RETURN = 13;
	var CHAR_SPACE = 32;
	var CHAR_EXCLAMATION = 33;
	var CHAR_DOUBLE_QUOTE = 34;
	var CHAR_SHARP = 35;
	var CHAR_PERCENT = 37;
	var CHAR_AMPERSAND = 38;
	var CHAR_SINGLE_QUOTE = 39;
	var CHAR_ASTERISK = 42;
	var CHAR_COMMA = 44;
	var CHAR_MINUS = 45;
	var CHAR_COLON = 58;
	var CHAR_EQUALS = 61;
	var CHAR_GREATER_THAN = 62;
	var CHAR_QUESTION = 63;
	var CHAR_COMMERCIAL_AT = 64;
	var CHAR_LEFT_SQUARE_BRACKET = 91;
	var CHAR_RIGHT_SQUARE_BRACKET = 93;
	var CHAR_GRAVE_ACCENT = 96;
	var CHAR_LEFT_CURLY_BRACKET = 123;
	var CHAR_VERTICAL_LINE = 124;
	var CHAR_RIGHT_CURLY_BRACKET = 125;
	var ESCAPE_SEQUENCES = {};
	ESCAPE_SEQUENCES[0] = "\\0";
	ESCAPE_SEQUENCES[7] = "\\a";
	ESCAPE_SEQUENCES[8] = "\\b";
	ESCAPE_SEQUENCES[9] = "\\t";
	ESCAPE_SEQUENCES[10] = "\\n";
	ESCAPE_SEQUENCES[11] = "\\v";
	ESCAPE_SEQUENCES[12] = "\\f";
	ESCAPE_SEQUENCES[13] = "\\r";
	ESCAPE_SEQUENCES[27] = "\\e";
	ESCAPE_SEQUENCES[34] = "\\\"";
	ESCAPE_SEQUENCES[92] = "\\\\";
	ESCAPE_SEQUENCES[133] = "\\N";
	ESCAPE_SEQUENCES[160] = "\\_";
	ESCAPE_SEQUENCES[8232] = "\\L";
	ESCAPE_SEQUENCES[8233] = "\\P";
	var DEPRECATED_BOOLEANS_SYNTAX = [
		"y",
		"Y",
		"yes",
		"Yes",
		"YES",
		"on",
		"On",
		"ON",
		"n",
		"N",
		"no",
		"No",
		"NO",
		"off",
		"Off",
		"OFF"
	];
	var DEPRECATED_BASE60_SYNTAX = /^[-+]?[0-9_]+(?::[0-9_]+)+(?:\.[0-9_]*)?$/;
	function compileStyleMap(schema, map) {
		if (map === null) return {};
		const result = {};
		const keys = Object.keys(map);
		for (let index = 0, length = keys.length; index < length; index += 1) {
			let tag = keys[index];
			let style = String(map[tag]);
			if (tag.slice(0, 2) === "!!") tag = "tag:yaml.org,2002:" + tag.slice(2);
			const type = schema.compiledTypeMap["fallback"][tag];
			if (type && _hasOwnProperty.call(type.styleAliases, style)) style = type.styleAliases[style];
			result[tag] = style;
		}
		return result;
	}
	function encodeHex(character) {
		let handle;
		let length;
		const string = character.toString(16).toUpperCase();
		if (character <= 255) {
			handle = "x";
			length = 2;
		} else if (character <= 65535) {
			handle = "u";
			length = 4;
		} else if (character <= 4294967295) {
			handle = "U";
			length = 8;
		} else throw new YAMLException("code point within a string may not be greater than 0xFFFFFFFF");
		return "\\" + handle + common.repeat("0", length - string.length) + string;
	}
	var QUOTING_TYPE_SINGLE = 1;
	var QUOTING_TYPE_DOUBLE = 2;
	function State(options) {
		this.schema = options["schema"] || DEFAULT_SCHEMA;
		this.indent = Math.max(1, options["indent"] || 2);
		this.noArrayIndent = options["noArrayIndent"] || false;
		this.skipInvalid = options["skipInvalid"] || false;
		this.flowLevel = common.isNothing(options["flowLevel"]) ? -1 : options["flowLevel"];
		this.styleMap = compileStyleMap(this.schema, options["styles"] || null);
		this.sortKeys = options["sortKeys"] || false;
		this.lineWidth = options["lineWidth"] || 80;
		this.noRefs = options["noRefs"] || false;
		this.noCompatMode = options["noCompatMode"] || false;
		this.condenseFlow = options["condenseFlow"] || false;
		this.quotingType = options["quotingType"] === "\"" ? QUOTING_TYPE_DOUBLE : QUOTING_TYPE_SINGLE;
		this.forceQuotes = options["forceQuotes"] || false;
		this.replacer = typeof options["replacer"] === "function" ? options["replacer"] : null;
		this.implicitTypes = this.schema.compiledImplicit;
		this.explicitTypes = this.schema.compiledExplicit;
		this.tag = null;
		this.result = "";
		this.duplicates = [];
		this.usedDuplicates = null;
	}
	function indentString(string, spaces) {
		const ind = common.repeat(" ", spaces);
		let position = 0;
		let result = "";
		const length = string.length;
		while (position < length) {
			let line;
			const next = string.indexOf("\n", position);
			if (next === -1) {
				line = string.slice(position);
				position = length;
			} else {
				line = string.slice(position, next + 1);
				position = next + 1;
			}
			if (line.length && line !== "\n") result += ind;
			result += line;
		}
		return result;
	}
	function generateNextLine(state, level) {
		return "\n" + common.repeat(" ", state.indent * level);
	}
	function testImplicitResolving(state, str) {
		for (let index = 0, length = state.implicitTypes.length; index < length; index += 1) if (state.implicitTypes[index].resolve(str)) return true;
		return false;
	}
	function isWhitespace(c) {
		return c === CHAR_SPACE || c === CHAR_TAB;
	}
	function isPrintable(c) {
		return c >= 32 && c <= 126 || c >= 161 && c <= 55295 && c !== 8232 && c !== 8233 || c >= 57344 && c <= 65533 && c !== CHAR_BOM || c >= 65536 && c <= 1114111;
	}
	function isNsCharOrWhitespace(c) {
		return isPrintable(c) && c !== CHAR_BOM && c !== CHAR_CARRIAGE_RETURN && c !== CHAR_LINE_FEED;
	}
	function isPlainSafe(c, prev, inblock) {
		const cIsNsCharOrWhitespace = isNsCharOrWhitespace(c);
		const cIsNsChar = cIsNsCharOrWhitespace && !isWhitespace(c);
		return (inblock ? cIsNsCharOrWhitespace : cIsNsCharOrWhitespace && c !== CHAR_COMMA && c !== CHAR_LEFT_SQUARE_BRACKET && c !== CHAR_RIGHT_SQUARE_BRACKET && c !== CHAR_LEFT_CURLY_BRACKET && c !== CHAR_RIGHT_CURLY_BRACKET) && c !== CHAR_SHARP && !(prev === CHAR_COLON && !cIsNsChar) || isNsCharOrWhitespace(prev) && !isWhitespace(prev) && c === CHAR_SHARP || prev === CHAR_COLON && cIsNsChar;
	}
	function isPlainSafeFirst(c) {
		return isPrintable(c) && c !== CHAR_BOM && !isWhitespace(c) && c !== CHAR_MINUS && c !== CHAR_QUESTION && c !== CHAR_COLON && c !== CHAR_COMMA && c !== CHAR_LEFT_SQUARE_BRACKET && c !== CHAR_RIGHT_SQUARE_BRACKET && c !== CHAR_LEFT_CURLY_BRACKET && c !== CHAR_RIGHT_CURLY_BRACKET && c !== CHAR_SHARP && c !== CHAR_AMPERSAND && c !== CHAR_ASTERISK && c !== CHAR_EXCLAMATION && c !== CHAR_VERTICAL_LINE && c !== CHAR_EQUALS && c !== CHAR_GREATER_THAN && c !== CHAR_SINGLE_QUOTE && c !== CHAR_DOUBLE_QUOTE && c !== CHAR_PERCENT && c !== CHAR_COMMERCIAL_AT && c !== CHAR_GRAVE_ACCENT;
	}
	function isPlainSafeLast(c) {
		return !isWhitespace(c) && c !== CHAR_COLON;
	}
	function codePointAt(string, pos) {
		const first = string.charCodeAt(pos);
		let second;
		if (first >= 55296 && first <= 56319 && pos + 1 < string.length) {
			second = string.charCodeAt(pos + 1);
			if (second >= 56320 && second <= 57343) return (first - 55296) * 1024 + second - 56320 + 65536;
		}
		return first;
	}
	function needIndentIndicator(string) {
		return /^\n* /.test(string);
	}
	var STYLE_PLAIN = 1;
	var STYLE_SINGLE = 2;
	var STYLE_LITERAL = 3;
	var STYLE_FOLDED = 4;
	var STYLE_DOUBLE = 5;
	function chooseScalarStyle(string, singleLineOnly, indentPerLevel, lineWidth, testAmbiguousType, quotingType, forceQuotes, inblock) {
		let i;
		let char = 0;
		let prevChar = null;
		let hasLineBreak = false;
		let hasFoldableLine = false;
		const shouldTrackWidth = lineWidth !== -1;
		let previousLineBreak = -1;
		let plain = isPlainSafeFirst(codePointAt(string, 0)) && isPlainSafeLast(codePointAt(string, string.length - 1));
		if (singleLineOnly || forceQuotes) for (i = 0; i < string.length; char >= 65536 ? i += 2 : i++) {
			char = codePointAt(string, i);
			if (!isPrintable(char)) return STYLE_DOUBLE;
			plain = plain && isPlainSafe(char, prevChar, inblock);
			prevChar = char;
		}
		else {
			for (i = 0; i < string.length; char >= 65536 ? i += 2 : i++) {
				char = codePointAt(string, i);
				if (char === CHAR_LINE_FEED) {
					hasLineBreak = true;
					if (shouldTrackWidth) {
						hasFoldableLine = hasFoldableLine || i - previousLineBreak - 1 > lineWidth && string[previousLineBreak + 1] !== " ";
						previousLineBreak = i;
					}
				} else if (!isPrintable(char)) return STYLE_DOUBLE;
				plain = plain && isPlainSafe(char, prevChar, inblock);
				prevChar = char;
			}
			hasFoldableLine = hasFoldableLine || shouldTrackWidth && i - previousLineBreak - 1 > lineWidth && string[previousLineBreak + 1] !== " ";
		}
		if (!hasLineBreak && !hasFoldableLine) {
			if (plain && !forceQuotes && !testAmbiguousType(string)) return STYLE_PLAIN;
			return quotingType === QUOTING_TYPE_DOUBLE ? STYLE_DOUBLE : STYLE_SINGLE;
		}
		if (indentPerLevel > 9 && needIndentIndicator(string)) return STYLE_DOUBLE;
		if (!forceQuotes) return hasFoldableLine ? STYLE_FOLDED : STYLE_LITERAL;
		return quotingType === QUOTING_TYPE_DOUBLE ? STYLE_DOUBLE : STYLE_SINGLE;
	}
	function writeScalar(state, string, level, iskey, inblock) {
		state.dump = function() {
			if (string.length === 0) return state.quotingType === QUOTING_TYPE_DOUBLE ? "\"\"" : "''";
			if (!state.noCompatMode) {
				if (DEPRECATED_BOOLEANS_SYNTAX.indexOf(string) !== -1 || DEPRECATED_BASE60_SYNTAX.test(string)) return state.quotingType === QUOTING_TYPE_DOUBLE ? "\"" + string + "\"" : "'" + string + "'";
			}
			const indent = state.indent * Math.max(1, level);
			const lineWidth = state.lineWidth === -1 ? -1 : Math.max(Math.min(state.lineWidth, 40), state.lineWidth - indent);
			const singleLineOnly = iskey || state.flowLevel > -1 && level >= state.flowLevel;
			function testAmbiguity(string) {
				return testImplicitResolving(state, string);
			}
			switch (chooseScalarStyle(string, singleLineOnly, state.indent, lineWidth, testAmbiguity, state.quotingType, state.forceQuotes && !iskey, inblock)) {
				case STYLE_PLAIN: return string;
				case STYLE_SINGLE: return "'" + string.replace(/'/g, "''") + "'";
				case STYLE_LITERAL: return "|" + blockHeader(string, state.indent) + dropEndingNewline(indentString(string, indent));
				case STYLE_FOLDED: return ">" + blockHeader(string, state.indent) + dropEndingNewline(indentString(foldString(string, lineWidth), indent));
				case STYLE_DOUBLE: return "\"" + escapeString(string, lineWidth) + "\"";
				default: throw new YAMLException("impossible error: invalid scalar style");
			}
		}();
	}
	function blockHeader(string, indentPerLevel) {
		const indentIndicator = needIndentIndicator(string) ? String(indentPerLevel) : "";
		const clip = string[string.length - 1] === "\n";
		return indentIndicator + (clip && (string[string.length - 2] === "\n" || string === "\n") ? "+" : clip ? "" : "-") + "\n";
	}
	function dropEndingNewline(string) {
		return string[string.length - 1] === "\n" ? string.slice(0, -1) : string;
	}
	function foldString(string, width) {
		const lineRe = /(\n+)([^\n]*)/g;
		let result = function() {
			let nextLF = string.indexOf("\n");
			nextLF = nextLF !== -1 ? nextLF : string.length;
			lineRe.lastIndex = nextLF;
			return foldLine(string.slice(0, nextLF), width);
		}();
		let prevMoreIndented = string[0] === "\n" || string[0] === " ";
		let moreIndented;
		let match;
		while (match = lineRe.exec(string)) {
			const prefix = match[1];
			const line = match[2];
			moreIndented = line[0] === " ";
			result += prefix + (!prevMoreIndented && !moreIndented && line !== "" ? "\n" : "") + foldLine(line, width);
			prevMoreIndented = moreIndented;
		}
		return result;
	}
	function foldLine(line, width) {
		if (line === "" || line[0] === " ") return line;
		const breakRe = / [^ ]/g;
		let match;
		let start = 0;
		let end;
		let curr = 0;
		let next = 0;
		let result = "";
		while (match = breakRe.exec(line)) {
			next = match.index;
			if (next - start > width) {
				end = curr > start ? curr : next;
				result += "\n" + line.slice(start, end);
				start = end + 1;
			}
			curr = next;
		}
		result += "\n";
		if (line.length - start > width && curr > start) result += line.slice(start, curr) + "\n" + line.slice(curr + 1);
		else result += line.slice(start);
		return result.slice(1);
	}
	function escapeString(string) {
		let result = "";
		let char = 0;
		for (let i = 0; i < string.length; char >= 65536 ? i += 2 : i++) {
			char = codePointAt(string, i);
			const escapeSeq = ESCAPE_SEQUENCES[char];
			if (!escapeSeq && isPrintable(char)) {
				result += string[i];
				if (char >= 65536) result += string[i + 1];
			} else result += escapeSeq || encodeHex(char);
		}
		return result;
	}
	function writeFlowSequence(state, level, object) {
		let _result = "";
		const _tag = state.tag;
		for (let index = 0, length = object.length; index < length; index += 1) {
			let value = object[index];
			if (state.replacer) value = state.replacer.call(object, String(index), value);
			if (writeNode(state, level, value, false, false) || typeof value === "undefined" && writeNode(state, level, null, false, false)) {
				if (_result !== "") _result += "," + (!state.condenseFlow ? " " : "");
				_result += state.dump;
			}
		}
		state.tag = _tag;
		state.dump = "[" + _result + "]";
	}
	function writeBlockSequence(state, level, object, compact) {
		let _result = "";
		const _tag = state.tag;
		for (let index = 0, length = object.length; index < length; index += 1) {
			let value = object[index];
			if (state.replacer) value = state.replacer.call(object, String(index), value);
			if (writeNode(state, level + 1, value, true, true, false, true) || typeof value === "undefined" && writeNode(state, level + 1, null, true, true, false, true)) {
				if (!compact || _result !== "") _result += generateNextLine(state, level);
				if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) _result += "-";
				else _result += "- ";
				_result += state.dump;
			}
		}
		state.tag = _tag;
		state.dump = _result || "[]";
	}
	function writeFlowMapping(state, level, object) {
		let _result = "";
		const _tag = state.tag;
		const objectKeyList = Object.keys(object);
		for (let index = 0, length = objectKeyList.length; index < length; index += 1) {
			let pairBuffer = "";
			if (_result !== "") pairBuffer += ", ";
			if (state.condenseFlow) pairBuffer += "\"";
			const objectKey = objectKeyList[index];
			let objectValue = object[objectKey];
			if (state.replacer) objectValue = state.replacer.call(object, objectKey, objectValue);
			if (!writeNode(state, level, objectKey, false, false)) continue;
			if (state.dump.length > 1024) pairBuffer += "? ";
			pairBuffer += state.dump + (state.condenseFlow ? "\"" : "") + ":" + (state.condenseFlow ? "" : " ");
			if (!writeNode(state, level, objectValue, false, false)) continue;
			pairBuffer += state.dump;
			_result += pairBuffer;
		}
		state.tag = _tag;
		state.dump = "{" + _result + "}";
	}
	function writeBlockMapping(state, level, object, compact) {
		let _result = "";
		const _tag = state.tag;
		const objectKeyList = Object.keys(object);
		if (state.sortKeys === true) objectKeyList.sort();
		else if (typeof state.sortKeys === "function") objectKeyList.sort(state.sortKeys);
		else if (state.sortKeys) throw new YAMLException("sortKeys must be a boolean or a function");
		for (let index = 0, length = objectKeyList.length; index < length; index += 1) {
			let pairBuffer = "";
			if (!compact || _result !== "") pairBuffer += generateNextLine(state, level);
			const objectKey = objectKeyList[index];
			let objectValue = object[objectKey];
			if (state.replacer) objectValue = state.replacer.call(object, objectKey, objectValue);
			if (!writeNode(state, level + 1, objectKey, true, true, true)) continue;
			const explicitPair = state.tag !== null && state.tag !== "?" || state.dump && state.dump.length > 1024;
			if (explicitPair) if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) pairBuffer += "?";
			else pairBuffer += "? ";
			pairBuffer += state.dump;
			if (explicitPair) pairBuffer += generateNextLine(state, level);
			if (!writeNode(state, level + 1, objectValue, true, explicitPair)) continue;
			if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) pairBuffer += ":";
			else pairBuffer += ": ";
			pairBuffer += state.dump;
			_result += pairBuffer;
		}
		state.tag = _tag;
		state.dump = _result || "{}";
	}
	function detectType(state, object, explicit) {
		const typeList = explicit ? state.explicitTypes : state.implicitTypes;
		for (let index = 0, length = typeList.length; index < length; index += 1) {
			const type = typeList[index];
			if ((type.instanceOf || type.predicate) && (!type.instanceOf || typeof object === "object" && object instanceof type.instanceOf) && (!type.predicate || type.predicate(object))) {
				if (explicit) if (type.multi && type.representName) state.tag = type.representName(object);
				else state.tag = type.tag;
				else state.tag = "?";
				if (type.represent) {
					const style = state.styleMap[type.tag] || type.defaultStyle;
					let _result;
					if (_toString.call(type.represent) === "[object Function]") _result = type.represent(object, style);
					else if (_hasOwnProperty.call(type.represent, style)) _result = type.represent[style](object, style);
					else throw new YAMLException("!<" + type.tag + "> tag resolver accepts not \"" + style + "\" style");
					state.dump = _result;
				}
				return true;
			}
		}
		return false;
	}
	function writeNode(state, level, object, block, compact, iskey, isblockseq) {
		state.tag = null;
		state.dump = object;
		if (!detectType(state, object, false)) detectType(state, object, true);
		const type = _toString.call(state.dump);
		const inblock = block;
		if (block) block = state.flowLevel < 0 || state.flowLevel > level;
		const objectOrArray = type === "[object Object]" || type === "[object Array]";
		let duplicateIndex;
		let duplicate;
		if (objectOrArray) {
			duplicateIndex = state.duplicates.indexOf(object);
			duplicate = duplicateIndex !== -1;
		}
		if (state.tag !== null && state.tag !== "?" || duplicate || state.indent !== 2 && level > 0) compact = false;
		if (duplicate && state.usedDuplicates[duplicateIndex]) state.dump = "*ref_" + duplicateIndex;
		else {
			if (objectOrArray && duplicate && !state.usedDuplicates[duplicateIndex]) state.usedDuplicates[duplicateIndex] = true;
			if (type === "[object Object]") if (block && Object.keys(state.dump).length !== 0) {
				writeBlockMapping(state, level, state.dump, compact);
				if (duplicate) state.dump = "&ref_" + duplicateIndex + state.dump;
			} else {
				writeFlowMapping(state, level, state.dump);
				if (duplicate) state.dump = "&ref_" + duplicateIndex + " " + state.dump;
			}
			else if (type === "[object Array]") if (block && state.dump.length !== 0) {
				if (state.noArrayIndent && !isblockseq && level > 0) writeBlockSequence(state, level - 1, state.dump, compact);
				else writeBlockSequence(state, level, state.dump, compact);
				if (duplicate) state.dump = "&ref_" + duplicateIndex + state.dump;
			} else {
				writeFlowSequence(state, level, state.dump);
				if (duplicate) state.dump = "&ref_" + duplicateIndex + " " + state.dump;
			}
			else if (type === "[object String]") {
				if (state.tag !== "?") writeScalar(state, state.dump, level, iskey, inblock);
			} else if (type === "[object Undefined]") return false;
			else {
				if (state.skipInvalid) return false;
				throw new YAMLException("unacceptable kind of an object to dump " + type);
			}
			if (state.tag !== null && state.tag !== "?") {
				let tagStr = encodeURI(state.tag[0] === "!" ? state.tag.slice(1) : state.tag).replace(/!/g, "%21");
				if (state.tag[0] === "!") tagStr = "!" + tagStr;
				else if (tagStr.slice(0, 18) === "tag:yaml.org,2002:") tagStr = "!!" + tagStr.slice(18);
				else tagStr = "!<" + tagStr + ">";
				state.dump = tagStr + " " + state.dump;
			}
		}
		return true;
	}
	function getDuplicateReferences(object, state) {
		const objects = [];
		const duplicatesIndexes = [];
		inspectNode(object, objects, duplicatesIndexes);
		const length = duplicatesIndexes.length;
		for (let index = 0; index < length; index += 1) state.duplicates.push(objects[duplicatesIndexes[index]]);
		state.usedDuplicates = new Array(length);
	}
	function inspectNode(object, objects, duplicatesIndexes) {
		if (object !== null && typeof object === "object") {
			const index = objects.indexOf(object);
			if (index !== -1) {
				if (duplicatesIndexes.indexOf(index) === -1) duplicatesIndexes.push(index);
			} else {
				objects.push(object);
				if (Array.isArray(object)) for (let i = 0, length = object.length; i < length; i += 1) inspectNode(object[i], objects, duplicatesIndexes);
				else {
					const objectKeyList = Object.keys(object);
					for (let i = 0, length = objectKeyList.length; i < length; i += 1) inspectNode(object[objectKeyList[i]], objects, duplicatesIndexes);
				}
			}
		}
	}
	function dump(input, options) {
		options = options || {};
		const state = new State(options);
		if (!state.noRefs) getDuplicateReferences(input, state);
		let value = input;
		if (state.replacer) value = state.replacer.call({ "": value }, "", value);
		if (writeNode(state, 0, value, true, true)) return state.dump + "\n";
		return "";
	}
	module.exports.dump = dump;
}));
var import_js_yaml = /* @__PURE__ */ __toESM((/* @__PURE__ */ __commonJSMin(((exports, module) => {
	var loader = require_loader();
	var dumper = require_dumper();
	function renamed(from, to) {
		return function() {
			throw new Error("Function yaml." + from + " is removed in js-yaml 4. Use yaml." + to + " instead, which is now safe by default.");
		};
	}
	module.exports.Type = require_type();
	module.exports.Schema = require_schema();
	module.exports.FAILSAFE_SCHEMA = require_failsafe();
	module.exports.JSON_SCHEMA = require_json();
	module.exports.CORE_SCHEMA = require_core();
	module.exports.DEFAULT_SCHEMA = require_default();
	module.exports.load = loader.load;
	module.exports.loadAll = loader.loadAll;
	module.exports.dump = dumper.dump;
	module.exports.YAMLException = require_exception();
	module.exports.types = {
		binary: require_binary(),
		float: require_float(),
		map: require_map(),
		null: require_null(),
		pairs: require_pairs(),
		set: require_set(),
		timestamp: require_timestamp(),
		bool: require_bool(),
		int: require_int(),
		merge: require_merge(),
		omap: require_omap(),
		seq: require_seq(),
		str: require_str()
	};
	module.exports.safeLoad = renamed("safeLoad", "load");
	module.exports.safeLoadAll = renamed("safeLoadAll", "loadAll");
	module.exports.safeDump = renamed("safeDump", "dump");
})))(), 1);
var { Type, Schema, FAILSAFE_SCHEMA, JSON_SCHEMA, CORE_SCHEMA, DEFAULT_SCHEMA, load, loadAll, dump, YAMLException, types, safeLoad, safeLoadAll, safeDump } = import_js_yaml.default;
import_js_yaml.default;
//#endregion
//#region packages/experimental/openubmc-cases/src/agent.ts
/** Parsing of durable openUBMC Agent gateway results. @module */
const gateway = "openubmc.target-runtime.v1/agent-gateway-v1";
/** Runtime Turn JSON, including Gate, Incident, Outcome and error details. */
const runTurnSchema = object$1({
	schema: literal(`${gateway}/turn`),
	run_id: string().min(1),
	state: string().min(1),
	gate: record$1(string(), json()).nullable().optional(),
	incident: record$1(string(), json()).nullable().optional()
}).catchall(json());
/** Runtime ObservationReceipt JSON, including coverage, freshness and evidence. */
const observationReceiptSchema = object$1({
	schema: literal(`${gateway}/observation-receipt`),
	receipt_id: string().min(1),
	status: string().min(1)
}).catchall(json());
//#endregion
//#region packages/experimental/openubmc-runtime/src/authority.ts
/** Target-scoped permissions for native Runtime starts and their continuations. @module */
const target = string().min(1).max(512);
const start = object$1({
	kind: literal("start"),
	target: target.optional(),
	targets: array(object$1({ ip: target })).min(2).max(16).optional(),
	intent: string().min(1),
	delivery_strategy: string().optional(),
	entry_operation: string().optional()
});
/**
* Resolve the targets and operation range of a protocol start.
* @param args - Untrusted model or persisted start arguments.
* @returns The resolved scope, or null when the start lacks required fields.
*/
function startScope(args) {
	const result = start.safeParse(args);
	if (!result.success) return null;
	const value = result.data;
	const targets = value.targets?.map((item) => item.ip) ?? (value.target === void 0 ? [] : [value.target]);
	if (targets.length === 0 || value.targets !== void 0 && value.target !== void 0 && value.target !== targets[0]) return null;
	return {
		targets,
		intent: value.intent,
		deliveryStrategy: value.delivery_strategy ?? null,
		entryOperation: value.entry_operation ?? null
	};
}
/**
* Identify the protocol's default diagnostic workflow without a custom operation.
* @param scope - Scope resolved from the original start.
* @returns Whether its workflow is limited to read-only diagnosis.
*/
function readOnlyScope(scope) {
	return scope?.intent === "diagnosis-only" && scope.deliveryStrategy === null && scope.entryOperation === null;
}
/**
* Read an explicit native command permission without interpreting model text.
* @param input - Human command arguments.
* @returns A full execute grant, a scoped grant, or revocation.
*/
function commandGrant(input) {
	if (input === "execute" || input === "revoke") return input;
	const parts = input.split(/\s+/);
	if (parts.length < 3 || parts.length > 4 || parts[0] !== "execute") throw new Error("Usage: /target-authorize execute [target intent [source-only|live-patch|build-upgrade]] | revoke");
	const [, selectedTarget, intent, deliveryStrategy] = parts;
	if (deliveryStrategy !== void 0 && ![
		"source-only",
		"live-patch",
		"build-upgrade"
	].includes(deliveryStrategy)) throw new Error("Unsupported delivery strategy in target authorization.");
	return {
		targets: [target.parse(selectedTarget)],
		intent: string().min(1).parse(intent),
		deliveryStrategy: deliveryStrategy ?? null,
		entryOperation: null
	};
}
/**
* Check retained permission for the exact start or the original scope of an owned Run.
* @param request - Provider dispatch with trusted call identity.
* @param state - Durable authority projection.
* @returns Whether dispatch has current execution permission.
*/
function executionAllowed(request, state) {
	if (state.operations.includes("execute")) return true;
	const args = request.arguments;
	if (args.kind === "start") {
		const scope = startScope(args);
		const approved = state.approvedCalls[request.execution.callId];
		return readOnlyScope(scope) || approved !== void 0 && isDeepStrictEqual(approved, args) || scope !== null && state.scopes.some((grant) => isDeepStrictEqual(grant, scope));
	}
	const run = typeof args.run_id === "string" ? Object.entries(state.runScopes).find(([id]) => id === args.run_id)?.[1] : void 0;
	return run !== void 0 && (readOnlyScope(run.scope) || run.granted || run.scope !== null && state.scopes.some((grant) => isDeepStrictEqual(grant, run.scope)));
}
/**
* Ask the native human interaction service to authorize one exact proposed Run.
* @param ctx - Host context with an optional native question service.
* @param request - Validated start and its live calling Agent.
* @param record - Optional provider-owned durable grant writer; defaults to the native Session event.
* @returns After a durable grant, or rejects without permitting dispatch.
*/
async function requestRunAuthorization(ctx, request, record) {
	const scope = startScope(request.arguments);
	const agent = request.execution.agent;
	const questions = ctx.get("userQuestions");
	if (scope === null || request.arguments.kind !== "start" || agent === void 0 || questions === void 0) throw new Error("Target execution requires human authorization for this scope. Use /target-authorize execute target intent [delivery-strategy].");
	const approvedArguments = record$1(string(), json()).parse(request.arguments);
	const approve = "Authorize this Run";
	const purpose = typeof request.arguments.purpose === "string" ? request.arguments.purpose : scope.intent;
	const decision = (await questions.ask({
		agent,
		signal: request.execution.signal,
		wait: { callId: request.execution.callId },
		questions: [{
			id: "openubmc-execution",
			question: `Allow this task on ${scope.targets.join(", ")}?`,
			detail: `${purpose}\nOperation: ${scope.intent}\nDelivery: ${scope.deliveryStrategy ?? "Runtime default"}\nEntry: ${scope.entryOperation ?? "Runtime default"}\nPermission covers this Run and its stage continuations.`,
			options: [{
				label: approve,
				description: "Allow this task and its required stage handoffs."
			}, {
				label: "Decline",
				description: "Leave the proposed task unstarted."
			}]
		}]
	})).answers.find((item) => item.id === "openubmc-execution");
	if (decision?.selected.length !== 1 || decision.selected[0] !== approve || decision.custom !== void 0) throw new Error("Target execution was not authorized.");
	if (!isDeepStrictEqual(request.arguments, approvedArguments)) throw new Error("The proposed start changed while authorization was pending.");
	if (record !== void 0) await record(approvedArguments);
	else agent.session.append("openubmc/authorization", {
		callId: request.execution.callId,
		arguments: approvedArguments
	});
}
//#endregion
//#region packages/experimental/openubmc-runtime/src/guidance.ts
/** Task guidance shared by fresh and resumed openUBMC conversations. */
const openUbmcWorkflowGuidance = `openUBMC work uses the available observe and execute tools. Runtime owns Runs, Gates, Incidents, evidence and device effects. Keep the same Run and returned bindings across stage changes and recovery.

Before the first workflow action and each stage change, load the current owner's instructions through the available skill catalog. Match the stage: live diagnosis or post-change verification, source development, test design, build, live file replacement, or firmware upgrade. Use the catalog's exact skill name and resource paths. A specified mechanical edit can follow the ordinary edit and focused-check path. If a required skill is unavailable, report that gap and continue independent authorized work.

Use observe for the exact read-only evidence needed for the answer. Start a Run only for the user's workflow, then follow its returned next_action. A default diagnosis-only start is read-only; a different entry operation or delivery needs its applicable execution permission. Copy reusable action bindings exactly. A null next_action requires missing external work or input; do not invent a continuation. A response_required Gate requests actual work and evidence; it does not by itself require human approval. Read gate.input_schema, perform the current stage, and use execute kind=respond with the returned Gate binding and submission_id. Submit only facts established by tool results, source changes, checks or artifacts. Use partial when the current schema permits it and work remains; otherwise record failed or cancelled as appropriate. Never invent evidence, a successful check, a root cause or Gate acceptance. If progress.status is no_progress on the same Gate, do the missing work and respond; repeating resume cannot supply evidence.

Carry the user's existing target and operation authorization. Follow current execution permissions. A start that needs new authority asks through native authorization; do not create a second approval request. Ask through the available native user-interaction tool only for necessary missing information or a material user decision. Do not ask the user to fill protocol JSON or approve each evidence Gate. Tool denials are not grants; never supply Runtime-owned authority or identity fields yourself.

For an explicit request to keep working, use the available native Goal tools and reuse an active Goal. Continue authorized work and stage handoffs until delivery or a real blocker. Mark completion only after the requested work and verification finish. Preserve the same Run when continuing after interruption. A pending call, lost reply, timeout or cancellation does not establish device rollback: observe recorded facts and reconcile the same Run before another effect. An unacknowledged start requires recovery with its original operation identity. Report the practical result and remaining gaps concisely; keep protocol details and evidence available on demand.`;
/**
* Summarize recorded authority and workflow conditions without copying unbounded evidence.
* @param state - Authoritative Session projection rebuilt from recorded calls and settlements.
* @returns Fixed-field context for the next model request.
*/
function renderOpenUbmcRuntimeContext(state) {
	const pending = Object.keys(state.pendingCalls).length;
	const uncertain = Object.keys(state.uncertainCalls).length;
	const runs = Object.values(state.runs).filter((run) => run !== void 0);
	const gates = runs.filter((run) => run.gate != null).length;
	const incidents = runs.filter((run) => run.incident != null).length;
	const lines = [`openUBMC recorded Session state: execute authorization ${state.operations.includes("execute") || state.scopes.length > 0 ? "granted within its recorded scope" : "absent for additional effects"}; pending calls ${pending}; uncertain calls ${uncertain}; owned Runs ${runs.length}; open Gates ${gates}; Incidents ${incidents}.`];
	if (pending > 0 || uncertain > 0) lines.push("Resolve the unsettled operation before another effect. Keep its Run and original operation identity; an unacknowledged start needs the native recovery path, while a known Run uses reconciliation.");
	if (incidents > 0) lines.push("Read the recorded Incident and follow its recovery action before continuing the same Run.");
	if (gates > 0) lines.push("Read the latest returned Gate schema and bindings. Load its stage owner, complete the work, then submit evidence through respond; a Gate alone does not require a user decision.");
	return lines.join("\n");
}
z.object({
	serverName: z.string().required().pattern(/^[A-Za-z0-9_-]{1,32}$/),
	operationDeadlineSeconds: z.number().required().min(1).max(120),
	observationDeadlineSeconds: z.number().required().min(1).max(2147483),
	completionGraceMs: z.number().required().min(1).max(2147483647)
});
const jsonObject = record$1(string(), json());
const callSchema = object$1({
	arguments: jsonObject,
	operationId: string().transform(ToolCallId)
});
const metadataSchema$1 = object$1({ mcp: object$1({
	serverName: string(),
	toolName: string(),
	dispatchStatus: _enum(["unknown", "not-started"]).optional(),
	structuredContent: jsonObject.optional()
}) });
const actionSchema = discriminatedUnion("kind", [
	object$1({ kind: literal("start") }).loose(),
	object$1({
		kind: literal("resume"),
		run_id: string().min(1)
	}).loose(),
	object$1({
		kind: literal("respond"),
		run_id: string().min(1),
		gate_id: string().min(1),
		gate_version: number().int().positive(),
		schema_digest: string().min(1)
	}).loose(),
	object$1({
		kind: literal("control"),
		run_id: string().min(1),
		command: _enum(["reconcile", "cancel"])
	}).loose()
]);
const continuationSchema = actionSchema.refine((action) => action.kind !== "start", "Native actions must continue an existing Run.");
const runtimeOwned = [
	"case_id",
	"command_id",
	"authorization",
	"workflow",
	"epoch",
	"task_id",
	"operation_id"
];
const executeAliases = [
	"action_type",
	"actionKind",
	"runId",
	"gateId",
	"gateVersion",
	"schemaDigest",
	"submissionId",
	"target_ip",
	"bmc_ip",
	"deliveryStrategy",
	"entryOperation",
	"entryArguments"
];
function publicToolName$1(serverName, toolName) {
	return `mcp__${serverName}__${toolName}`;
}
function nativeCallId(commandId) {
	return ToolCallId(`command:${commandId}`);
}
/** Namespace opaque model call ids by the trusted Session and bound their wire length. */
function operationId(request, callId) {
	return `dsh-${createHash("sha256").update(JSON.stringify([request.execution.agent?.session.id, callId])).digest("hex")}`;
}
/** Resolve a caller wait; this does not change a domain operation deadline. */
function budget(request, config) {
	const maximum = request.toolName === "execute" ? config.operationDeadlineSeconds : config.observationDeadlineSeconds;
	const deadline = request.arguments.deadline ?? maximum;
	if (typeof deadline !== "number" || !Number.isFinite(deadline) || deadline <= 0 || deadline > maximum) throw new Error("The requested Runtime caller wait exceeds the configured limit.");
	const required = deadline * 1e3 + config.completionGraceMs;
	if (request.toolCallTimeoutMs === void 0 || request.toolCallTimeoutMs < required) throw new Error(`MCP wait budget must be at least ${required} ms for this Runtime request.`);
	return {
		...request.arguments,
		deadline
	};
}
/** Validate authority immediately before provider dispatch, after other middleware. */
function authorize(request, state, config) {
	if (runtimeOwned.some((key) => Object.hasOwn(request.arguments, key))) throw new Error("Runtime-owned execution fields are not accepted by the Agent interface.");
	if (request.toolName === "observe") {
		request.arguments = budget(request, config);
		return true;
	}
	if (executeAliases.some((key) => Object.hasOwn(request.arguments, key))) throw new Error("Use canonical Agent execute field names; aliases are not accepted.");
	const action = actionSchema.parse(request.arguments);
	const replayId = state.reconcileCallId;
	const original = replayId === null ? void 0 : state.uncertainCalls[replayId] ?? state.pendingCalls[replayId];
	if (original !== void 0) {
		if (Object.keys(state.pendingCalls).some((id) => id !== request.execution.callId && id !== replayId)) throw new Error("Another execute call is still pending; wait for its settlement before replay.");
		const expected = budget({
			...request,
			arguments: original.arguments
		}, config);
		if (!isDeepStrictEqual(budget(request, config), expected)) throw new Error("Recovery requires the exact original start arguments.");
		request.arguments = expected;
		request.metadata["openubmc/operationId"] = operationId(request, original.operationId);
		return true;
	}
	const ownRun = action.kind === "start" ? void 0 : state.runs[brandString(action.run_id)];
	if (action.kind !== "start" && ownRun === void 0) throw new Error("The requested Run does not belong to this Session.");
	if (action.kind === "start" && Object.hasOwn(action, "run_id")) throw new Error("Runtime assigns the Run identity for start.");
	if (action.kind !== "start" && [
		"target",
		"targets",
		"intent",
		"delivery_strategy",
		"entry_operation",
		"entry_arguments"
	].some((key) => Object.hasOwn(request.arguments, key))) throw new Error("Continuation cannot change the original Run scope.");
	if (action.kind === "respond" || action.kind === "control" && action.command === "cancel" && ownRun?.incident == null) {
		const binding = object$1({
			gate_id: string(),
			gate_version: number().int(),
			schema_digest: string()
		}).parse(action);
		const gate = jsonObject.safeParse(ownRun?.gate);
		if (!gate.success || binding.gate_id !== gate.data.gate_id || binding.gate_version !== gate.data.gate_version || binding.schema_digest.replace(/^sha256:/, "") !== string().parse(gate.data.schema_digest).replace(/^sha256:/, "")) throw new Error("The response must bind the latest observed Gate id, version and schema digest.");
	}
	if (action.kind === "control" && action.command === "cancel" && ownRun?.incident !== null && ownRun?.incident !== void 0) {
		const incident = jsonObject.parse(ownRun.incident);
		if (action.incident_id !== incident.incident_id) throw new Error("Cancellation must bind the latest observed Incident.");
	}
	const unresolved = [...Object.entries(state.pendingCalls), ...Object.entries(state.uncertainCalls)].filter(([id]) => id !== request.execution.callId);
	if (unresolved.length > 0 && !(action.kind === "control" && action.command === "reconcile" && unresolved.every(([, call]) => call?.arguments.run_id === action.run_id))) throw new Error("The prior execute outcome is unknown. Reconcile the same Run before further execution.");
	request.arguments = budget(request, config);
	return executionAllowed(request, state);
}
/**
* Share Session authority folding and dispatch checks with external tool providers.
* @param config - Runtime namespace and caller wait budgets.
* @returns Pure authority projection, request preparation and native action parser.
*/
function createRuntimeController(config) {
	return {
		projection: createRuntimeProjection(config),
		commandGrant,
		requestAuthorization: requestRunAuthorization,
		guidance: openUbmcWorkflowGuidance,
		renderContext: renderOpenUbmcRuntimeContext,
		prepare: (request, state) => {
			request.metadata["openubmc/operationId"] = operationId(request, request.execution.callId);
			return authorize(request, state, config);
		},
		parseContinuation: (input) => jsonObject.parse(continuationSchema.parse(input))
	};
}
function createRuntimeProjection(config) {
	return {
		key: "openubmc/runtime",
		stateVersion: 5,
		stateSchema: object$1({
			inheritedEventCount: number().int().nonnegative().transform(SessionLogOffset),
			operations: array(string()),
			pendingGrants: record$1(string().transform(CommandId), string()),
			scopes: array(object$1({
				targets: array(string()),
				intent: string(),
				deliveryStrategy: string().nullable(),
				entryOperation: string().nullable()
			})),
			runScopes: record$1(string().transform((value) => brandString(value)), object$1({
				scope: object$1({
					targets: array(string()),
					intent: string(),
					deliveryStrategy: string().nullable(),
					entryOperation: string().nullable()
				}).nullable(),
				granted: boolean()
			})),
			approvedCalls: record$1(string().transform(ToolCallId), jsonObject),
			runs: record$1(string().transform((value) => brandString(value)), jsonObject),
			pendingCalls: record$1(string().transform(ToolCallId), callSchema),
			uncertainCalls: record$1(string().transform(ToolCallId), callSchema),
			reconcileCallId: string().transform(ToolCallId).nullable()
		}),
		init: (_header, inheritedEventCount) => ({
			inheritedEventCount,
			operations: [],
			pendingGrants: {},
			scopes: [],
			runScopes: {},
			approvedCalls: {},
			runs: {},
			pendingCalls: {},
			uncertainCalls: {},
			reconcileCallId: null
		}),
		wire: {
			viewSchema: object$1({
				authorized: boolean(),
				executableRunIds: array(string().transform((value) => brandString(value))),
				pending: number().int().nonnegative(),
				uncertain: number().int().nonnegative()
			}),
			view: (state) => ({
				authorized: state.operations.includes("execute") || state.scopes.length > 0 || Object.values(state.runScopes).some((run) => run.granted),
				executableRunIds: Object.keys(state.runs).filter((id) => {
					const run = state.runScopes[brandString(id)];
					return state.operations.includes("execute") || run !== void 0 && (readOnlyScope(run.scope) || run.granted || run.scope !== null && state.scopes.some((scope) => isDeepStrictEqual(scope, run.scope)));
				}).map((id) => brandString(id)),
				pending: Object.keys(state.pendingCalls).length,
				uncertain: Object.keys(state.uncertainCalls).length
			})
		},
		apply(state, event) {
			if (event.seq < state.inheritedEventCount) return state;
			if (event.type === "openubmc/authorization") {
				const pending = state.pendingCalls[event.data.callId];
				if (pending === void 0 || pending.arguments.kind !== "start") return state;
				if (!isDeepStrictEqual({
					...pending.arguments,
					deadline: pending.arguments.deadline ?? event.data.arguments.deadline
				}, event.data.arguments)) return state;
				return {
					...state,
					approvedCalls: {
						...state.approvedCalls,
						[event.data.callId]: event.data.arguments
					}
				};
			}
			if (event.type === "command/run" && event.data.name === "target-action") {
				let input;
				try {
					input = JSON.parse(event.data.args ?? "");
				} catch (_error) {
					return state;
				}
				const parsed = continuationSchema.safeParse(input);
				if (!parsed.success) return state;
				const id = nativeCallId(event.data.commandId);
				return {
					...state,
					pendingCalls: {
						...state.pendingCalls,
						[id]: {
							arguments: jsonObject.parse(parsed.data),
							operationId: id
						}
					}
				};
			}
			if (event.type === "tool/call" && event.data.name === publicToolName$1(config.serverName, "execute")) {
				let input;
				try {
					input = JSON.parse(event.data.arguments);
				} catch (_error) {
					return state;
				}
				const parsed = jsonObject.safeParse(input);
				if (!parsed.success) return state;
				return {
					...state,
					pendingCalls: {
						...state.pendingCalls,
						[event.data.callId]: {
							arguments: parsed.data,
							operationId: state.reconcileCallId ?? event.data.callId
						}
					}
				};
			}
			if (event.type === "tool/result" || event.type === "openubmc/inspection") {
				const id = event.type === "tool/result" ? event.data.message.toolCallId : nativeCallId(event.data.commandId);
				const errorCode = event.type === "tool/result" ? event.data.error?.code : void 0;
				const recorded = state.pendingCalls[id];
				if (recorded === void 0) return state;
				const replayId = state.reconcileCallId;
				const original = replayId === null ? void 0 : state.uncertainCalls[replayId] ?? state.pendingCalls[replayId];
				const comparable = (args) => ({
					...args,
					deadline: args.deadline ?? config.operationDeadlineSeconds
				});
				const pending = original !== void 0 && isDeepStrictEqual(comparable(recorded.arguments), comparable(original.arguments)) ? {
					...recorded,
					operationId: original.operationId
				} : recorded;
				const { [id]: _settled, ...pendingCalls } = state.pendingCalls;
				const metadata = metadataSchema$1.safeParse(event.data.meta);
				const mcp = metadata.success && metadata.data.mcp.serverName === config.serverName && metadata.data.mcp.toolName === "execute" ? metadata.data.mcp : void 0;
				const { [pending.operationId]: approved, ...approvedCalls } = state.approvedCalls;
				if (mcp?.dispatchStatus === "not-started") return {
					...state,
					pendingCalls,
					approvedCalls: pending.operationId === id ? approvedCalls : state.approvedCalls
				};
				const turn = runTurnSchema.safeParse(mcp?.structuredContent);
				const failure = object$1({
					schema: literal("openubmc.target-runtime.v1/agent-gateway-v1/turn"),
					run_id: literal(""),
					state: literal("failed"),
					error: object$1({ code: string() })
				}).safeParse(mcp?.structuredContent);
				const rejected = event.data.message.isError && failure.success && [
					"AgentGatewayError",
					"AgentPreflightError",
					"GatePreflightError",
					"GateSchemaViolation",
					"GateConflict",
					"ReferenceViolation",
					"ScopeViolation",
					"AgentBudgetError",
					"CommandConflict"
				].includes(failure.data.error.code);
				if (mcp?.dispatchStatus === "unknown" || errorCode === TOOL_OUTCOME_UNKNOWN || errorCode === TOOL_ABORTED || !turn.success && !rejected || mcp === void 0 || turn.success && pending.arguments.kind !== "start" && pending.arguments.run_id !== turn.data.run_id) return {
					...state,
					pendingCalls,
					reconcileCallId: null,
					uncertainCalls: {
						...state.uncertainCalls,
						[pending.operationId]: pending
					}
				};
				let runs = state.runs;
				let runScopes = state.runScopes;
				let uncertainCalls = { ...state.uncertainCalls };
				if (turn.success && (pending.arguments.kind === "start" || pending.arguments.run_id === turn.data.run_id)) {
					const runId = brandString(turn.data.run_id);
					if (pending.arguments.kind === "start" || runs[runId] !== void 0) runs = {
						...runs,
						[runId]: turn.data
					};
					if (pending.arguments.kind === "start") runScopes = {
						...runScopes,
						[runId]: {
							scope: startScope(pending.arguments),
							granted: approved !== void 0
						}
					};
					if (pending.arguments.kind === "control" && pending.arguments.command === "reconcile") uncertainCalls = Object.fromEntries(Object.entries(uncertainCalls).filter(([, call]) => call?.arguments.run_id !== runId));
				}
				if (turn.success) {
					const { [pending.operationId]: _recovered, ...unsettled } = uncertainCalls;
					uncertainCalls = unsettled;
				} else if (pending.operationId !== id) uncertainCalls[pending.operationId] = state.uncertainCalls[pending.operationId] ?? state.pendingCalls[pending.operationId] ?? pending;
				const { [pending.operationId]: _original, ...unsettledCalls } = pendingCalls;
				const remaining = turn.success && pending.arguments.kind === "control" && pending.arguments.command === "reconcile" ? Object.fromEntries(Object.entries(unsettledCalls).filter(([, call]) => call?.arguments.run_id !== turn.data.run_id)) : unsettledCalls;
				return {
					...state,
					runs,
					runScopes,
					approvedCalls: uncertainCalls[pending.operationId] === void 0 ? approvedCalls : state.approvedCalls,
					pendingCalls: remaining,
					uncertainCalls,
					reconcileCallId: null
				};
			}
			if (event.type === "command/run" && ["target-authorize", "target-reconcile"].includes(event.data.name) && event.data.args !== void 0) return {
				...state,
				pendingGrants: {
					...state.pendingGrants,
					[event.data.commandId]: event.data.name === "target-reconcile" ? `reconcile:${event.data.args.trim()}` : event.data.args.trim()
				}
			};
			if (event.type !== "command/done") return state;
			const { [event.data.commandId]: input, ...pendingGrants } = state.pendingGrants;
			if (input === void 0 || event.data.kind !== "success") return {
				...state,
				pendingGrants
			};
			if (input.startsWith("reconcile:")) return {
				...state,
				pendingGrants,
				reconcileCallId: ToolCallId(input.slice(10))
			};
			let permission;
			try {
				permission = commandGrant(input);
			} catch (_error) {
				return {
					...state,
					pendingGrants
				};
			}
			if (permission === "execute") return {
				...state,
				pendingGrants,
				operations: ["execute"],
				reconcileCallId: null
			};
			if (permission === "revoke") return {
				...state,
				pendingGrants,
				operations: [],
				scopes: [],
				approvedCalls: {},
				runScopes: Object.fromEntries(Object.entries(state.runScopes).map(([id, run]) => [id, {
					...run,
					granted: false
				}])),
				reconcileCallId: null
			};
			return {
				...state,
				pendingGrants,
				scopes: [...state.scopes.filter((scope) => !isDeepStrictEqual(scope, permission)), permission],
				reconcileCallId: null
			};
		}
	};
}
//#endregion
//#region packages/util/atomic-write/src/index.ts
/**
* Zero-dependency atomic file replacement and writer coordination.
* `writeFileAtomic` writes a random-suffix sibling with exclusive create and
* the caller's permission bits, then renames it over the target, so readers
* observe either the old or the new complete content and a replaced file ends
* up with exactly the stated mode. `withFileLock` serializes cross-process
* writers of one file through a `wx`-created `<file>.lock` sibling, so a
* read-modify-write cycle can never resurrect a state another writer just
* replaced; readers stay lock-free because the rename commit is atomic. A lock
* whose recorded holder process no longer exists is taken over.
* @module @deepseek-ai/dsh-atomic-write
*/
/** Whether an exclusive create found an existing lock. */
async function isLockContention(error, lockPath) {
	const code = error?.code;
	if (code === "EEXIST") return true;
	if (code !== "EPERM") return false;
	try {
		await lstat(lockPath);
		return true;
	} catch {
		return false;
	}
}
/** Whether the holder a `<pid>\n` record names is proven gone: a signal probe finds no such process. */
function holderExited(record) {
	if (!/^\d+\n$/.test(record)) return false;
	const pid = Number(record.trim());
	if (pid === 0 || pid > 2147483647) return false;
	if (pid === process.pid) return false;
	try {
		process.kill(pid, 0);
		return false;
	} catch (error) {
		return error.code === "ESRCH";
	}
}
/** The lock file's content, or undefined when it cannot be read. */
async function readLockRecord(lockPath) {
	try {
		return await readFile(lockPath, "utf8");
	} catch (error) {
		return;
	}
}
/**
* Remove the lock when its recorded holder exited. Contenders that read the
* same record serialize on a claim file named after it. Under the claim, the
* claimant re-reads the lock and probes its PID again, and removes it only
* when it still holds that record and that PID is still gone: the record's
* holder can no longer release it, and no other contender can remove it
* without the claim, so a removal never deletes a lock another contender
* acquired after the dead holder's, including one whose holder reused the PID.
* @returns Whether this call removed the dead holder's lock.
*/
async function takeOverExitedLock(lockPath) {
	const record = await readLockRecord(lockPath);
	if (record === void 0 || !holderExited(record)) return false;
	const claim = `${lockPath}.takeover-${createHash("sha256").update(record).digest("hex").slice(0, 16)}`;
	try {
		await writeFile(claim, `${process.pid}\n`, {
			mode: 384,
			flag: "wx"
		});
	} catch (error) {
		const code = error.code;
		if (code === "EEXIST" || code === "EPERM") return false;
		throw error;
	}
	try {
		if (await readLockRecord(lockPath) !== record || !holderExited(record)) return false;
		try {
			await rm(lockPath, { force: true });
		} catch (error) {
			return false;
		}
		return true;
	} finally {
		await rm(claim, { force: true }).catch((error) => {});
	}
}
/**
* Retry cadence for a contended lock. These stay robustness invariants of the
* cross-process write protocol rather than deployment tunables: they govern how
* often a contender asks, which no caller has a reason to vary.
*/
const LOCK_RETRY_INITIAL_MS = 20;
const LOCK_RETRY_MAX_MS = 200;
/**
* How long a contender waits when the caller states no limit — sized for the
* render-and-rename cycle every call site had when this package was written.
* Expiry fails the contender rather than guessing whether the existing lock
* still has an owner. How long is *worth* waiting is a property of the
* operation the lock holder runs, which is why {@link FileLockOptions.waitMs}
* exists; the value here is the floor for an operation that does file work
* alone.
*/
const DEFAULT_LOCK_WAIT_MS = 2e3;
/**
* Hold the cross-process writer lock for `filename` around one operation. The
* lock is a `wx`-created sibling (`<filename>.lock`); paired with the
* rename-based commit of {@link writeFileAtomic}, readers stay lock-free and
* only writers contend. `EEXIST` is contention directly; an `EPERM` is
* contention only when a fresh `lstat` confirms the lock path exists, covering
* Windows exclusive-create behavior. Windows retries one unconfirmed EPERM
* because the holder can release before the probe; a repeated unconfirmed
* permission error is rethrown. The lock records its holder's PID. A contender
* removes the lock and retries at once when no process with that PID exists
* (`ESRCH`); any other lock, including one whose holder exists under another
* user (`EPERM`) or whose record is incomplete, is waited for. Contention backs
* off exponentially and times out after the deadline. A holder whose PID a
* live process reused keeps its lock until an operator removes it. Takeover
* proves only that the recorded process exited: an operation that starts other
* writers must stop them with it or leave its successor a way to find them.
* PIDs are compared on the contender's host, so writers on other hosts or in
* other PID namespaces sharing the file are unsupported and could both hold
* the lock. The parent directory must exist.
* @param filename - the file whose writers this lock serializes.
* @param operation - the read-render-commit cycle to run while holding the lock.
* @param options - acquisition options; omitted waits {@link DEFAULT_LOCK_WAIT_MS}.
* @returns the operation's result; the lock releases on both outcomes.
*/
async function withFileLock(filename, operation, options) {
	const lockPath = `${filename}.lock`;
	const deadline = Date.now() + (options?.waitMs ?? DEFAULT_LOCK_WAIT_MS);
	let delay = LOCK_RETRY_INITIAL_MS;
	let retriedUnconfirmedPermissionError = false;
	for (;;) {
		try {
			await writeFile(lockPath, `${process.pid}\n`, {
				mode: 384,
				flag: "wx"
			});
			break;
		} catch (error) {
			if (!await isLockContention(error, lockPath)) {
				if (process.platform !== "win32" || error?.code !== "EPERM" || retriedUnconfirmedPermissionError) throw error;
				retriedUnconfirmedPermissionError = true;
			} else if (await takeOverExitedLock(lockPath)) continue;
		}
		if (Date.now() >= deadline) throw new Error(`atomic-write: timed out waiting for the writer lock at ${lockPath}`);
		await new Promise((resolve) => setTimeout(resolve, delay));
		delay = Math.min(delay * 2, LOCK_RETRY_MAX_MS);
	}
	try {
		return await operation();
	} finally {
		await rm(lockPath, { force: true });
	}
}
//#endregion
//#region scripts/openubmc/session-authority.ts
/** Plugin-owned Session associations; Runtime retains every domain state transition. @module */
const header = object$1({
	schema: literal("dsh-openubmc/session-authority/v1"),
	sessionId: string(),
	stateVersion: number().int(),
	sequence: number().int().nonnegative(),
	revision: number().int().nonnegative()
});
/** Durable associations and permissions for one trusted Session identity. */
var SessionAuthority = class {
	directory;
	controller;
	lockWaitMs;
	hasHistory;
	constructor(directory, controller, lockWaitMs, hasHistory) {
		this.directory = directory;
		this.controller = controller;
		this.lockWaitMs = lockWaitMs;
		this.hasHistory = hasHistory;
	}
	path(session) {
		return join(this.directory, createHash("sha256").update(session.id).digest("hex") + ".json");
	}
	/**
	* Exclude another execute or recovery while a caller is still waiting.
	* @param session - Trusted calling Session.
	* @param operation - Work whose completed promise releases the execution lease.
	* @returns The operation result; a live competing caller fails closed.
	*/
	async exclusive(session, operation) {
		await mkdir(this.directory, {
			recursive: true,
			mode: 448
		});
		return withFileLock(this.path(session) + ".execution", operation, { waitMs: this.lockWaitMs });
	}
	/**
	* Read validated authority without inferring permission from inherited conversations.
	* @param session - Trusted Host Session.
	* @param currentCall - New call that may already have a Host tool/call record.
	* @returns Private authority record; missing history with prior effects fails closed.
	*/
	read(session, currentCall) {
		let raw;
		try {
			raw = readFileSync(this.path(session), "utf8");
		} catch (error) {
			if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
			if (this.hasHistory(session, currentCall)) throw new Error("openUBMC Session authority is missing. Restore its authority directory before continuing this Session.");
			return {
				schema: "dsh-openubmc/session-authority/v1",
				sessionId: session.id,
				stateVersion: this.controller.projection.stateVersion,
				sequence: 0,
				revision: 0,
				state: this.controller.projection.init(session.header, SessionLogOffset(0))
			};
		}
		const parsed = header.extend({ state: this.controller.projection.stateSchema }).parse(JSON.parse(raw));
		if (parsed.sessionId !== session.id || parsed.stateVersion !== this.controller.projection.stateVersion) throw new Error("openUBMC Session authority has an incompatible identity or version. Restore a compatible backup.");
		return parsed;
	}
	/**
	* Serialize one authority transaction across Hosts and sync it before returning.
	* @param session - Trusted Host Session; fork children use separate records.
	* @param currentCall - Optional new call already recorded by the Host.
	* @param mutate - Synchronous state update, executed after validation under the lock.
	* @returns The committed state.
	*/
	async update(session, currentCall, mutate) {
		return (await this.transaction(session, currentCall, mutate, (state) => state)).value;
	}
	/**
	* Commit the final permission check and submit IO before releasing the writer lock.
	* @param session - Trusted calling Session.
	* @param currentCall - Calling operation identity.
	* @param prepare - Final permission check under the writer lock.
	* @param send - Submit once after syncing; its settlement does not hold the writer lock.
	* @returns The provider result; rejection retains the already-recorded pending call.
	*/
	async dispatch(session, currentCall, prepare, send) {
		const result = await (await this.transaction(session, currentCall, prepare, () => ({ settlement: send().then((value) => ({ value }), (error) => ({ error })) }))).value.settlement;
		if ("error" in result) throw result.error;
		return result.value;
	}
	async transaction(session, currentCall, mutate, committed) {
		await mkdir(this.directory, {
			recursive: true,
			mode: 448
		});
		return withFileLock(this.path(session), async () => {
			const record = this.read(session, currentCall);
			const state = this.controller.projection.stateSchema.parse(mutate(record.state));
			const temporary = this.path(session) + "." + randomUUID() + ".tmp";
			try {
				const file = await open(temporary, "wx", 384);
				try {
					await file.writeFile(JSON.stringify({
						...record,
						sequence: record.sequence + 1,
						revision: record.revision + 1,
						state
					}) + "\n");
					await file.sync();
				} finally {
					await file.close();
				}
				await rename(temporary, this.path(session));
				const directory = await open(this.directory, "r");
				try {
					await directory.sync();
				} finally {
					await directory.close();
				}
			} finally {
				await rm(temporary, { force: true });
			}
			return {
				state,
				value: committed(state)
			};
		}, { waitMs: this.lockWaitMs });
	}
	/**
	* Reuse the native authority reducer for a private association update.
	* @param state - Validated association state.
	* @param event - Typed reducer input; never appended as a custom Host event.
	* @returns Updated association state.
	*/
	fold(state, event) {
		return this.controller.projection.apply(state, event);
	}
};
/**
* Stamp a private reducer input independently of the Host's conversation sequence.
* @param event - Typed reducer data without a timestamp or sequence.
* @returns A complete reducer input; not a persisted Host Session event.
*/
function authorityInput(event) {
	return {
		...event,
		seq: SessionSeq(0),
		time: 0
	};
}
//#endregion
//#region scripts/openubmc/portable-runtime.ts
/** Public Host tool registrations with plugin-owned MCP identity and authority. @module */
const serverName = "openubmc-target-runtime";
const publicToolName = (_server, rawName) => `mcp__${serverName}__${rawName}`;
const object = record$1(string(), json());
const resultSchema = object$1({
	content: array(object$1({
		type: literal("text"),
		text: string()
	})),
	structuredContent: object.optional(),
	isError: boolean().optional()
});
/**
* Register observe/execute through public tool APIs; dispose drains owned calls and transport.
* @param ctx - Plugin fiber with public Host tool, command and prompt services.
* @param options - Validated deployment configuration.
* @returns A synchronous reader of validated private Session associations.
*/
async function installPortableRuntime(ctx, options) {
	const controller = createRuntimeController({
		serverName,
		...options
	});
	ctx.sessionProjections.register(controller.projection);
	const journal = new SessionAuthority(join(options.stateDir, "dsh-sessions"), controller, options.authorityLockWaitMs, (session, currentCall) => {
		const state = ctx.sessionProjections.stateOf(session, "openubmc/runtime");
		if (state === void 0) throw new Error("openUBMC Session history projection is unavailable.");
		return Object.keys(state.runs).length > 0 || Object.keys(state.uncertainCalls).length > 0 || Object.keys(state.pendingCalls).some((id) => id !== currentCall);
	});
	let client;
	let connecting;
	const makeTransport = () => new StdioClientTransport({
		command: options.python,
		args: [
			"-B",
			join(options.payload, "runtime_stdio.py"),
			"--entry",
			join(options.workflow, "openubmc-debug/scripts/target_runtime_mcp.py")
		],
		cwd: options.workflow,
		env: {
			...scrubbedParentEnv(),
			OPENUBMC_TARGET_RUNTIME_INTERFACE_PROFILE: "agent",
			OPENUBMC_TARGET_RUNTIME_STATE_DIR: options.stateDir,
			OPENUBMC_CREDENTIALS_FILE: options.credentialsFile
		}
	});
	const stopping = new AbortController();
	const calls = /* @__PURE__ */ new Set();
	const outcomes = /* @__PURE__ */ new Map();
	ctx.effect(() => async () => {
		stopping.abort();
		await Promise.allSettled([...calls]);
		await connecting?.catch(() => void 0);
		await client?.close();
	});
	const connect = async () => {
		stopping.signal.throwIfAborted();
		if (client !== void 0) return client;
		if (connecting !== void 0) return connecting;
		const pending = (async () => {
			const next = new Client({
				name: "dsh-openubmc",
				version: "0.2.0"
			});
			next.onclose = () => {
				if (client === next) client = void 0;
			};
			try {
				await next.connect(makeTransport(), {
					timeout: options.toolCallTimeoutMs,
					signal: stopping.signal
				});
				if (stopping.signal.aborted) throw new Error("openUBMC plugin is stopping.");
				client = next;
				return next;
			} catch (error) {
				await next.close();
				throw error;
			}
		})();
		connecting = pending;
		try {
			return await pending;
		} finally {
			connecting = void 0;
		}
	};
	const advertised = await (await connect()).listTools();
	if (JSON.stringify(advertised.tools.map((tool) => tool.name).sort()) !== JSON.stringify(["execute", "observe"])) throw new Error("openUBMC requires exactly the native observe/execute Agent interface.");
	const invoke = async (request) => {
		const session = request.execution.agent?.session;
		let dispatchStatus = "not-started";
		let result;
		if (session === void 0) throw new Error("openUBMC requires a trusted Host Session.");
		const run = async () => {
			try {
				const prepared = await journal.update(session, request.execution.callId, (state) => {
					controller.prepare(request, state);
					if (request.toolName !== "execute") return state;
					return journal.fold(state, authorityInput({
						type: "tool/call",
						data: {
							turn: 0,
							step: 0,
							callId: request.execution.callId,
							name: publicToolName(serverName, "execute"),
							arguments: JSON.stringify(request.arguments)
						}
					}));
				});
				if (!controller.prepare(request, prepared)) {
					const revision = journal.read(session).revision;
					await controller.requestAuthorization(ctx, request, async (arguments_) => {
						await journal.update(session, request.execution.callId, (state) => {
							if (journal.read(session).revision !== revision) throw new Error("Session authority changed while authorization was pending. Propose the task again.");
							return journal.fold(state, authorityInput({
								type: "openubmc/authorization",
								data: {
									callId: request.execution.callId,
									arguments: arguments_
								}
							}));
						});
					});
				}
				const signal = AbortSignal.any([request.execution.signal, stopping.signal]);
				if (request.toolName === "execute" && request.arguments.kind === "start") await options.captureWorkspace?.(session);
				request.metadata.taskId = session.id;
				const connected = await connect();
				result = resultSchema.parse(await journal.dispatch(session, request.execution.callId, (state) => {
					signal.throwIfAborted();
					if (!controller.prepare(request, state)) throw new Error("Target execution requires human authorization for this scope.");
					return state;
				}, () => {
					dispatchStatus = "unknown";
					return connected.callTool({
						name: request.toolName,
						arguments: request.arguments,
						_meta: request.metadata
					}, {
						signal,
						timeout: options.toolCallTimeoutMs
					});
				}));
				dispatchStatus = void 0;
			} catch (error) {
				result = {
					isError: true,
					content: [{
						type: "text",
						text: error instanceof Error ? error.message : String(error)
					}]
				};
			}
			const meta = { mcp: {
				serverName,
				toolName: request.toolName,
				...result.structuredContent === void 0 ? {} : { structuredContent: result.structuredContent },
				...dispatchStatus === void 0 ? {} : { dispatchStatus }
			} };
			if (request.toolName === "execute") await journal.update(session, request.execution.callId, (state) => journal.fold(state, authorityInput({
				type: "tool/result",
				data: {
					turn: 0,
					step: 0,
					message: createToolResultMessage({
						callId: request.execution.callId,
						content: result.content,
						isError: result.isError === true
					}),
					meta
				},
				surfaceOp: "append",
				sourceEventSeqs: []
			})));
			outcomes.set(request.execution.token, {
				result,
				meta
			});
			return result;
		};
		return request.toolName === "execute" ? journal.exclusive(session, run) : run();
	};
	ctx.on("tools/execute", async (execution, next) => {
		if (!advertised.tools.some((tool) => execution.name === publicToolName(serverName, tool.name))) return next();
		const result = await next();
		const outcome = outcomes.get(execution.token);
		outcomes.delete(execution.token);
		return result.isError && outcome !== void 0 ? {
			...result,
			meta: outcome.meta
		} : result;
	});
	for (const tool of advertised.tools) ctx.effect(() => ctx.tools.register({
		name: publicToolName(serverName, tool.name),
		description: tool.description ?? tool.name,
		parameters: tool.inputSchema,
		timeoutMs: options.toolCallTimeoutMs,
		output: {
			schema: { type: "object" },
			render: (_args, value) => {
				return [{
					type: "text",
					text: render(resultSchema.parse(value))
				}];
			},
			presentationMeta: (_args, value) => ({ mcp: {
				serverName,
				toolName: tool.name,
				structuredContent: resultSchema.parse(value).structuredContent ?? {}
			} })
		},
		execute: async (args, execution) => {
			if (stopping.signal.aborted) throw new Error("openUBMC plugin is stopping.");
			const call = invoke({
				serverName,
				toolName: tool.name,
				execution: {
					...execution,
					signal: AbortSignal.any([execution.signal, stopping.signal])
				},
				arguments: object.parse(args),
				sessionIdMetadataKey: "taskId",
				toolCallTimeoutMs: options.toolCallTimeoutMs,
				appliedPolicies: /* @__PURE__ */ new Map(),
				metadata: {}
			});
			calls.add(call);
			let result;
			try {
				result = await call;
			} finally {
				calls.delete(call);
			}
			if (result.isError) throw new Error(render(result));
			return result;
		}
	}));
	for (const name of [
		"target-authorize",
		"target-reconcile",
		"target-action"
	]) ctx.effect(() => ctx.commands.register({
		definitionId: CommandDefinitionId(`dsh-openubmc/${name}`),
		name,
		description: name === "target-authorize" ? "Authorize target execution for this Session" : name === "target-reconcile" ? "Permit one exact replay of an unacknowledged start" : "Continue an owned openUBMC Run",
		input: { hint: name === "target-authorize" ? "execute [target intent [delivery-strategy]] | revoke" : name === "target-reconcile" ? "<original-call-id>" : "<execute action JSON>" },
		handler: async (invocation) => {
			const session = invocation.agent.session;
			if (name === "target-action") {
				const action = controller.parseContinuation(JSON.parse(invocation.rawInput));
				const result = await ctx.tools.execute({
					name: publicToolName(serverName, "execute"),
					callId: ToolCallId(`command:${invocation.commandId}`),
					arguments: action,
					agent: invocation.agent,
					signal: invocation.signal
				});
				return {
					kind: result.isError ? "error" : "success",
					text: result.content.filter((block) => block.type === "text").map((block) => block.text).join("\n")
				};
			}
			const commit = async () => {
				if (name === "target-authorize") controller.commandGrant(invocation.rawInput.trim());
				else {
					const state = journal.read(session).state;
					const id = ToolCallId(invocation.rawInput.trim());
					if ((state.uncertainCalls[id] ?? state.pendingCalls[id])?.arguments.kind !== "start") throw new Error("Only an unacknowledged start can be replayed; reconcile an existing Run through execute control.");
				}
				await journal.update(session, void 0, (state) => {
					const pending = journal.fold(state, authorityInput({
						type: "command/run",
						data: {
							commandId: invocation.commandId,
							name,
							args: invocation.rawInput,
							source: { kind: "user" }
						}
					}));
					return journal.fold(pending, authorityInput({
						type: "command/done",
						data: {
							commandId: invocation.commandId,
							kind: "success"
						}
					}));
				});
			};
			if (name === "target-reconcile") await journal.exclusive(session, commit);
			else await commit();
			return {
				kind: "success",
				text: name === "target-reconcile" ? "One exact start replay authorized with its original Runtime identity." : invocation.rawInput.trim() === "revoke" ? "Target execution authority revoked for this Session." : "Target execution authorized within the selected Session scope."
			};
		}
	}));
	ctx.systemPrompt.section({
		name: "openubmc:workflow",
		order: ctx.systemPrompt.getSectionOrder("MCP_SERVERS"),
		text: controller.guidance
	});
	ctx.systemPrompt.context({
		name: "openubmc:runtime",
		order: ctx.systemPrompt.getSectionOrder("MCP_SERVERS"),
		text: (context) => context.agent === void 0 ? "" : controller.renderContext(journal.read(context.agent.session).state)
	});
	return (session) => journal.read(session).state;
}
function render(result) {
	return [...result.content.map((block) => block.text), ...result.structuredContent === void 0 ? [] : [JSON.stringify(result.structuredContent)]].join("\n");
}
z.object({ serverName: z.string().required().pattern(/^[A-Za-z0-9_-]{1,32}$/) });
const caseIdSchema = string().min(1).transform((value) => brandString(value));
const observationSchema = object$1({
	caseId: caseIdSchema,
	revision: number().int().nonnegative(),
	status: string().min(1).nullable(),
	operationStatus: string().min(1),
	toolName: string().min(1),
	isError: boolean(),
	inherited: boolean(),
	observedAtSeq: number().int().nonnegative().transform(SessionSeq),
	phaseRecords: array(json()).optional(),
	artifactRevisions: array(json()).optional(),
	evidenceRefs: array(json()),
	nextActions: array(string())
});
const viewSchema = object$1({
	inheritedEventCount: number().int().nonnegative().transform(SessionLogOffset).optional(),
	agentResults: array(object$1({
		id: string().transform((value) => brandString(value)),
		kind: _enum(["run", "observation"]),
		document: record$1(string(), json()),
		isError: boolean(),
		inherited: boolean(),
		observedAtSeq: number().int().nonnegative().transform(SessionSeq)
	})).optional(),
	cases: array(observationSchema),
	failure: string().nullable()
});
const metadataSchema = object$1({ mcp: object$1({
	serverName: string(),
	toolName: string().min(1),
	structuredContent: record$1(string(), json()).optional()
}) });
const agentSchema = "openubmc.target-runtime.v1/agent-envelope";
const contextSchema = "openubmc.target-runtime.v1/context-runtime";
const discriminatorSchema = object$1({ schema: literal(agentSchema) });
const envelopeSchema = object$1({
	schema: literal(agentSchema),
	case_id: string(),
	revision: number().int().nonnegative(),
	status: string().min(1),
	operation: object$1({
		name: string().min(1),
		status: string().min(1)
	}),
	evidence_refs: array(json()),
	next_actions: array(string()),
	phase_records: array(json()).optional(),
	artifact_revisions: array(json()).optional(),
	capsule: json().optional()
}).refine((value) => value.status === value.operation.status);
const caseReportSchema = union([object$1({
	schema: literal(contextSchema),
	case_id: caseIdSchema,
	revision: number().int().nonnegative(),
	status: string().min(1),
	evidence_refs: array(json()),
	next_actions: array(string()),
	phase_records: array(json()).optional(),
	artifact_revisions: array(json()).optional()
}).transform((value) => ({
	caseId: value.case_id,
	revision: value.revision,
	status: value.status,
	evidenceRefs: value.evidence_refs,
	nextActions: value.next_actions,
	...value.phase_records === void 0 ? {} : { phaseRecords: value.phase_records },
	...value.artifact_revisions === void 0 ? {} : { artifactRevisions: value.artifact_revisions }
})), object$1({
	schema: literal(`${contextSchema}/capsule`),
	case_id: caseIdSchema,
	case_revision: number().int().nonnegative(),
	status: string().min(1),
	next_actions: array(string()),
	phase_records: array(json()).optional(),
	artifact_revisions: array(json()).optional()
}).transform((value) => ({
	caseId: value.case_id,
	revision: value.case_revision,
	status: value.status,
	evidenceRefs: void 0,
	nextActions: value.next_actions,
	phaseRecords: value.phase_records,
	artifactRevisions: value.artifact_revisions
}))]).optional();
/**
* Create a rebuildable Case projection for one configured Runtime server.
* @param serverName - trusted bridge namespace whose structured results are observed.
* @returns pure fold with a checkpoint schema and a native client view.
*/
function createCasesProjection(serverName) {
	return {
		key: "openubmc/cases",
		stateSchema: object$1({
			serverName: literal(serverName),
			inheritedEventCount: number().int().nonnegative().transform(SessionLogOffset),
			view: viewSchema
		}),
		stateVersion: 2,
		init: (_header, inheritedEventCount) => ({
			serverName,
			inheritedEventCount,
			view: {
				cases: [],
				failure: null
			}
		}),
		apply(state, event) {
			if (event.type !== "tool/result" && event.type !== "openubmc/inspection") return state;
			const metadata = metadataSchema.safeParse(event.data.meta);
			if (!metadata.success || metadata.data.mcp.serverName !== serverName) return state;
			const structured = metadata.data.mcp.structuredContent;
			if (structured === void 0) return state;
			if ((metadata.data.mcp.toolName === "execute" ? runTurnSchema.safeParse(structured) : metadata.data.mcp.toolName === "observe" ? observationReceiptSchema.safeParse(structured) : void 0)?.success) {
				const kind = metadata.data.mcp.toolName === "execute" ? "run" : "observation";
				const id = kind === "run" ? structured.run_id : structured.receipt_id;
				if (typeof id !== "string") return state;
				return {
					...state,
					view: {
						...state.view,
						failure: null,
						agentResults: [...(state.view.agentResults ?? []).filter((item) => item.id !== id), {
							id: brandString(id),
							kind,
							document: structured,
							isError: event.data.message.isError === true,
							inherited: event.seq < state.inheritedEventCount,
							observedAtSeq: event.seq
						}]
					}
				};
			}
			const envelope = Object.hasOwn(structured, "agent_envelope") ? structured.agent_envelope : structured;
			if (!discriminatorSchema.safeParse(envelope).success) return state;
			const invalid = () => ({
				...state,
				view: {
					...state.view,
					failure: `Invalid openUBMC Case metadata at event ${event.seq}.`
				}
			});
			const parsed = envelopeSchema.safeParse(envelope);
			if (!parsed.success) return invalid();
			const value = parsed.data;
			if (value.case_id === "") return state;
			const report = caseReportSchema.safeParse(structured.schema === contextSchema ? structured : value.capsule);
			if (!report.success) return invalid();
			const caseReport = report.data;
			const capsule = caseReportSchema.safeParse(value.capsule);
			if (!capsule.success || capsule.data !== void 0 && (capsule.data.caseId !== value.case_id || capsule.data.revision !== value.revision)) return invalid();
			const artifactRevisions = caseReport?.artifactRevisions ?? capsule.data?.artifactRevisions;
			if (value.operation.name !== metadata.data.mcp.toolName || caseReport !== void 0 && (caseReport.caseId !== value.case_id || caseReport.revision !== value.revision)) return invalid();
			const previous = state.view.cases.find((c) => c.caseId === value.case_id);
			const isError = event.data.message.isError === true;
			const reportsRecovery = isError || !["runtime_status", "evidence_read"].includes(value.operation.name);
			const observation = {
				caseId: brandString(value.case_id),
				revision: value.revision,
				status: caseReport?.status ?? previous?.status ?? null,
				operationStatus: value.status,
				toolName: metadata.data.mcp.toolName,
				isError,
				inherited: event.seq < state.inheritedEventCount || previous?.inherited === true && caseReport?.evidenceRefs === void 0,
				observedAtSeq: event.seq,
				evidenceRefs: caseReport?.evidenceRefs ?? (reportsRecovery && value.evidence_refs.length > 0 ? value.evidence_refs : previous?.evidenceRefs ?? []),
				...(caseReport?.phaseRecords ?? previous?.phaseRecords) === void 0 ? {} : { phaseRecords: caseReport?.phaseRecords ?? previous?.phaseRecords },
				...(artifactRevisions ?? previous?.artifactRevisions) === void 0 ? {} : { artifactRevisions: artifactRevisions ?? previous?.artifactRevisions },
				nextActions: caseReport?.nextActions ?? (reportsRecovery ? value.next_actions : previous?.nextActions ?? [])
			};
			return {
				...state,
				view: {
					...state.view,
					cases: [...state.view.cases.filter((c) => c.caseId !== observation.caseId), observation],
					failure: null
				}
			};
		},
		wire: {
			viewSchema,
			view: (state) => ({
				...state.view,
				inheritedEventCount: state.inheritedEventCount
			})
		}
	};
}
/**
* Install historical queries with optional provider-owned Run observations.
* @param ctx - Context with command and projection registries.
* @param config - Trusted Runtime namespace.
* @param readRuns - Portable provider's latest recorded Turns, including native command results.
*/
function installCaseQueries(ctx, config, readRuns) {
	ctx.sessionProjections.register(createCasesProjection(config.serverName));
	ctx.commands.register({
		definitionId: CommandDefinitionId("@deepseek-ai/dsh-experimental-openubmc-cases/run"),
		name: "run",
		description: "View recorded openUBMC Runs and observation receipts",
		input: { hint: "[run-or-receipt-id]" },
		handler: (invocation) => {
			const state = ctx.sessionProjections.stateOf(invocation.agent.session, "openubmc/cases");
			if (state === void 0) throw new Error("openUBMC observation projection is not registered");
			const query = invocation.rawInput.trim();
			const portable = readRuns?.(invocation.agent.session) ?? [];
			const lines = [...(state.view.agentResults ?? []).filter((item) => (query === "" || item.id === query) && !portable.some((run) => run.run_id === item.id)).map((item) => `${item.inherited ? "Inherited" : "Session"} observation at event ${item.observedAtSeq}: ${JSON.stringify(item.document)}`), ...portable.filter((run) => query === "" || run.run_id === query).map((run) => `Session observation: ${JSON.stringify(run)}`)];
			return {
				kind: query !== "" && lines.length === 0 ? "error" : "success",
				text: lines.length === 0 ? "No matching openUBMC Run or receipt has been observed." : lines.join("\n")
			};
		}
	});
	ctx.commands.register({
		definitionId: CommandDefinitionId("@deepseek-ai/dsh-experimental-openubmc-cases"),
		name: "case",
		description: "View observed openUBMC Cases",
		input: { hint: "[case-id]" },
		handler: (invocation) => {
			const query = invocation.rawInput.trim();
			const state = ctx.sessionProjections.stateOf(invocation.agent.session, "openubmc/cases");
			if (state === void 0) throw new Error("openUBMC Case projection is not registered");
			const observed = state.view.cases.filter((c) => query === "" || c.caseId === query);
			if (query !== "" && observed.length === 0) return {
				kind: "error",
				text: `No observed openUBMC Case matches ${query}. Usage: /case [case-id]`
			};
			const lines = observed.flatMap((c) => [
				`${c.caseId} | Case status ${c.status ?? "unreported"} | revision ${c.revision} | operation ${c.operationStatus} | ${c.isError ? "failed" : "succeeded"} | ${c.inherited ? "inherited observation" : "session observation"}`,
				`Tool: ${c.toolName}`,
				`Evidence: ${JSON.stringify(c.evidenceRefs)}`,
				`Phases: ${JSON.stringify(c.phaseRecords ?? [])}`,
				`Artifacts: ${JSON.stringify(c.artifactRevisions ?? [])}`,
				`Next actions: ${c.nextActions.join(", ") || "none reported"}`
			]);
			return {
				kind: state.view.failure === null ? "success" : "error",
				text: [...lines.length === 0 ? ["No openUBMC Case has been observed in this session."] : ["Observed openUBMC Cases (last tool results; Runtime state may have changed).", ...lines], ...state.view.failure === null ? [] : [state.view.failure]].join("\n")
			};
		}
	});
}
//#endregion
//#region scripts/openubmc/local-process.ts
/** Bounded private JSON workers and owned loopback page processes. @module */
const record = record$1(string(), json());
function stopTree(pid) {
	try {
		process.kill(pid, "SIGSTOP");
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ESRCH") return;
		throw error;
	}
	let children;
	try {
		children = readFileSync(`/proc/${pid}/task/${pid}/children`, "utf8");
	} catch (_error) {
		children = "";
	}
	for (const child of children.trim().split(/\s+/u).filter(Boolean)) stopTree(Number(child));
	try {
		process.kill(pid, "SIGKILL");
	} catch (error) {
		if (!(error instanceof Error && "code" in error && error.code === "ESRCH")) throw error;
	}
}
/**
* Send Host-selected JSON through stdin; discard stderr and join process exit on stop.
* @param python - Selected Python executable.
* @param script - Owned worker file.
* @param input - Non-secret selectors and operation fields.
* @param timeoutMs - Complete process lifetime bound.
* @param onEvent - Callback for JSON events after the first response.
* @returns First-response, settlement and termination handles.
*/
function startLocalProcess(python, script, input, timeoutMs, onEvent) {
	const child = spawn(python, ["-B", script], {
		env: scrubbedParentEnv(),
		stdio: [
			"pipe",
			"pipe",
			"ignore"
		]
	});
	const first = Promise.withResolvers();
	let responded = false;
	let failure;
	let bytes = 0;
	const stop = () => {
		if (child.pid !== void 0 && child.exitCode === null) stopTree(child.pid);
	};
	const fail = (message) => {
		failure ??= new Error(message);
		stop();
	};
	const lines = createInterface({ input: child.stdout });
	child.stdout.on("data", (chunk) => {
		bytes += chunk.length;
		if (bytes > 1024 * 1024) fail("openUBMC local response exceeded 1 MiB.");
	});
	lines.on("line", (line) => {
		if (failure !== void 0) return;
		try {
			const value = record.parse(JSON.parse(line));
			if (!responded) {
				responded = true;
				first.resolve(value);
			} else onEvent?.(value);
		} catch (_error) {
			fail("openUBMC local worker returned an invalid response.");
		}
	});
	const timer = setTimeout(() => {
		fail("openUBMC local operation timed out.");
	}, timeoutMs);
	const done = new Promise((resolve, reject) => {
		child.once("error", () => {
			failure ??= /* @__PURE__ */ new Error("openUBMC could not launch the configured Python executable.");
		});
		child.once("close", (code) => {
			clearTimeout(timer);
			lines.close();
			const error = failure ?? (code === 0 && responded ? void 0 : /* @__PURE__ */ new Error("openUBMC local operation failed. Run /openubmc-doctor."));
			if (error !== void 0) {
				first.reject(error);
				reject(error);
			} else resolve();
		});
	});
	first.promise.catch(() => void 0);
	done.catch(() => void 0);
	child.stdin.on("error", () => {
		fail("openUBMC local worker closed its input.");
	});
	child.stdin.end(JSON.stringify(input) + "\n");
	return {
		first: first.promise,
		done,
		stop
	};
}
/** Replayable observations without retaining message or tool payloads in private records. */
const recordsProjection = {
	key: "openubmc/host-records",
	stateVersion: 1,
	stateSchema: object$1({
		inherited: number(),
		overflow: boolean(),
		measurements: array(object$1({
			invocation_ref: string(),
			run_ref: _null(),
			usage: object$1({
				input_tokens: number().optional(),
				output_tokens: number().optional(),
				cached_tokens: number().optional()
			})
		})),
		final: object$1({
			seq: number(),
			timestamp: number(),
			text: string()
		}).nullable()
	}),
	init: (_header, inherited) => ({
		inherited,
		overflow: false,
		measurements: [],
		final: null
	}),
	apply: (state, event) => {
		if (event.seq < state.inherited) return state;
		if (event.type === "turn/start") return {
			...state,
			final: null
		};
		if (event.type !== "assistant/message" && event.type !== "assistant/attempt") return state;
		const usage = event.type === "assistant/message" ? event.data.usage : void 0;
		const measurements = state.measurements.length >= 256 ? state.measurements : [...state.measurements, {
			invocation_ref: `dsh:settlement:${event.seq}`,
			run_ref: null,
			usage: usage === void 0 ? {} : {
				input_tokens: usage.inputTokens,
				output_tokens: usage.outputTokens,
				...usage.cacheReadTokens === void 0 ? {} : { cached_tokens: usage.cacheReadTokens }
			}
		}];
		let final = null;
		if (event.type === "assistant/message" && !event.data.interrupted && !event.data.message.content.some((block) => block.type === "tool-call")) {
			const text = event.data.message.content.flatMap((block) => block.type === "text" ? [block.text] : []).join("\n");
			if (Buffer.byteLength(text) <= 64 * 1024) final = {
				seq: event.seq,
				timestamp: event.time,
				text
			};
		}
		return {
			...state,
			measurements,
			overflow: state.overflow || state.measurements.length >= 256,
			final
		};
	}
};
//#endregion
//#region scripts/openubmc/local-admin.ts
/** Native DSH commands and setup tools for private openUBMC configuration. @module */
const configureInput = object$1({
	kind: _enum([
		"targets",
		"kb",
		"conan"
	]).default("targets"),
	focusTarget: union([ipv4(), ipv6()]).optional(),
	waitForSave: boolean().default(false)
}).strict();
const prepareInput = object$1({ capability: _enum([
	"runtime",
	"kb",
	"all"
]).default("all") }).strict();
const testInput = object$1({
	runId: string().min(1),
	repoRef: string().min(1),
	commandRef: string().min(1),
	argv: array(string().max(4096)).min(1).max(128),
	timeout: number().positive().max(3600).default(600)
}).strict();
const recordsInput = discriminatedUnion("command", [
	object$1({ command: literal("handoff") }).strict(),
	object$1({ command: literal("export") }).strict(),
	object$1({
		command: literal("verify"),
		file: string().min(1).max(128)
	}).strict(),
	object$1({
		command: literal("answer"),
		runId: string().min(1)
	}).strict(),
	object$1({
		command: literal("test"),
		test: testInput
	}).strict()
]);
/**
* Keep setup available while a Runtime or KB child cannot start.
* @param ctx - Owned plugin fiber and native command/tool registries.
* @param options - Private selectors and bounded local operation settings.
* @param retry - Mount only unavailable providers after an explicit repair.
* @returns Workers for trusted workspace capture, records and startup inspection.
*/
function installLocalAdmin(ctx, options, retry) {
	ctx.sessionProjections.register(recordsProjection);
	const active = /* @__PURE__ */ new Set();
	let stopping = false;
	const launch = (script, input, seconds, onEvent) => {
		if (stopping) throw new Error("openUBMC plugin is stopping.");
		const worker = startLocalProcess(options.python, join(options.payload, script), {
			...options,
			...input
		}, seconds * 1e3, onEvent);
		active.add(worker);
		worker.done.finally(() => {
			active.delete(worker);
		}).catch(() => void 0);
		return worker;
	};
	ctx.effect(() => async () => {
		stopping = true;
		for (const worker of active) worker.stop();
		await Promise.allSettled([...active].map((worker) => worker.done));
	});
	const run = async (input, script = "local_admin.py", seconds = options.setupTimeoutSeconds, signal) => {
		signal?.throwIfAborted();
		const worker = launch(script, input, seconds);
		signal?.addEventListener("abort", worker.stop, { once: true });
		try {
			const result = await worker.first;
			await worker.done;
			return result;
		} finally {
			signal?.removeEventListener("abort", worker.stop);
		}
	};
	const doctor = async () => {
		try {
			return await run({ command: "doctor" });
		} catch (_error) {
			return {
				ok: false,
				interpreter: false,
				error: "Local diagnostics unavailable. Check the configured Python executable in plugin settings."
			};
		}
	};
	const openConfiguration = async (args, agent) => {
		const worker = launch("local_admin.py", {
			command: "configure",
			...args
		}, options.configurationIdleSeconds + options.setupTimeoutSeconds, (event) => {
			if (!stopping && event.event === "configuration_saved" && args.waitForSave && agent !== void 0) agent.followup(createUserMessage({
				source: { kind: "openubmc-local" },
				content: [{
					type: "text",
					text: "Local openUBMC configuration activated. Continue the existing task at its next Runtime request; preserve Run and operation identities. This event grants no new device permission.\n" + JSON.stringify(event)
				}]
			}));
		});
		const first = await worker.first;
		return {
			...object$1({ url: url() }).parse(first),
			done: worker.done,
			stop: worker.stop
		};
	};
	const configure = async (args, agent) => ({ url: (await openConfiguration(args, agent)).url });
	const projection = (session) => {
		const state = ctx.sessionProjections.stateOf(session, "openubmc/host-records");
		if (state === void 0) throw new Error("openUBMC Host records projection unavailable.");
		return state;
	};
	const records = (session, input, signal) => run({
		...input,
		taskId: session.id,
		...projection(session).overflow ? {} : { measurements: projection(session).measurements },
		stateDir: options.stateDir
	}, "host_records.py", "test" in input ? 3610 : options.setupTimeoutSeconds, signal);
	const capture = (session) => run({
		command: "capture",
		taskId: session.id,
		cwd: session.header.cwd,
		stateDir: options.stateDir
	}, "host_records.py");
	const handlers = {
		"openubmc-configure": async (raw, agent) => {
			const args = raw.trim().startsWith("{") ? JSON.parse(raw) : { kind: raw.trim() || "targets" };
			return (await configure(configureInput.parse(args), agent)).url;
		},
		"openubmc-doctor": async () => JSON.stringify(await doctor(), null, 2),
		"openubmc-repair": async (raw) => {
			const result = await run({
				command: "prepare",
				...prepareInput.parse({ capability: raw.trim() || "all" })
			});
			await retry();
			return JSON.stringify(result, null, 2);
		},
		"openubmc-records": async (raw, agent, signal) => {
			const [action = "", ...rest] = raw.trim().split(/\s+/u);
			const tail = rest.join(" ");
			const input = action === "" ? { command: "handoff" } : action === "export" && !tail ? { command: "export" } : action === "verify" ? {
				command: "verify",
				file: tail
			} : action === "answer" ? {
				command: "answer",
				runId: tail
			} : action === "test" ? {
				command: "test",
				test: testInput.parse(JSON.parse(tail))
			} : void 0;
			if (input === void 0) throw new Error("Use /openubmc-records [export | verify <filename> | answer <run-id> | test <JSON>].");
			const value = await records(agent.session, input, signal);
			return JSON.stringify(value, null, 2);
		}
	};
	for (const [name, handler] of Object.entries(handlers)) ctx.effect(() => ctx.commands.register({
		definitionId: CommandDefinitionId(`dsh-openubmc/${name}`),
		name,
		description: {
			"openubmc-configure": "Open private target, knowledge or Conan settings",
			"openubmc-doctor": "Inspect local plugin, transport and configuration readiness",
			"openubmc-repair": "Repair owned local dependencies and retry unavailable providers",
			"openubmc-records": "Read, export, verify or recover current Session delivery records"
		}[name] ?? name,
		...name === "openubmc-doctor" ? {} : { input: { hint: name === "openubmc-configure" ? "[targets|kb|conan|JSON]" : name === "openubmc-repair" ? "[runtime|kb|all]" : "[export|verify <filename>|answer <run-id>|test <JSON>]" } },
		handler: async (invocation) => ({
			kind: "success",
			text: await handler(invocation.rawInput, invocation.agent, invocation.signal)
		})
	}));
	for (const [name, parameters, execute] of [
		[
			"openubmc_setup_status",
			object$1({}).strict(),
			doctor
		],
		[
			"openubmc_setup_prepare",
			prepareInput,
			async (input) => {
				const result = await run({
					command: "prepare",
					...prepareInput.parse(input)
				});
				await retry();
				return result;
			}
		],
		[
			"openubmc_setup_open_configuration",
			configureInput,
			async (input, agent) => configure(configureInput.parse(input), agent)
		],
		[
			"openubmc_records",
			recordsInput,
			async (input, agent) => records(agent.session, recordsInput.parse(input))
		]
	]) ctx.effect(() => ctx.tools.register({
		name,
		description: name === "openubmc_setup_status" ? "Check local openUBMC readiness without connecting to a device." : name === "openubmc_setup_prepare" ? "Repair private openUBMC dependencies; does not execute a device operation." : name === "openubmc_records" ? "Read this Session handoff, export or verify redacted records, run a test against its frozen repository, or read a prepared terminal answer. Test and answer records do not satisfy Gates or confirm delivery." : "Open private local account settings. Return the exact URL to the user. Never request passwords in chat.",
		parameters: record$1(string(), json()).parse(toJSONSchema(parameters)),
		timeoutMs: name === "openubmc_records" ? 361e4 : (options.setupTimeoutSeconds + 10) * 1e3,
		output: {
			schema: { type: "object" },
			render: (_args, value) => [{
				type: "text",
				text: JSON.stringify(value)
			}]
		},
		execute: async (input, execution) => {
			if (execution.agent === void 0) throw new Error("A trusted DSH Session is required.");
			if (name === "openubmc_records") return records(execution.agent.session, recordsInput.parse(input), execution.signal);
			return execute(input, execution.agent);
		}
	}));
	ctx.on("agent/turn-stopping", async ({ agent }) => {
		if (stopping) return;
		const last = projection(agent.session).final;
		if (last === null) return;
		try {
			await records(agent.session, {
				command: "delivery",
				event: {
					id: `dsh:${agent.session.id}:${last.seq}`,
					timestamp: last.timestamp,
					text: last.text
				}
			});
		} catch (_error) {
			ctx.logger.warn("openUBMC delivery acknowledgement unavailable; retain the Runtime records.");
		}
	});
	return {
		run,
		capture,
		records,
		openConfiguration,
		retryProviders: retry
	};
}
//#endregion
//#region scripts/openubmc/configuration-web.ts
/** Authenticated same-origin access to owned private configuration pages. @module */
/**
* Serve only owned loopback pages after the composition's authentication and Origin checks.
* @param ctx - Optional Web composition fiber.
* @param admin - Owner of local page processes and their lifetime.
* @param timeoutMs - Configured local request budget.
*/
function installConfigurationWeb(ctx, admin, timeoutMs) {
	const pages = /* @__PURE__ */ new Map();
	const opening = /* @__PURE__ */ new Map();
	const requests = /* @__PURE__ */ new Set();
	let stopping = false;
	const isStopping = () => stopping;
	ctx.effect(() => async () => {
		stopping = true;
		for (const request of requests) request.abort();
		for (const page of pages.values()) page.stop();
		await Promise.allSettled([...pages.values()].map((page) => page.done));
	});
	ctx.effect(() => ctx.webServer.register({
		kind: "prefix",
		path: "/openubmc",
		handler: async (req, res) => {
			res.setHeader("cache-control", "no-store");
			res.setHeader("referrer-policy", "no-referrer");
			res.setHeader("x-content-type-options", "nosniff");
			const rejected = Reflect.get(ctx, "connection").requestRejection(req);
			if (rejected !== void 0) {
				res.writeHead(rejected);
				res.end();
				return;
			}
			if (stopping) {
				res.writeHead(503);
				res.end();
				return;
			}
			if (req.method !== "GET" && req.method !== "POST") {
				res.writeHead(405, { allow: "GET, POST" });
				res.end();
				return;
			}
			const url = new URL(String(req.url), "http://localhost");
			if (url.pathname === "/openubmc" && req.method === "GET") {
				const kind = url.searchParams.get("kind") ?? "targets";
				if (kind !== "targets" && kind !== "kb" && kind !== "conan") {
					res.writeHead(400);
					res.end();
					return;
				}
				let pending = opening.get(kind);
				if (pending === void 0) {
					pending = (async () => {
						const page = await admin.openConfiguration({
							kind,
							waitForSave: false
						});
						if (isStopping()) {
							page.stop();
							throw new Error("Plugin stopped");
						}
						const id = randomUUID();
						pages.set(id, page);
						page.done.finally(() => {
							pages.delete(id);
							opening.delete(kind);
						}).catch(() => void 0);
						return `./openubmc/${id}/${new URL(page.url).hash}`;
					})();
					opening.set(kind, pending);
					pending.catch(() => {
						opening.delete(kind);
					});
				}
				try {
					res.writeHead(303, { location: await pending });
					res.end();
				} catch (_error) {
					res.writeHead(503);
					res.end("Use /openubmc-doctor to inspect local setup.");
				}
				return;
			}
			const match = /^\/openubmc\/([a-f0-9-]+)(\/.*)$/u.exec(url.pathname);
			const id = match?.[1];
			const path = match?.[2];
			const page = id === void 0 ? void 0 : pages.get(id);
			if (page === void 0 || path === void 0) {
				res.writeHead(404);
				res.end();
				return;
			}
			const origin = new URL(page.url).origin;
			const headers = { origin };
			for (const name of ["content-type", "x-openubmc-session"]) {
				const value = req.headers[name];
				if (typeof value === "string") headers[name] = value;
			}
			const controller = new AbortController();
			requests.add(controller);
			const abort = () => {
				if (!res.writableEnded) controller.abort();
			};
			res.once("close", abort);
			try {
				const body = req.method === "POST" ? await readBody(req) : void 0;
				if (body === null) {
					res.writeHead(413);
					res.end();
					return;
				}
				const target = new URL(origin);
				target.pathname = path;
				const upstream = await fetch(target, {
					method: req.method,
					headers,
					...body === void 0 ? {} : { body: new Uint8Array(body) },
					redirect: "error",
					signal: AbortSignal.any([controller.signal, AbortSignal.timeout(timeoutMs)])
				});
				res.statusCode = upstream.status;
				for (const name of ["content-type", "content-security-policy"]) {
					const value = upstream.headers.get(name);
					if (value !== null) res.setHeader(name, value);
				}
				const bytes = Buffer.from(await upstream.arrayBuffer());
				if (path === "/api/plugin" && req.method === "POST" && upstream.ok) {
					const result = JSON.parse(bytes.toString("utf8"));
					if (typeof result === "object" && result !== null && "repaired" in result && result.repaired === true) await admin.retryProviders();
				}
				res.end(bytes);
			} catch (_error) {
				if (!res.writableEnded) {
					res.writeHead(502);
					res.end();
				}
			} finally {
				requests.delete(controller);
				res.off("close", abort);
			}
		}
	}));
}
async function readBody(req) {
	const chunks = [];
	let size = 0;
	for await (const chunk of req) {
		size += chunk.length;
		if (size > 1024 * 1024) {
			req.resume();
			return null;
		}
		chunks.push(chunk);
	}
	return Buffer.concat(chunks, size);
}
//#endregion
//#region scripts/openubmc/skill-resources.ts
/** Private, immutable Skill resources with installation-relative command paths. @module */
/**
* Materialize a verified resource generation outside the installed package.
* Every Markdown file uses the same generation's paths; script bytes are unchanged.
* Existing generations are verified and never overwritten, including during concurrent mounts.
* @param workflow - Integrity-checked packaged workflow directory.
* @param stateDir - Private installation state directory.
* @param skills - Manifest-selected logical names and physical paths.
* @param environmentSkill - DSH-owned replacement for the environment instructions.
* @returns Absolute root retained across plugin disposal and package updates.
*/
async function prepareSkillResources(workflow, stateDir, skills, environmentSkill) {
	const files = /* @__PURE__ */ new Map();
	const executable = /* @__PURE__ */ new Set();
	const collect = async (directory, prefix) => {
		for (const entry of await readdir(directory, { withFileTypes: true })) {
			const name = prefix + entry.name;
			if (entry.isDirectory()) await collect(join(directory, entry.name), name + "/");
			else if (entry.isFile()) {
				files.set(name, await readFile(join(directory, entry.name)));
				if ((await lstat(join(directory, entry.name))).mode & 64) executable.add(name);
			} else throw new Error(`openUBMC Skill resource must be a regular file: ${name}`);
		}
	};
	await collect(workflow, "");
	const environment = skills.find((skill) => skill.name === "openubmc-environment-setup");
	if (environment !== void 0) files.set(environment.path + "/SKILL.md", await readFile(environmentSkill));
	const hash = createHash("sha256").update("dsh-openubmc/skill-resources/v1\0").update(resolve(workflow)).update(JSON.stringify(skills));
	for (const [name, bytes] of [...files].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)) hash.update(`\0${name}\0${executable.has(name)}\0`).update(bytes);
	const parent = join(stateDir, "skill-resources");
	const destination = join(parent, hash.digest("hex"));
	const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
	const aliases = skills.flatMap((skill) => [skill.name, skill.path].map((name) => [name, join(destination, skill.path)]));
	const paths = new Map(aliases);
	const pattern = new RegExp("(?:/root/\\.agents/skills/|\\$HOME/\\.agents/skills/|~/\\.agents/skills/)(" + [...paths.keys()].sort((left, right) => right.length - left.length).map(escape).join("|") + ")(?![\\w-])", "gu");
	const rewrite = (body) => body.replace(pattern, (_match, alias) => {
		const path = paths.get(alias);
		if (path === void 0) throw new Error("openUBMC Skill alias is unavailable.");
		return path;
	});
	const generated = new Map([...files].map(([name, bytes]) => [name, name.endsWith(".md") ? Buffer.from(rewrite(bytes.toString("utf8"))) : bytes]));
	const verify = async () => {
		if (!(await lstat(destination)).isDirectory() || (await lstat(destination)).isSymbolicLink()) throw new Error("openUBMC Skill resource directory is invalid; restore the private resource generation.");
		for (const [name, bytes] of generated) {
			const parents = name.split("/").slice(0, -1);
			for (let index = 1; index <= parents.length; index++) {
				const status = await lstat(join(destination, ...parents.slice(0, index)));
				if (!status.isDirectory() || status.isSymbolicLink()) throw new Error("openUBMC Skill resource contains a directory link.");
			}
			const path = join(destination, name);
			const status = await lstat(path);
			if (!status.isFile() || Boolean(status.mode & 64) !== executable.has(name) || !(await readFile(path)).equals(bytes)) throw new Error(`openUBMC Skill resource changed: ${name}; restore the private resource generation.`);
		}
	};
	await mkdir(parent, {
		recursive: true,
		mode: 448
	});
	try {
		await lstat(destination);
	} catch (error) {
		if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
		const staging = await mkdtemp(join(parent, ".pending-"));
		try {
			for (const [name, bytes] of generated) {
				const path = join(staging, name);
				await mkdir(dirname(path), {
					recursive: true,
					mode: 448
				});
				await writeFile(path, bytes, { mode: executable.has(name) ? 448 : 384 });
			}
			try {
				await rename(staging, destination);
			} catch (renameError) {
				if (!(renameError instanceof Error && "code" in renameError && ["EEXIST", "ENOTEMPTY"].includes(String(renameError.code)))) throw renameError;
			}
		} finally {
			await rm(staging, {
				recursive: true,
				force: true
			});
		}
	}
	await verify();
	return destination;
}
//#endregion
//#region scripts/openubmc/plugin.ts
/** Installable openUBMC bundle over the native DSH services. @module */
const payloadSchema = object$1({ skills: array(object$1({
	name: string().min(1),
	path: string().min(1)
})).min(1) });
const frontmatterSchema = object$1({
	description: string().min(1),
	"disable-model-invocation": boolean().optional(),
	"user-invocable": boolean().optional()
});
function parseSkill(raw) {
	const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(raw);
	if (match?.[1] === void 0) throw new Error("openUBMC Skill requires YAML frontmatter.");
	return {
		metadata: frontmatterSchema.parse(load(match[1])),
		content: raw.slice(match[0].length).trim()
	};
}
function resolveOptions(config) {
	if (process.platform !== "linux") throw new Error("openUBMC supports Linux and WSL hosts.");
	if (config.node === void 0 && (isSea() || Object.hasOwn(process.versions, "electron"))) throw new Error("openUBMC needs a standalone Node executable in config.node for this host.");
	const node = config.node ?? process.execPath;
	if (!isAbsolute(node)) throw new Error("openUBMC config.node must be an absolute executable path.");
	const required = Math.max(config.operationDeadlineSeconds, config.observationDeadlineSeconds) * 1e3 + config.completionGraceMs;
	if (config.toolCallTimeoutMs < required) throw new Error(`openUBMC toolCallTimeoutMs must be at least ${required}.`);
	return {
		node,
		python: config.python,
		kbEnabled: config.kbEnabled,
		authorityLockWaitMs: config.authorityLockWaitMs,
		operationDeadlineSeconds: config.operationDeadlineSeconds,
		observationDeadlineSeconds: config.observationDeadlineSeconds,
		completionGraceMs: config.completionGraceMs,
		toolCallTimeoutMs: config.toolCallTimeoutMs,
		setupTimeoutSeconds: config.setupTimeoutSeconds,
		configurationIdleSeconds: config.configurationIdleSeconds,
		...config.kbConfigFile === void 0 ? {} : { kbConfigFile: resolve(config.kbConfigFile) },
		credentialsFile: resolve(config.credentialsFile ?? dshHomePath("credentials.env")),
		stateDir: resolve(config.stateDir ?? dshHomePath("openubmc-agent-state"))
	};
}
/**
* Mount packaged workflows and the existing native adapters under one owned fiber.
* @param ctx - Profile plugin context; disposal removes all child registrations.
* @param config - Validated deployment configuration.
*/
async function apply(ctx, config) {
	const options = resolveOptions(config);
	const payload = fileURLToPath(new URL("../payload/", import.meta.url));
	const workflow = join(payload, "workflow");
	const mountSkills = async () => {
		const manifest = payloadSchema.parse(JSON.parse(await readFile(join(payload, "skills.json"), "utf8")));
		const resources = await prepareSkillResources(workflow, options.stateDir, manifest.skills, join(payload, "environment-skill.md"));
		const candidates = await Promise.all(manifest.skills.map(async (skill) => {
			const directory = join(resources, skill.path);
			const path = join(directory, "SKILL.md");
			const { metadata } = parseSkill(await readFile(path, "utf8"));
			return {
				name: skill.name,
				description: metadata.description,
				path,
				locator: path,
				source: "bundled",
				provider: "openubmc-packaged",
				rank: BUNDLED_SKILL_RANK,
				resourceBase: {
					kind: "directory",
					path: directory
				},
				invocation: {
					modelInvocable: metadata["disable-model-invocation"] !== true,
					userInvocable: metadata["user-invocable"] !== false
				}
			};
		}));
		const provider = {
			name: "openubmc-packaged",
			list: () => Promise.resolve(candidates),
			async get(candidate, lookup) {
				const { locator, rank: _rank, ...summary } = candidate;
				const { content } = parseSkill(await readFile(string().parse(locator), {
					encoding: "utf8",
					signal: lookup.signal
				}));
				return {
					...summary,
					content
				};
			}
		};
		ctx.skills.registerProvider(() => provider);
	};
	let skillsMounted = false;
	let runtimeMounted = false;
	let kbMounted = false;
	let mounting;
	const mount = () => {
		mounting ??= (async () => {
			let status;
			try {
				status = await admin.run({ command: "doctor" });
			} catch (_error) {
				ctx.logger.warn("openUBMC local environment unavailable; check the configured Python executable and /openubmc-doctor.");
				return;
			}
			if (status.ok === false) {
				ctx.logger.warn("openUBMC local diagnostics unavailable; use /openubmc-doctor to inspect interpreter readiness.");
				return;
			}
			if (status.integrity !== true) {
				ctx.logger.warn("openUBMC package integrity failed; reinstall a verified archive. Local setup remains available.");
				return;
			}
			if (!skillsMounted) {
				await mountSkills();
				skillsMounted = true;
			}
			if (!runtimeMounted) {
				const fiber = ctx.plugin({
					name: "openubmc-native-runtime",
					apply: async (child) => {
						const authority = await installPortableRuntime(child, {
							...options,
							payload,
							workflow,
							captureWorkspace: admin.capture
						});
						installCaseQueries(child, { serverName: "openubmc-target-runtime" }, (session) => Object.values(authority(session).runs).filter((run) => run !== void 0));
					}
				});
				try {
					await fiber.await();
					runtimeMounted = true;
				} catch (_error) {
					await fiber.dispose();
					ctx.logger.warn("openUBMC Runtime unavailable; use /openubmc-doctor or /openubmc-repair runtime.");
				}
			}
			if (options.kbEnabled && !kbMounted) {
				const entry = object$1({ entry: string() }).parse(await admin.run({ command: "kb-entry" })).entry;
				const fiber = ctx.plugin(mcp, {
					serverName: "openubmc-kb",
					transport: "stdio",
					command: options.node,
					args: [entry],
					cwd: resolve(entry, "../.."),
					...options.kbConfigFile === void 0 ? {} : { env: { OPENUBMC_KB_CONFIG: options.kbConfigFile } },
					failOnStartupError: true,
					toolCallTimeoutMs: options.toolCallTimeoutMs
				});
				try {
					await fiber.await();
					kbMounted = true;
				} catch (_error) {
					await fiber.dispose();
					ctx.logger.warn("openUBMC knowledge service unavailable; use /openubmc-doctor or /openubmc-repair kb.");
				}
			}
		})().finally(() => {
			mounting = void 0;
		});
		return mounting;
	};
	const admin = installLocalAdmin(ctx, {
		...options,
		payload
	}, mount);
	ctx.inject(["webServer", "connection"], (web) => {
		installConfigurationWeb(web, admin, options.setupTimeoutSeconds * 1e3);
	});
	await mount();
}
//#endregion
export { apply };
