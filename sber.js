const zlib = require("zlib");
const request = require("request");
const iconv = require("iconv-lite");
const { getCurrentTime } = require("./utils/utils");
const log = console.log;

const currencies = process.env.CURRENCY_LIST.split(",");

const requestURL_officerates = `https://www.sberbank.ru/proxy/services/rates/public/v2/branchActual?id=5252210553&rateType=ERNP-1&${currencies
	.map((cur) => "isoCodes[]=" + cur)
	.join("&")}`;

const requestOptions = {
	url: requestURL_officerates,
	encoding: null,
	rejectUnauthorized: false,
	headers: {
		"User-Agent":
			"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
		Accept: "application/json, text/javascript, */*; q=0.01",
		"Accept-Language": "ru,en;q=0.9",
		Referer: "https://www.sberbank.ru/ru/quotes/currencies",
		Origin: "https://www.sberbank.ru",
		"X-Requested-With": "XMLHttpRequest",
		Connection: "keep-alive",
	},
};

const decodeBody = async (res, body, callback) => {
	if (res.headers["content-encoding"] == "gzip") {
		zlib.gunzip(body, function (err, dezipped) {
			callback(dezipped.toString());
		});
	} else {
		callback(iconv.decode(body, "utf8"));
	}
};

let lastRequestTime = 0;

function requestCurrency(callback) {
	const minIntervalMs = (process.env.UPDATE_CURRENCY_INTERVAL_SEC || 3600) * 1000;
	const now = Date.now();

	if (now - lastRequestTime < minIntervalMs) {
		callback({
			error: `Запрос отклонён: минимальный интервал между запросами к Сберу — ${
				minIntervalMs / 1000
			} сек.`,
		});
		return;
	}
	lastRequestTime = now;

	request(requestOptions, function (err, res, body) {
		if (err) {
			log(`Sber request ${err.message} ${body}`);
			return;
		}

		// Проверяем статус ответа
		if (res.statusCode !== 200) {
			log(`[${getCurrentTime()}] Запрос к Сберу. Ошибка HTTP: ${res.statusCode}`);
			callback({ error: "Сервер вернул ошибку", code: res.statusCode });
			return;
		}

		decodeBody(res, body, (decodedBody) => {
			let data = {};

			try {
				data = JSON.parse(decodedBody);
			} catch (e) {
				log(requestOptions);
				log(decodedBody);
				callback({
					error: "Получен не корректный ответ. Сбер изменил формат запроса либо ответа.",
					decodedBody,
					requestOptions,
				});
			}

			if (data && data.rates && callback) callback(data.rates);
			else {
				log("Не удалось выполнить запрос валют");
				callback({ error: "Получен не корректный json", data });
			}
		});
	});
}

module.exports = { requestCurrency };
