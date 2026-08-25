const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");
const AdmZip = require("adm-zip");
const tg = require("./tgservice");

const PROJECT_ROOT = __dirname;

// Эти пути никогда не перезаписываются архивом обновления: секреты, git,
// зависимости и рабочие данные бота (история курсов, пользователи, алармы)
const PROTECTED_TOP_LEVEL = new Set([".env", ".git", "node_modules", "history", "config"]);

// Ограничение Telegram Bot API на скачивание файлов ботом
const MAX_ARCHIVE_SIZE = 20 * 1024 * 1024;

function isSafeEntryName(entryName) {
	const normalized = path.normalize(entryName);
	if (path.isAbsolute(normalized) || normalized.split(path.sep).includes("..")) {
		return false;
	}
	const topLevel = normalized.split(path.sep)[0];
	return !PROTECTED_TOP_LEVEL.has(topLevel);
}

function applyUpdateArchive(archivePath) {
	const zip = new AdmZip(archivePath);
	const entries = zip.getEntries();

	const appliedFiles = [];
	let packageJsonChanged = false;

	for (const entry of entries) {
		if (entry.isDirectory) continue;

		if (!isSafeEntryName(entry.entryName)) {
			throw new Error(`Небезопасный или запрещённый путь в архиве: ${entry.entryName}`);
		}

		const destPath = path.join(PROJECT_ROOT, entry.entryName);
		fs.mkdirSync(path.dirname(destPath), { recursive: true });
		fs.writeFileSync(destPath, entry.getData());
		appliedFiles.push(entry.entryName);

		if (entry.entryName === "package.json" || entry.entryName === "package-lock.json") {
			packageJsonChanged = true;
		}
	}

	return { appliedFiles, packageJsonChanged };
}

function runNpmInstall() {
	return new Promise((resolve, reject) => {
		const child = spawn("npm", ["install"], {
			cwd: PROJECT_ROOT,
			stdio: "inherit",
		});
		child.on("exit", (code) => {
			if (code === 0) resolve();
			else reject(new Error(`npm install завершился с кодом ${code}`));
		});
		child.on("error", reject);
	});
}

function scheduleRestart() {
	const scriptPath = process.argv[1];
	const args = process.argv.slice(2);

	const child = spawn(process.execPath, [scriptPath, ...args], {
		cwd: PROJECT_ROOT,
		detached: true,
		stdio: "ignore",
		env: process.env,
	});
	child.unref();

	setTimeout(() => process.exit(0), 500);
}

async function handleUpdateDocument(msg, adminId) {
	const chatId = msg.chat.id;

	if (!adminId || msg.from.id != adminId) {
		console.log(`Попытка обновления от не-админа: ${msg.from.id}`);
		return;
	}

	const doc = msg.document;
	if (!doc) return;

	const fileName = doc.file_name || "";
	if (!/\.zip$/i.test(fileName)) {
		await tg.SendMessage(chatId, "Ожидается ZIP-архив с обновлением (.zip)");
		return;
	}

	if (doc.file_size && doc.file_size > MAX_ARCHIVE_SIZE) {
		await tg.SendMessage(chatId, "Файл слишком большой (лимит Telegram Bot API — 20МБ)");
		return;
	}

	await tg.SendMessage(chatId, "Загружаю архив обновления...");

	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "money-bot-update-"));
	let updateResult;

	try {
		const archivePath = await tg.DownloadDocument(doc.file_id, tmpDir);

		await tg.SendMessage(chatId, "Применяю обновление...");
		updateResult = applyUpdateArchive(archivePath);

		if (updateResult.appliedFiles.length === 0) {
			await tg.SendMessage(chatId, "Архив не содержит файлов для обновления.");
			return;
		}

		await tg.SendMessage(
			chatId,
			`Обновлено файлов: ${updateResult.appliedFiles.length}\n${updateResult.appliedFiles.join("\n")}`,
		);

		if (updateResult.packageJsonChanged) {
			await tg.SendMessage(
				chatId,
				"Обнаружены изменения зависимостей, выполняю npm install...",
			);
			await runNpmInstall();
		}
	} catch (error) {
		console.error("Ошибка обновления:", error);
		await tg.SendMessage(chatId, `Ошибка обновления: ${error.message}`).catch(() => {});
		return;
	} finally {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	}

	await tg.SendMessage(chatId, "Перезапускаю бота...");

	await tg.StopPolling().catch(() => {});
	scheduleRestart();
}

module.exports = { handleUpdateDocument };
