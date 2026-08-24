// index.js
const { BotStore } = require("./botstore");
const { buildCharts } = require("./chart");
const { requestCurrency } = require("./sber");
const EmailService = require("./emailService");
require("dotenv").config();

const store = new BotStore();
const email = new EmailService();

// ============================================
// ПРОВЕРКА АЛАРМОВ
// ============================================

function checkAlarms(iso, rateSell, rateBuy) {
	const alarms = store.alarms;
	let alertText = "";

	// Проходим по всем userId в alarm.json
	for (const userId in alarms) {
		const userAlarm = alarms[userId][iso];
		if (!userAlarm) continue;

		const threshold = userAlarm.value;
		const delta = userAlarm.delta;
		const prevSell = userAlarm.prevSell ?? rateSell;
		const prevBuy = userAlarm.prevBuy ?? rateBuy;

		// Проверка дельты
		if (
			delta &&
			(Math.abs(rateSell - prevSell) > delta || Math.abs(rateBuy - prevBuy) > delta)
		) {
			alertText += `📈 ${iso}: резкое изменение (>${delta})\n`;
			alertText += `Купить: ${prevSell} → ${rateSell}\n`;
			alertText += `Продать: ${prevBuy} → ${rateBuy}\n\n`;
		}

		// Пересечение порога для Sell
		if (
			(prevSell < threshold && rateSell >= threshold) ||
			(prevSell > threshold && rateSell <= threshold)
		) {
			alertText += `⚠️ ${iso}: курс ПОКУПКИ пересек порог ${threshold}\n`;
			alertText += `Текущий: ${rateSell}\n\n`;
		}

		// Пересечение порога для Buy
		if (
			(prevBuy < threshold && rateBuy >= threshold) ||
			(prevBuy > threshold && rateBuy <= threshold)
		) {
			alertText += `⚠️ ${iso}: курс ПРОДАЖИ пересек порог ${threshold}\n`;
			alertText += `Текущий: ${rateBuy}\n\n`;
		}

		// Обновляем prev-значения в памяти
		alarms[userId][iso].prevSell = rateSell;
		alarms[userId][iso].prevBuy = rateBuy;
	}

	// Если есть что отправить — шлем одно письмо
	if (alertText) {
		email.send(`🚨 АЛАРМ: ${iso}`, alertText.trim());
		store.saveAlarms(); // Сохраняем обновленные prev-значения
	}
}

// ============================================
// ОТПРАВКА СОБЫТИЙ (min/max)
// ============================================

async function reportRateEvent(event) {
	await email.send(
		`📊 ${event.message}`,
		`${event.message}\nЗначение: ${event.data.toFixed(2)}\nВремя: ${new Date().toLocaleString("ru-RU")}`,
	);
}

// ============================================
// ЕЖЕДНЕВНЫЙ ОТЧЕТ
// ============================================

let lastReportDate = null;

async function sendDailyReport() {
	const today = new Date().toLocaleDateString("ru-RU");
	if (lastReportDate === today) return;

	console.log(`📊 Формируем отчет за ${today}...`);

	let reportText = `ЕЖЕДНЕВНЫЙ ОТЧЕТ ПО КУРСАМ\nДата: ${today}\n`;
	reportText += `Время: ${new Date().toLocaleTimeString("ru-RU")}\n\n`;

	const currencies = Object.keys(store.currencyList);
	let chartsSent = false;

	for (const iso of currencies) {
		const data = store.currencyList[iso];
		if (!data?.history?.length) continue;

		const last = data.history[data.history.length - 1];
		reportText += `💱 ${iso}\n`;
		reportText += `Купить: ${last.rateSell} / Продать: ${last.rateBuy}\n`;
		reportText += `Дельта: ${data.delta?.toFixed(2)}\n`;
		reportText += `Диапазон (покупка): ${data.minSell?.toFixed(2)} – ${data.maxSell?.toFixed(2)}\n`;
		reportText += `Диапазон (продажа): ${data.minBuy?.toFixed(2)} – ${data.maxBuy?.toFixed(2)}\n\n`;

		// Генерируем график и отправляем отдельным письмом
		try {
			const chartBuffer = await buildCharts(data, iso);
			await email.send(
				`📊 График: ${iso} — ${today}`,
				`График курса ${iso}.\n\n`,
				chartBuffer,
				`${iso}_chart.png`,
			);
			chartsSent = true;
		} catch (e) {
			console.error(`Ошибка графика ${iso}:`, e.message);
		}
	}

	// Текстовая сводка
	await email.send(`📊 Отчет — ${today}`, reportText);

	lastReportDate = today;
	console.log("✅ Отчет отправлен");
}

// ============================================
// ПОЛЛИНГ СБЕРА
// ============================================

let sberTimer;

function sberPolling() {
	requestCurrency((resp) => {
		if (resp.error) {
			console.error("❌ Сбер ошибка:", resp.error);
			return;
		}

		const currencies = Object.keys(store.currencyList);

		currencies.forEach((cur) => {
			const entry = resp[cur]?.rateList?.[0];
			if (!entry) return;

			const { rateSell, rateBuy } = entry;
			const timestamp = Date.now();

			// Логгируем (используем существующий метод)
			store.logRates(cur, { rateSell, rateBuy, timeStamp: timestamp });

			// Проверяем алармы
			checkAlarms(cur, rateSell, rateBuy);

			// Обновляем статистику и отправляем уведомления
			const data = store.currencyList[cur];
			if (!data) return;

			if (data.maxSell === undefined || rateSell > data.maxSell) {
				data.maxSell = rateSell;
				reportRateEvent({
					message: `${cur}: обновлен максимум на покупку`,
					data: rateSell,
				});
			}
			if (data.minSell === undefined || rateSell < data.minSell) {
				data.minSell = rateSell;
				reportRateEvent({
					message: `${cur}: обновлен минимум на покупку`,
					data: rateSell,
				});
			}
			if (data.maxBuy === undefined || rateBuy > data.maxBuy) {
				data.maxBuy = rateBuy;
				reportRateEvent({
					message: `${cur}: обновлен максимум на продажу`,
					data: rateBuy,
				});
			}
			if (data.minBuy === undefined || rateBuy < data.minBuy) {
				data.minBuy = rateBuy;
				reportRateEvent({
					message: `${cur}: обновлен минимум на продажу`,
					data: rateBuy,
				});
			}

			const delta = rateSell - rateBuy;
			data.delta = delta;
			if (data.maxDelta === undefined || delta > data.maxDelta)
				data.maxDelta = delta;
			if (data.minDelta === undefined || delta < data.minDelta)
				data.minDelta = delta;

			// Сохраняем (используем существующий метод)
			store.saveCurrencyToFile(cur);
		});

		// Ежедневный отчет в 9:00
		if (new Date().getHours() === 9 && new Date().getMinutes() < 5) {
			sendDailyReport();
		}
	});

	if (sberTimer) clearTimeout(sberTimer);
	const interval = (parseInt(process.env.UPDATE_CURRENCY_INTERVAL_SEC) || 3600) * 1000;
	sberTimer = setTimeout(sberPolling, interval);
}

// ============================================
// ЗАПУСК
// ============================================

sberPolling();

console.log(`🤖 Бот запущен. Получатель: ${process.env.EMAIL_RECIPIENT}`);

// Уведомление о старте
email.send(
	"🔄 Бот запущен",
	`Бот валютных курсов активен.\nВремя: ${new Date().toLocaleString("ru-RU")}`,
);

sendDailyReport();

// Graceful shutdown
process.on("SIGINT", () => {
	console.log("\n🛑 Остановка...");
	if (sberTimer) clearTimeout(sberTimer);
	store.saveAlarms();
	process.exit(0);
});
