const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = 3000;

app.use(cors());

app.use((req, res, next) => {
	res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
	res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
	next();
});

app.use(express.static(path.join(__dirname, "public")));

const moqPath = path.resolve(__dirname, "../lib/dist");
app.use("/moq-player", express.static(moqPath));

app.listen(PORT, () => {
	console.log(`Server running in http://localhost:${PORT}`);
});
