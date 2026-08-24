const TelegramBot = require("node-telegram-bot-api");
const { getCurrentTime } = require("./utils/utils");

let bot;
const commands = [];
const middlewares = [];

function restartPolling(timeout) {
	if (timeout) {
		if (timeout < 10 || timeout % 10 == 0)
			console.log(`Перезапуск TelegramPolling через ${timeout}c...`);
		timeout--;
		setTimeout(() => {
			restartPolling(timeout);
		}, 1000);
		return;
	}

	console.log(`[${getCurrentTime()}] Старт TelegramPolling`);

	bot.startPolling()
		.then((data) => {
			if (data === null) {
				console.log("TelegramPolling восстановлен.");
				restartPolling._timeout = 10;
			} else {
				console.log("Не удалось запустить TelegramPolling.");
				if (restartPolling._timeout < 600) restartPolling._timeout *= 2;
			}
		})
		.catch((err) => console.log(err));
}

function BotInit(botToken, onStartCallback, adminId) {
	if (typeof botToken !== "string") {
		console.log(`BotInit: Не передан токен бота`);
		return;
	}

	bot = new TelegramBot(botToken, {
		polling: {
			interval: 300,
			autoStart: true,
		},
	});

	bot.on("polling_error", (error) => {
		console.error(`[${getCurrentTime()}] TelegramBot: ${error.message}`);

		// Выключаем polling
		console.log("Перезапуск TelegramPolling...");

		bot.stopPolling()
			.then(() => {
				if (!restartPolling._timeout) restartPolling._timeout = 10;
				restartPolling(restartPolling._timeout);
			})
			.catch((err) => console.log(err));
	});

	if (adminId)
		use((msg) => {
			msg.isAdmin = msg.from.id == adminId;
		});

	bot.onText(/\/start/, (msg) => {
		if (typeof onStartCallback === "function") onStartCallback(msg);
	});

	return true;
}

async function SendMessage(id, msg) {
	await bot.sendMessage(id, msg);
} // botSendMessage

async function SendImage(chatId, chartsImage, caption) {
	await bot.sendPhoto(chatId, chartsImage, { caption }).catch((error) => {
		console.error(`Ошибка отправки графика`, error);
	});
}

async function UpdateComands() {
	bot.setMyCommands(commands).catch((err) => console.log(commands));
}

function AddHandler(cmd, callback, description) {
	if (typeof callback !== "function") {
		console.log("AddHandler: callback должен быть функцией");
		return;
	}

	commands.push({
		command: cmd
			.toString()
			.replace(/^\/|\/$/g, "")
			.replace(/\\\//g, "/"),
		description,
	});

	bot.onText(cmd, (msg) => {
		middlewares.forEach((func) => func(msg));
		callback(msg);
	});
} // createHandler

function use(callback) {
	if (typeof callback !== "function") {
		console.log("use: callback должен быть функцией");
		return;
	}
	middlewares.push(callback);
}

module.exports = { BotInit, SendMessage, SendImage, UpdateComands, AddHandler, use };
