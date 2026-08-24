// emailService.js
const nodemailer = require("nodemailer");
require("dotenv").config();

class EmailService {
	constructor() {
		this.transporter = nodemailer.createTransport({
			host: process.env.EMAIL_HOST || "smtp.yandex.ru",
			port: parseInt(process.env.EMAIL_PORT) || 465,
			secure: true,
			auth: {
				user: process.env.EMAIL_USER,
				pass: process.env.EMAIL_PASS,
			},
		});
	}

	async send(subject, text, imageBuffer = null, filename = "chart.png") {
		const mailOptions = {
			from: `"Currency Bot" <${process.env.EMAIL_USER}>`,
			to: process.env.EMAIL_RECIPIENT,
			subject,
			text,
			html: text?.replace(/\n/g, "<br>"),
		};

		if (imageBuffer) {
			mailOptions.attachments = [{ filename, content: imageBuffer }];
		}

		try {
			const info = await this.transporter.sendMail(mailOptions);
			console.log(`✅ Email sent: ${info.messageId}`);
			return true;
		} catch (error) {
			console.error("❌ Email error:", error.message);
			return false;
		}
	}
}

module.exports = EmailService;
