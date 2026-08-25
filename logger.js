const fs = require("fs");
const path = require("path");
const { getCurrentTime } = require("./utils/utils");

const LOG_FILE_PATH = path.join(__dirname, process.env.LOG_FILE_NAME || "bot.log");
const MAX_LOG_SIZE_BYTES = 5 * 1024 * 1024; // ротация лога, чтобы не забить диск на VPS

let initialized = false;

function rotateIfNeeded() {
	try {
		const { size } = fs.statSync(LOG_FILE_PATH);
		if (size > MAX_LOG_SIZE_BYTES) {
			fs.renameSync(LOG_FILE_PATH, `${LOG_FILE_PATH}.old`);
		}
	} catch (err) {
		if (err.code !== "ENOENT") console.error("Ошибка ротации лога:", err);
	}
}

function writeLine(level, args) {
	const message = args
		.map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg)))
		.join(" ");
	try {
		fs.appendFileSync(LOG_FILE_PATH, `[${getCurrentTime()}] ${level}: ${message}\n`);
	} catch (err) {
		// пишем оригинальным console.error, чтобы не зациклиться
		process.stderr.write(`Ошибка записи лога: ${err.message}\n`);
	}
}

function initLogging() {
	if (initialized) return;
	initialized = true;

	rotateIfNeeded();

	const original = {
		log: console.log.bind(console),
		error: console.error.bind(console),
		warn: console.warn.bind(console),
	};

	console.log = (...args) => {
		original.log(...args);
		writeLine("INFO", args);
	};

	console.error = (...args) => {
		original.error(...args);
		writeLine("ERROR", args);
	};

	console.warn = (...args) => {
		original.warn(...args);
		writeLine("WARN", args);
	};
}

function getLogFilePath() {
	return LOG_FILE_PATH;
}

module.exports = { initLogging, getLogFilePath };
