import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { computeVerdict } from "../services/verdict";

const router = Router();

// Helper: extract the most recent ai_verdict_generated audit log entry
function extractLatestVerdict(auditLogs: any[]): any | null {
  if (!auditLogs) return null;
  const verdictLogs = auditLogs
    .filter((a) => a.event === "ai_verdict_generated")
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return verdictLogs.length > 0 ? verdictLogs[0].details : null;
}

// GET /finance/queue - all pending requests (and optionally filter)
router.get("/queue", async (req, res, next) => {
  try {
    const status = req.query.status
      ? String(req.query.status)
      : "pending_finance_approval";
    const requests = await prisma.tripRequest.findMany({
      where: status === "all" ? {} : { status },
      include: {
        employee: true,
        client: true,
        auditLogs: {
          where: { event: "ai_verdict_generated" },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      orderBy: { createdAt: "desc" },
    });
    // Attach latest verdict as a top-level field for easier consumption by UI
    const enriched = requests.map((r: any) => ({
      ...r,
      verdict: r.auditLogs && r.auditLogs.length > 0 ? r.auditLogs[0].details : null,
    }));
    res.json(enriched);
  } catch (err) {
    next(err);
  }
});

// GET /finance/:id - full detail with audit log + latest verdict surfaced
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
    const verdict = extractLatestVerdict(request.auditLogs);
    res.json({ ...request, verdict });
  } catch (err) {
    next(err);
  }
});

// POST /finance/:id/regenerate-verdict - re-run the AI verdict
router.post("/:id/regenerate-verdict", async (req, res, next) => {
  try {
    const verdict = await computeVerdict(req.params.id);
    res.json(verdict);
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
