import { Router } from "express";
import { prisma } from "../lib/prisma";

const router = Router();

router.get("/", async (_req, res, next) => {
  try {
    const employees = await prisma.employee.findMany({
      orderBy: { id: "asc" },
      select: { id: true, name: true, email: true, band: true, homeCity: true, department: true },
    });
    res.json(employees);
  } catch (err) {
    next(err);
  }
});

export default router;
