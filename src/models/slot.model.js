import mongoose from "mongoose";

const slotSchema = new mongoose.Schema(
  {
    doctorId: {
      type: String,
      required: true,
      index: true,
    },

    // Store time as a string for simplicity in this assignment (e.g., "09:00-10:00")
    // In a real app, we might use Date objects.
    timeSlot: {
      type: String,
      required: true,
    },

    // The "Hard Limit"
    // Standard capacity for Walk-in and Online patients
    maxCapacity: {
      type: Number,
      default: 10,
    },

    // The "Elastic Limit"
    // Extra space reserved ONLY for Emergency/Premium patients
    premiumBuffer: { type: Number, default: 2 }, // Extra spots for Paid/Follow-up
    emergencyBuffer: { type: Number, default: 3 }, // Extra spots for Emergency

    // Track how many tokens are currently active
    bookedCount: {
      type: Number,
      default: 0,
    },

    lastTokenNumber: { type: Number, default: 0 }, // For generating sequential token numbers

    isDelayed: { type: Boolean, default: false }, // Docter Delay - real world variability
  },
  { timestamps: true },
);

// Prevent duplicate slots for the same doctor at the same time
slotSchema.index({ doctorId: 1, timeSlot: 1 }, { unique: true });

const Slot = mongoose.model("Slot", slotSchema);
export default Slot;
