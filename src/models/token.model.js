import mongoose from "mongoose";

const tokenSchema = new mongoose.Schema(
  {
    patientName: {
      type: String,
      required: true,
    },

    // Link back to the specific slot
    slotId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Slot",
      required: true,
    },

    // The Token Number (e.g., 1, 2, 3...)
    tokenNumber: {
      type: Number,
      required: true,
    },

    // Source/Priority Type of the token
    type: {
      type: String,
      enum: ["ONLINE", "WALKIN", "PAID", "FOLLOWUP", "EMERGENCY"],
      required: true,
    },

    status: {
      type: String,
      enum: ["BOOKED", "CANCELLED", "COMPLETED", "NOSHOW"],
      default: "BOOKED",
    },
  },
  { timestamps: true },
);

const Token = mongoose.model("Token", tokenSchema);
export default Token;
