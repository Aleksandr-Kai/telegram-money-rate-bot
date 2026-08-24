const Chart = require("chart.js/auto");
const { createCanvas, loadImage } = require("canvas");

// Константы для стилей графиков
const CHART_STYLES = {
	rateSell: {
		label: "Купить",
		borderColor: "rgb(209, 56, 0)",
		backgroundColor: "rgba(209, 56, 0, 0.2)",
	},
	rateBuy: {
		label: "Продать",
		borderColor: "rgb(0, 104, 173)",
		backgroundColor: "rgba(0, 104, 173, 0.2)",
	},
	max: {
		borderColor: "rgb(255, 0, 0)",
		backgroundColor: "rgba(255, 0, 0, 0.2)",
		borderDash: [5, 5],
	},
	min: {
		borderColor: "rgb(0, 0, 255)",
		backgroundColor: "rgba(0, 0, 255, 0.2)",
		borderDash: [5, 5],
	},
};

// Функция для форматирования временной метки
const formatTimestamp = (timestamp) => {
	const date = new Date(timestamp);
	return date.toLocaleTimeString("ru-RU", {
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	});
};

// Функция для создания графика
const createChart = (canvas, points, max, min, label, styles) => {
	const ctx = canvas.getContext("2d");
	const timestamps = points.map((p) => p.x);
	const minMaxLine = [
		{ x: timestamps[0], y: null },
		{ x: timestamps[timestamps.length - 1], y: null },
	];
	return new Chart(ctx, {
		type: "line",
		data: {
			datasets: [
				{
					label: `${styles.label} ${label}`,
					data: points,
					borderColor: styles.borderColor,
					backgroundColor: styles.backgroundColor,
					fill: false,
					pointRadius: 3,
				},
				{
					label: "Максимум",
					data: minMaxLine.map((p) => ({ ...p, y: max })),
					borderColor: CHART_STYLES.max.borderColor,
					backgroundColor: CHART_STYLES.max.backgroundColor,
					fill: false,
					borderDash: CHART_STYLES.max.borderDash,
					pointStyle: false,
				},
				{
					label: "Минимум",
					data: minMaxLine.map((p) => ({ ...p, y: min })),
					borderColor: CHART_STYLES.min.borderColor,
					backgroundColor: CHART_STYLES.min.backgroundColor,
					fill: false,
					borderDash: CHART_STYLES.min.borderDash,
					pointStyle: false,
				},
			],
		},
		options: {
			responsive: false,
			scales: {
				x: {
					type: "linear",
					min: timestamps[0],
					max: timestamps[timestamps.length - 1],
					ticks: {
						callback: formatTimestamp,
					},
				},
				y: {
					beginAtZero: false,
				},
			},
		},
	});
};

// Функция для объединения двух изображений в одно
const combineImages = async (image1, image2) => {
	const width = image1.width; // Ширина изображений (одинаковая)
	const height = image1.height + image2.height; // Высота нового изображения

	// Создаем новый canvas для объединенного изображения
	const combinedCanvas = createCanvas(width, height);
	const ctx = combinedCanvas.getContext("2d");

	// Рисуем первое изображение
	ctx.drawImage(image1, 0, 0);
	// Рисуем второе изображение под первым
	ctx.drawImage(image2, 0, image1.height);

	// Возвращаем объединенное изображение в виде буфера
	return combinedCanvas.toBuffer("image/png");
};

const buildCharts = async (data, label) => {
	try {
		const history = data.history;

		// График для rateSell
		const canvasSell = createCanvas(1080, 600);
		const chartSell = createChart(
			canvasSell,
			history.map((item) => ({ x: item.timeStamp, y: item.rateSell })),
			data.maxSell,
			data.minSell,
			label,
			CHART_STYLES.rateSell
		);
		const bufferSell = canvasSell.toBuffer("image/png");
		chartSell.destroy(); // Освобождаем ресурсы

		// График для rateBuy
		const canvasBuy = createCanvas(1080, 600);
		const chartBuy = createChart(
			canvasBuy,
			history.map((item) => ({ x: item.timeStamp, y: item.rateBuy })),
			data.maxBuy,
			data.minBuy,
			label,
			CHART_STYLES.rateBuy
		);
		const bufferBuy = canvasBuy.toBuffer("image/png");
		chartBuy.destroy(); // Освобождаем ресурсы

		// Загружаем изображения в canvas
		const imageSell = await loadImage(bufferSell);
		const imageBuy = await loadImage(bufferBuy);

		// Объединяем изображения
		return await combineImages(imageSell, imageBuy);
	} catch (error) {
		console.error("Ошибка при создании или отправке графиков:", error);
	}
};

module.exports = { buildCharts };
