import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";

const router = Router();

// GET /finance/queue - all pending requests (and optionally filter)
router.get("/queue", async (req, res, next) => {
  try {
    const status = req.query.status
      ? String(req.query.status)
      : "pending_finance_approval";
    const requests = await prisma.tripRequest.findMany({
      where: status === "all" ? {} : { status },
      include: { employee: true, client: true },
      orderBy: { createdAt: "desc" },
    });
    res.json(requests);
  } catch (err) {
    next(err);
  }
});

// GET /finance/:id - full detail with audit log
router.get("/:id", async (req, res, next) => {
  try {
    const request = await prisma.tripRequest.findUnique({
      where: { id: req.params.id },
      include: {
        employee: true,
        client: true,
        auditLogs: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!request) return res.status(404).json({ error: "Not found" });
    res.json(request);
  } catch (err) {
    next(err);
  }
});

const ActionSchema = z.object({
  approver: z.string().min(1),
  note: z.string().optional(),
});

router.post("/:id/approve", async (req, res, next) => {
  try {
    const { approver, note } = ActionSchema.parse(req.body);
    const updated = await prisma.tripRequest.update({
      where: { id: req.params.id },
      data: {
        status: "approved",
        approvedBy: approver,
        approvedAt: new Date(),
        financeNote: note,
      },
    });
    await prisma.auditLog.create({
      data: {
        tripRequestId: updated.id,
        event: "approved",
        actor: approver,
        details: { note: note ?? null } as any,
      },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.post("/:id/reject", async (req, res, next) => {
  try {
    const { approver, note } = ActionSchema.parse(req.body);
    const updated = await prisma.tripRequest.update({
      where: { id: req.params.id },
      data: {
        status: "rejected",
        approvedBy: approver,
        approvedAt: new Date(),
        financeNote: note,
      },
    });
    await prisma.auditLog.create({
      data: {
        tripRequestId: updated.id,
        event: "rejected",
        actor: approver,
        details: { note: note ?? null } as any,
      },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.post("/:id/mark-booked", async (req, res, next) => {
  try {
    const { approver, note } = ActionSchema.parse(req.body);
    const updated = await prisma.tripRequest.update({
      where: { id: req.params.id },
      data: { status: "booked", financeNote: note },
    });
    await prisma.auditLog.create({
      data: {
        tripRequestId: updated.id,
        event: "booked",
        actor: approver,
        details: { note: note ?? null } as any,
      },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

export default router;
