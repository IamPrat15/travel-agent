import { Router } from "express";
import { z } from "zod";
import { processRequest } from "../services/orchestrator";

const router = Router();

const ParseRequestSchema = z.object({
  employee_id: z.string().min(1),
  text: z.string().min(1),
  user_supplied_client: z
    .object({
      client_name: z.string().min(1),
      address: z.string().min(1),
      city: z.string().min(1),
      lat: z.number(),
      lng: z.number(),
    })
    .optional(),
});

router.post("/parse", async (req, res, next) => {
  try {
    const body = ParseRequestSchema.parse(req.body);
    const result = await processRequest({
      employeeId: body.employee_id,
      text: body.text,
      userSuppliedClient: body.user_supplied_client,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// /submit is the same handler — used after the user supplies the client address
router.post("/submit", async (req, res, next) => {
  try {
    const body = ParseRequestSchema.parse(req.body);
    const result = await processRequest({
      employeeId: body.employee_id,
      text: body.text,
      userSuppliedClient: body.user_supplied_client,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
