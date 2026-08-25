const { join } = require("path");
const fs = require("fs");
require("dotenv").config();

const USERS_FILE_PATH = join("config", "users.json");
const ALARMS_FILE_PATH = join("config", "alarms.json");

class BotStore {
	constructor() {
		this.adminId = process.env.ADMIN_ID || 0;
		this.historyLimit = process.env.HISTORY_MAX_LEN || 5;
		this.users = {};
		this.alarms = {};
		this.currencyList = {};

		this.loadInitialData();
	}

	loadInitialData() {
		// Загрузка списка валют
		if (process.env.CURRENCY_LIST) {
			const currencyList = process.env.CURRENCY_LIST.split(",");
			if (currencyList.length > 0 && process.env.STORE_PATH) {
				currencyList.forEach((iso) => {
					const path = join(process.env.STORE_PATH, `${iso}.json`);
					try {
						const data = fs.readFileSync(path, "utf8");
						this.currencyList[iso] = JSON.parse(data) || {};
					} catch (err) {
						console.log(`Ошибка при чтении файла ${path}: ${err.message}`);
					}
				});
			}
		}

		// Загрузка пользователей
		try {
			const data = fs.readFileSync(USERS_FILE_PATH, "utf8");
			this.users = JSON.parse(data) || {};
		} catch (err) {
			if (err.code !== "ENOENT") {
				console.error("Ошибка загрузки users.json:", err);
			}
		}

		try {
			const data = fs.readFileSync(ALARMS_FILE_PATH, "utf8");
			this.alarms = JSON.parse(data) || {};
		} catch (err) {
			if (err.code !== "ENOENT") {
				console.error("Ошибка загрузки alarms.json:", err);
			}
		}
	}

	saveUsersToFile() {
		try {
			fs.writeFileSync(USERS_FILE_PATH, JSON.stringify(this.users, null, 2));
		} catch (err) {
			console.error(`Ошибка сохранения users.json: ${err}`);
		}

		try {
			fs.writeFileSync(ALARMS_FILE_PATH, JSON.stringify(this.alarms, null, 2));
		} catch (err) {
			console.error(`Ошибка сохранения alarms.json: ${err}`);
		}
	}

	saveAlarms() {
		try {
			fs.writeFileSync(ALARMS_FILE_PATH, JSON.stringify(this.alarms, null, 2));
		} catch (err) {
			console.error(`Ошибка сохранения alarms.json: ${err}`);
		}
	}

	saveCurrencyToFile(iso) {
		if (!process.env.STORE_PATH || !this.currencyList[iso]) return;

		const path = join(process.env.STORE_PATH, `${iso}.json`);
		try {
			fs.writeFileSync(
				path,
				JSON.stringify(this.currencyList[iso], null, 2),
				"utf8",
			);
		} catch (err) {
			console.error(`Ошибка сохранения ${iso}.json: ${err}`);
		}
	}

	storeUser(msg) {
		const userId = msg.from.id;
		if (!this.users[userId]) {
			this.users[userId] = {
				chatId: msg.chat.id,
				isBot: msg.from.is_bot,
				firstName: msg.from.first_name,
				lastName: msg.from.last_name,
				userName: msg.from.username,
				lang: msg.from.language_code,
				report: true,
				counter: 0,
			};
		}

		this.users[userId].counter = (this.users[userId].counter || 0) + 1;
		this.users[userId].chatId = msg.chat.id;
		this.saveUsersToFile();
	}

	logRates(iso, rates) {
		if (!this.currencyList[iso]) return;
		if (!this.currencyList[iso].history) this.currencyList[iso].history = [];

		this.currencyList[iso].history.push(rates);

		if (this.currencyList[iso].history.length > this.historyLimit) {
			this.currencyList[iso].history = [
				...this.currencyList[iso].history.slice(
					this.currencyList[iso].history.length - this.historyLimit,
					this.currencyList[iso].history.length,
				),
			];
		}
	}

	setAlarm(userId, iso, value, isDelta = false) {
		if (!this.currencyList[iso]) return false;

		const alarms = this.alarms[userId] || {};
		alarms[iso] = alarms[iso] || {};

		if (isDelta) {
			alarms[iso].delta = +value;
		} else {
			alarms[iso].value = +value;
		}

		this.alarms[userId] = alarms;
		return true;
	}

	getUser(userId) {
		return this.users[userId];
	}

	removeUser(userId) {
		if (!this.users[userId]) return false;

		delete this.users[userId];
		delete this.alarms[userId];
		this.saveUsersToFile();
		return true;
	}

	setUserReport(userId, state) {
		if (this.users[userId]) {
			this.users[userId].report = state === "enable";
			this.saveUsersToFile();
			return true;
		}
		return false;
	}
}

module.exports = { BotStore };
