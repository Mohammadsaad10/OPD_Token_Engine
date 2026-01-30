import express from "express";
import "dotenv/config";
import connectDB from "./lib/db.js";

import bookingRoutes from "./routes/booking.routes.js";

const PORT = process.env.PORT || 3000;

const app = express();

app.use(express.json());

app.use("/api/book", bookingRoutes);

app.listen(PORT, async () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  connectDB();
});

export default app;
