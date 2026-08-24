function getSender(msg) {
	return {
		userId: msg.from.id,
		chatId: msg.chat.id,
		isBot: msg.from.is_bot,
		firstName: msg.from.first_name,
		lastName: msg.from.last_name,
		userName: msg.from.username,
		lang: msg.from.language_code,
	};
}

function getCurrentTime() {
	const now = new Date();

	// Русская локаль
	const formatted = now
		.toLocaleString("ru-RU", {
			hour: "2-digit",
			minute: "2-digit",
			day: "2-digit",
			month: "2-digit",
		})
		.replace(",", ""); // Убираем запятую
	return formatted;
}

module.exports = { getSender, getCurrentTime };
