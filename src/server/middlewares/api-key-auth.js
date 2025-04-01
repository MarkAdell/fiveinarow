import dotenv from "dotenv";

dotenv.config();

export const authenticateApiKey = (req, res, next) => {
  const apiKey = req.headers["x-api-key"];

  if (!process.env.API_KEY) {
    console.error("API_KEY not set in environment variables");
    return res.status(500).json({ error: "Server configuration error" });
  }

  if (!apiKey || apiKey !== process.env.API_KEY) {
    return res.status(401).json({ error: "Invalid or missing API key" });
  }

  next();
};
