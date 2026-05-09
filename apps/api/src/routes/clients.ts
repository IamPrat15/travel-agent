import { Router } from "express";
import { prisma } from "../lib/prisma";

const router = Router();

router.get("/", async (req, res, next) => {
  try {
    const q = String(req.query.q ?? "").trim();
    const clients = q
      ? await prisma.client.findMany({
          where: { name: { contains: q, mode: "insensitive" } },
          orderBy: { name: "asc" },
        })
      : await prisma.client.findMany({ orderBy: { name: "asc" } });
    res.json(clients);
  } catch (err) {
    next(err);
  }
});

export default router;
