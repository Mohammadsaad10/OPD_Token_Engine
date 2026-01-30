import express from "express";
import {
  bookToken,
  cancelToken,
  markNoShow,
} from "../controllers/bookingController.js";

const router = express.Router();

router.post("/", bookToken);
router.post("/:tokenId/cancel", cancelToken);
router.post("/:tokenId/noshow", markNoShow);

export default router;
