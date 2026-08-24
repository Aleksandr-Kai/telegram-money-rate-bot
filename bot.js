const { isNumber } = require("chart.js/helpers");
const { BotStore } = require("./botstore");
const { buildCharts } = require("./chart");
const { requestCurrency } = require("./sber");
const tg = require("./tgservice");
require("dotenv").config();

const store = new BotStore();

if (!tg.BotInit(process.env.BOT_TOKEN, (msg) => store.storeUser(msg), store.adminId))
	return;

tg.AddHandler(
	/\/getrates/,
	(msg) => {
		const chatId = msg.chat.id;
		Object.keys(store.currencyList).forEach(async (iso) => {
			const data = store.currencyList[iso];
			const chartsImage = await buildCharts(data, iso);
			tg.SendImage(
				chatId,
				chartsImage,
				`${iso} (Купить: ${
					data.history[data.history.length - 1].rateSell
				}, Продать: ${
					data.history[data.history.length - 1].rateBuy
				}, Дельта: ${data.delta.toFixed(2)})`,
			);
		});
	},
	"Графики валют",
);

tg.AddHandler(
	/\/setalarm/,
	async (msg) => {
		const userId = msg.from.id;
		let [_, iso, value] = msg.text.split(" ");
		iso = iso?.toUpperCase();

		if (!store.currencyList[iso]) {
			await tg.SendMessage(userId, `Нет такой валюты '${iso}'`);
			return;
		}

		if (!isNumber(value)) {
			await tg.SendMessage(userId, `Не корректное значение '${value}'`);
			return;
		}

		store.setAlarm(userId, iso, value);

		await tg.SendMessage(userId, `Установлено`);
	},
	"/setalarm [ISO] [value] - задать значение предупреждения",
);

tg.AddHandler(
	/\/setdeltaalarm/,
	async (msg) => {
		const userId = msg.from.id;
		let [_, iso, value] = msg.text.split(" ");
		iso = iso?.toUpperCase();

		if (!store.currencyList[iso]) {
			await tg.SendMessage(userId, `Нет такой валюты '${iso}'`);
			return;
		}

		if (!isNumber(value)) {
			await tg.SendMessage(userId, `Не корректное значение '${value}'`);
			return;
		}

		store.setAlarm(userId, iso, value, true);

		await tg.SendMessage(userId, `Установлено`);
	},
	"/setdeltaalarm [ISO] [value] - предупреждение об изменении на значение value или больше",
);

tg.AddHandler(
	/\/report/,
	async (msg) => {
		const userId = msg.from.id;
		let [_, state] = msg.text.split(" ");

		if (state === undefined) {
			await tg.SendMessage(
				userId,
				`Информирование об изменениях min/max ${
					store.getUser(userId).report ? "РАЗРЕШЕНО" : "ЗАПРЕЩЕНО"
				}`,
			);
			return;
		}

		store.setUserReport(userId, state);

		await tg.SendMessage(userId, "Выполнено");
	},
	"/report [enable/disable] разрешить или запретить информирование об изменении min/max",
);

tg.AddHandler(
	/\/getalarms/,
	async (msg) => {
		const userId = msg.from.id;
		await tg.SendMessage(
			userId,
			JSON.stringify(store.alarms[userId] || {}, "", "\t"),
		);
	},
	"Получить настройки предупреждений",
);

tg.AddHandler(
	/\/getusers/,
	async (msg) => {
		const userId = msg.from.id;
		if (msg.isAdmin) {
			await tg.SendMessage(userId, JSON.stringify(store.users, "", "\t"));
		} else {
			console.log(`Запрос админских привелегий пользователь ${userId}`);
		}
	},
	"Получить список пользователей (АДМИН)",
);

tg.UpdateComands();

tg.use((msg) => store.storeUser(msg));

function checkAlarms(rateIso, rateSell, rateBuy) {
	// Приводим rateIso к верхнему регистру для единообразия
	const iso = rateIso.toUpperCase();

	for (const userId in store.alarms) {
		const userAlarms = store.alarms[userId];

		// Проверяем только указанную валюту (iso)
		if (!userAlarms.hasOwnProperty(iso)) continue;

		const threshold = userAlarms[iso].value;
		const delta = userAlarms[iso].delta;
		const prevSell = userAlarms[iso].prevSell || rateSell;
		const prevBuy = userAlarms[iso].prevBuy || rateBuy;

		if (
			delta &&
			(Math.abs(rateBuy - prevBuy) > delta || Math.abs(rateSell - prevSell) > delta)
		) {
			tg.SendMessage(
				userId,
				`${iso}: изменение курса более чем на ${delta}.\nКупить: ${rateSell}\nПродать: ${rateBuy}`,
			);
		}

		// Проверка для rateSell (покупка)
		if (
			(prevSell < threshold && rateSell >= threshold) ||
			(prevSell > threshold && rateSell <= threshold)
		) {
			tg.SendMessage(
				userId,
				`${iso}: курс для покупки пересек пороговое значение ${threshold}. Текущий курс: ${rateSell}`,
			);
		}

		// Проверка для rateBuy (продажа)
		if (
			(prevBuy < threshold && rateBuy >= threshold) ||
			(prevBuy > threshold && rateBuy <= threshold)
		) {
			tg.SendMessage(
				userId,
				`${iso}: курс для продажи пересек пороговое значение ${threshold}. Текущий курс: ${rateBuy}`,
			);
		}

		// Обновляем предыдущие значения
		store.alarms[userId][iso].prevSell = rateSell;
		store.alarms[userId][iso].prevBuy = rateBuy;
	}
} // checkAlarms

function reportRateEvent(event) {
	for (userId in store.users) {
		if (store.getUser(userId).report) {
			tg.SendMessage(userId, `${event.message} [${event.data.toFixed(2)}]`).catch(
				(error) => console.error("Ошибка при отправке rateEvent:", error),
			);
		}
	}
} // reportRateEvent

let SberPollingTimer;
function SberPolling() {
	// периодический опрос сбера
	requestCurrency((resp) => {
		if (resp.error) {
			tg.SendMessage(store.adminId, resp.error).catch((error) =>
				console.error("Ошибка при отправке сообщения:", error),
			);
			if (resp.decodedBody) {
				tg.SendMessage(store.adminId, resp.decodedBody).catch((error) =>
					console.error("Ошибка при отправке сообщения:", error),
				);
			}
			if (resp.data) {
				tg.SendMessage(store.adminId, resp.data).catch((error) =>
					console.error("Ошибка при отправке сообщения:", error),
				);
			}
			return;
		}
		const currencies = Object.keys(store.currencyList);
		// запрос к сберу
		currencies.forEach((cur) => {
			const { rateSell, rateBuy } = resp[cur].rateList[0];
			store.logRates(cur, {
				rateSell,
				rateBuy,
				timeStamp: Date.now(),
			});

			checkAlarms(cur, rateSell, rateBuy);

			if (
				!store.currencyList[cur].maxSell ||
				store.currencyList[cur].maxSell < rateSell
			) {
				store.currencyList[cur].maxSell = rateSell;
				reportRateEvent({
					message: `${cur}: обновлен максимум на покупку`,
					data: rateSell,
				});
			}
			if (
				!store.currencyList[cur].minSell ||
				store.currencyList[cur].minSell > rateSell
			) {
				store.currencyList[cur].minSell = rateSell;
				reportRateEvent({
					message: `${cur}: обновлен минимум на покупку`,
					data: rateSell,
				});
			}

			if (
				!store.currencyList[cur].maxBuy ||
				store.currencyList[cur].maxBuy < rateBuy
			) {
				store.currencyList[cur].maxBuy = rateBuy;
				reportRateEvent({
					message: `${cur}: обновлен максимум на продажу`,
					data: rateBuy,
				});
			}
			if (
				!store.currencyList[cur].minBuy ||
				store.currencyList[cur].minBuy > rateBuy
			) {
				store.currencyList[cur].minBuy = rateBuy;
				reportRateEvent({
					message: `${cur}: обновлен минимум на продажу`,
					data: rateBuy,
				});
			}

			const delta = rateSell - rateBuy;
			store.currencyList[cur].delta = delta;
			if (
				!store.currencyList[cur].maxDelta ||
				store.currencyList[cur].maxDelta < delta
			)
				store.currencyList[cur].maxDelta = delta;
			if (
				!store.currencyList[cur].minDelta ||
				store.currencyList[cur].minDelta > delta
			)
				store.currencyList[cur].minDelta = delta;

			store.saveCurrencyToFile(cur);
		});
	});

	if (SberPollingTimer) clearTimeout(SberPollingTimer);
	SberPollingTimer = setTimeout(
		SberPolling,
		(process.env.UPDATE_CURRENCY_INTERVAL_SEC || 3600) * 1000,
	);
}

SberPolling();

console.log(
	`Бот запущен. Интервал опроса сбера: ${process.env.UPDATE_CURRENCY_INTERVAL_SEC} секунд`,
);

for (const userId in store.users) {
	tg.SendMessage(userId, "Бот был перезапущен").catch((error) => {
		const tgError = error?.response?.body;

		if (
			tgError?.error_code === 403 &&
			tgError?.description?.includes("bot was blocked by the user")
		) {
			// 1. короткий лог
			console.warn(`User ${userId} blocked the bot`);

			// 2. информация о пользователе
			const user = store.users[userId];
			const name = user
				? `${user.firstName || ""} ${user.lastName || ""}`.trim()
				: null;

			// 3. уведомление админу
			tg.SendMessage(
				store.adminId,
				`Пользователь заблокировал бота:\n` +
					`id: ${userId}` +
					(name ? `\nимя: ${name}` : ""),
			).catch(() => {}); // тут молча, чтоб не зациклиться

			return;
		}

		// все остальные ошибки — одной строкой
		console.error(`Ошибка отправки сообщения пользователю ${userId}`);
	});
}
