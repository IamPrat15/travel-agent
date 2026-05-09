import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import { ZodError } from "zod";

import travelRoutes from "./routes/travel";
import employeeRoutes from "./routes/employees";
import clientRoutes from "./routes/clients";
import financeRoutes from "./routes/finance";

const app = express();
const PORT = Number(process.env.PORT ?? 3000);

const corsOrigin = process.env.CORS_ORIGIN ?? "*";
app.use(
  cors({
    origin: corsOrigin === "*" ? true : corsOrigin.split(",").map((s) => s.trim()),
    credentials: true,
  })
);
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    llm_configured: Boolean(process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.length > 10),
  });
});

app.use("/travel", travelRoutes);
app.use("/employees", employeeRoutes);
app.use("/clients", clientRoutes);
app.use("/finance", financeRoutes);

// 404
app.use((_req, res) => res.status(404).json({ error: "Not found" }));

// Error handler
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: "Validation error", details: err.errors });
  }
  const status = err?.statusCode ?? 500;
  console.error("[error]", err);
  res.status(status).json({ error: err?.message ?? "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`Travel agent API listening on :${PORT}`);
  console.log(`  CORS origin: ${corsOrigin}`);
  console.log(`  LLM intent parser: ${process.env.ANTHROPIC_API_KEY ? "enabled" : "regex fallback"}`);
});
