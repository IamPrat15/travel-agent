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
      pincode: z.string().regex(/^\d{6}$/, "Pincode must be 6 digits"),
    })
    .optional(),
  /** When user has answered the "do you need a hotel?" question, pass their answer here. */
  user_supplied_needs_hotel: z.boolean().optional(),
});

router.post("/parse", async (req, res, next) => {
  try {
    const body = ParseRequestSchema.parse(req.body);
    const result = await processRequest({
      employeeId: body.employee_id,
      text: body.text,
      userSuppliedClient: body.user_supplied_client,
      needsHotelOverride: body.user_supplied_needs_hotel,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post("/submit", async (req, res, next) => {
  try {
    const body = ParseRequestSchema.parse(req.body);
    const result = await processRequest({
      employeeId: body.employee_id,
      text: body.text,
      userSuppliedClient: body.user_supplied_client,
      needsHotelOverride: body.user_supplied_needs_hotel,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
