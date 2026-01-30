import { z } from "zod";
import Slot from "../models/slot.model.js";
import Token from "../models/token.model.js";
import { acquireLock, releaseLock } from "../utils/lock.js";

//Validation Schema
const bookingSchema = z.object({
  doctorId: z.string().min(1, "Doctor ID is required"),
  timeSlot: z.string().min(1, "Time slot is required"),
  patientName: z.string().min(1, "Patient name is required"),
  type: z.enum(["ONLINE", "WALKIN", "PAID", "FOLLOWUP", "EMERGENCY"]),
});

// Book Token Controller
export const bookToken = async (req, res) => {
  const lockKey = `lock:${req.body.doctorId}:${req.body.timeSlot}`;
  //ex. lockKey => lock:1234:09:00-10:00

  try {
    //Validate Input
    const { doctorId, timeSlot, patientName, type } = bookingSchema.parse(
      req.body,
    );

    //Acquire Lock (Concurrency Protection)
    // If the lock exists, it means another request is currently processing this slot.
    const isLocked = await acquireLock(lockKey);
    if (!isLocked) {
      return res.status(429).json({
        success: false,
        message: "System busy. Please retry in a moment.",
      });
    }

    // (Only one request enters here at a time)

    //Fetch or Create Slot
    // We use findOneAndUpdate with upsert to create the slot if it's the first booking
    let slot = await Slot.findOne({ doctorId, timeSlot });

    if (!slot) {
      slot = await Slot.create({ doctorId, timeSlot });
    }

    //Elastic Capacity Logic using tiered limits
    let maxLimit = slot.maxCapacity;

    if (["PAID", "FOLLOWUP"].includes(type)) {
      // Paid & Follow-up can use Base + Premium Buffer
      maxLimit = slot.maxCapacity + slot.premiumBuffer;
    } else if (type === "EMERGENCY") {
      // Emergency can use EVERYTHING
      maxLimit = slot.maxCapacity + slot.premiumBuffer + slot.emergencyBuffer;
    }

    // Handle "Delay" Scenario
    // If doctor is delayed, we strictly reduce capacity for non-emergency
    if (slot.isDelayed && type !== "EMERGENCY") {
      maxLimit = Math.floor(maxLimit * 0.8); // Reduce capacity by 20%
    }

    /// Check Capacity
    if (slot.bookedCount >= maxLimit) {
      await releaseLock(lockKey);
      return res.status(400).json({
        success: false,
        message: "Slot Capacity Reached for this Priority Level",
      });
    }

    //Book the Token
    const newToken = await Token.create({
      patientName,
      slotId: slot._id,
      tokenNumber: slot.lastTokenNumber + 1,
      type,
    });

    //Update Slot Count
    slot.bookedCount += 1;
    slot.lastTokenNumber += 1;

    await slot.save();

    // Release Lock & Respond
    await releaseLock(lockKey);

    return res.status(201).json({
      success: true,
      token: newToken,
    });
  } catch (error) {
    // Always release lock on error to prevent deadlocks
    await releaseLock(lockKey);

    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, errors: error.errors });
    }

    console.error(error);
    return res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Cancel Token Controller
export const cancelToken = async (req, res) => {
  const { tokenId } = req.params;

  // We don't need a lock here because decrementing is safe in Mongo
  // (it won't over-fill the slot)

  try {
    // Find the Token
    const token = await Token.findById(tokenId);
    if (!token) {
      return res
        .status(404)
        .json({ success: false, message: "Token not found" });
    }

    //Check if already cancelled
    if (token.status === "CANCELLED") {
      return res
        .status(400)
        .json({ success: false, message: "Token already cancelled" });
    }

    //Update Token Status
    token.status = "CANCELLED";
    await token.save();

    //Free up the Slot (Dynamic Reallocation)
    // We decrease the count, instantly allowing a new person to book this spot.
    await Slot.findByIdAndUpdate(token.slotId, {
      $inc: { bookedCount: -1 },
    });

    return res.json({
      success: true,
      message: "Token cancelled. Slot is now open.",
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Server Error" });
  }
};

//mark No Show controller

export const markNoShow = async (req, res) => {
  const { tokenId } = req.params;

  try {
    const token = await Token.findById(tokenId);
    if (!token) return res.status(404).json({ message: "Token not found" });

    if (token.status !== "BOOKED") {
      return res.status(400).json({ message: "Token is not active" });
    }

    //Update Status
    token.status = "NOSHOW";
    await token.save();

    //Free up the slot (Dynamic Reallocation)
    //This allows a new Walk-in to take this "wasted" spot immediately.
    await Slot.findByIdAndUpdate(token.slotId, {
      $inc: { bookedCount: -1 },
    });

    res.json({
      success: true,
      message: "Marked as No-Show. Slot reallocated.",
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
