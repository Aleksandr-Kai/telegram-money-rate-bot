const Chart = require("chart.js/auto");
const { createCanvas } = require("canvas");

// Константы для стилей графиков (купить/продать — с точки зрения пользователя)
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
};

// Полупрозрачный вариант цвета линии курса для линий макс/мин
const withAlpha = (rgbColor, alpha) =>
	rgbColor.replace("rgb(", "rgba(").replace(")", `, ${alpha})`);

const LEGEND_ROW_HEIGHT = 30;
const LEGEND_TOP_PADDING = 26;
const LEGEND_HEIGHT = LEGEND_TOP_PADDING + LEGEND_ROW_HEIGHT * 2;

// Функция для форматирования временной метки
const formatTimestamp = (timestamp) => {
	const date = new Date(timestamp);
	return date.toLocaleTimeString("ru-RU", {
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	});
};

// Плагин, рисующий легенду под графиком в две строки:
// сверху — линии "Купить", снизу — линии "Продать"
const twoRowLegendPlugin = {
	id: "twoRowLegend",
	afterDraw(chart) {
		const legendOptions = chart.config.options.plugins.twoRowLegend;
		const rows = legendOptions?.rows;
		if (!rows) return;

		const { ctx, chartArea, width } = chart;
		const font = "16px sans-serif";
		const swatchWidth = 26;
		const swatchGap = 8;
		const itemGap = 28;

		ctx.save();
		ctx.font = font;
		ctx.textBaseline = "middle";

		if (legendOptions.isoLabel) {
			ctx.font = "bold 28px sans-serif";
			ctx.fillStyle = "#333";
			ctx.textAlign = "left";
			ctx.fillText(
				legendOptions.isoLabel,
				chartArea.left,
				chartArea.bottom + LEGEND_HEIGHT / 2,
			);
			ctx.font = font;
		}

		// Ширина колонки — по самому длинному элементу среди всех строк,
		// чтобы значки и подписи в разных строках стояли друг под другом
		const columnCount = rows[0].length;
		const columnWidths = Array.from({ length: columnCount }, (_, col) =>
			Math.max(
				...rows.map(
					(items) =>
						swatchWidth + swatchGap + ctx.measureText(items[col].label).width,
				),
			),
		);
		const totalWidth =
			columnWidths.reduce((a, b) => a + b, 0) + itemGap * (columnCount - 1);
		const startX = (width - totalWidth) / 2;

		rows.forEach((items, rowIndex) => {
			const y =
				chartArea.bottom +
				LEGEND_TOP_PADDING +
				LEGEND_ROW_HEIGHT * rowIndex +
				LEGEND_ROW_HEIGHT / 2;

			let x = startX;

			items.forEach((item, i) => {
				const lineY = y;
				ctx.strokeStyle = item.color;
				ctx.fillStyle = item.color;
				ctx.lineWidth = item.point ? 2 : 1;
				ctx.setLineDash(item.dash || []);

				ctx.beginPath();
				ctx.moveTo(x, lineY);
				ctx.lineTo(x + swatchWidth, lineY);
				ctx.stroke();

				if (item.point) {
					ctx.setLineDash([]);
					ctx.beginPath();
					ctx.arc(x + swatchWidth / 2, lineY, 3, 0, Math.PI * 2);
					ctx.fill();
				}

				ctx.setLineDash([]);
				ctx.fillStyle = "#333";
				ctx.fillText(item.label, x + swatchWidth + swatchGap, lineY);

				x += columnWidths[i] + itemGap;
			});
		});

		ctx.restore();
	},
};

// Функция для создания графика: курс "Купить" и "Продать" на одной оси
const createChart = (canvas, sellPoints, buyPoints, data, label) => {
	const ctx = canvas.getContext("2d");
	const timestamps = sellPoints.map((p) => p.x);
	const refLine = (y) => [
		{ x: timestamps[0], y },
		{ x: timestamps[timestamps.length - 1], y },
	];

	return new Chart(ctx, {
		type: "line",
		data: {
			datasets: [
				{
					label: `${CHART_STYLES.rateSell.label} ${label}`,
					data: sellPoints,
					borderColor: CHART_STYLES.rateSell.borderColor,
					backgroundColor: CHART_STYLES.rateSell.backgroundColor,
					fill: false,
					pointRadius: 3,
				},
				{
					label: `${CHART_STYLES.rateBuy.label} ${label}`,
					data: buyPoints,
					borderColor: CHART_STYLES.rateBuy.borderColor,
					backgroundColor: CHART_STYLES.rateBuy.backgroundColor,
					fill: false,
					pointRadius: 3,
				},
				{
					label: "Максимум (Купить)",
					data: refLine(data.maxSell),
					borderColor: withAlpha(CHART_STYLES.rateSell.borderColor, 0.8),
					fill: false,
					borderWidth: 1,
					pointStyle: false,
				},
				{
					label: "Минимум (Купить)",
					data: refLine(data.minSell),
					borderColor: withAlpha(CHART_STYLES.rateSell.borderColor, 0.8),
					fill: false,
					borderDash: [5, 5],
					borderWidth: 1,
					pointStyle: false,
				},
				{
					label: "Максимум (Продать)",
					data: refLine(data.maxBuy),
					borderColor: withAlpha(CHART_STYLES.rateBuy.borderColor, 0.8),
					fill: false,
					borderWidth: 1,
					pointStyle: false,
				},
				{
					label: "Минимум (Продать)",
					data: refLine(data.minBuy),
					borderColor: withAlpha(CHART_STYLES.rateBuy.borderColor, 0.8),
					fill: false,
					borderDash: [5, 5],
					borderWidth: 1,
					pointStyle: false,
				},
			],
		},
		options: {
			responsive: false,
			layout: {
				padding: { bottom: LEGEND_HEIGHT },
			},
			plugins: {
				legend: { display: false },
				twoRowLegend: {
					isoLabel: label,
					rows: [
						[
							{
								label: CHART_STYLES.rateSell.label,
								color: CHART_STYLES.rateSell.borderColor,
								point: true,
							},
							{
								label: "Максимум",
								color: withAlpha(CHART_STYLES.rateSell.borderColor, 0.8),
							},
							{
								label: "Минимум",
								color: withAlpha(CHART_STYLES.rateSell.borderColor, 0.8),
								dash: [5, 5],
							},
						],
						[
							{
								label: CHART_STYLES.rateBuy.label,
								color: CHART_STYLES.rateBuy.borderColor,
								point: true,
							},
							{
								label: "Максимум",
								color: withAlpha(CHART_STYLES.rateBuy.borderColor, 0.8),
							},
							{
								label: "Минимум",
								color: withAlpha(CHART_STYLES.rateBuy.borderColor, 0.8),
								dash: [5, 5],
							},
						],
					],
				},
			},
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
		plugins: [twoRowLegendPlugin],
	});
};

const buildCharts = async (data, label) => {
	try {
		const history = data.history;

		const canvas = createCanvas(1080, 600 + LEGEND_HEIGHT);
		const chart = createChart(
			canvas,
			history.map((item) => ({ x: item.timeStamp, y: item.rateSell })),
			history.map((item) => ({ x: item.timeStamp, y: item.rateBuy })),
			data,
			label,
		);
		const buffer = canvas.toBuffer("image/png");
		chart.destroy();

		return buffer;
	} catch (error) {
		console.error("Ошибка при создании или отправке графиков:", error);
	}
};

module.exports = { buildCharts };
