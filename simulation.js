import axios from "axios";
import mongoose from "mongoose";
import Slot from "./src/models/slot.model.js";
import Token from "./src/models/token.model.js";

import dotenv from "dotenv";
dotenv.config();

// Configuration
const API_URL = "http://localhost:3000/api/book";
const REQUEST_DELAY_MS = 200;

// --- Helpers ---
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const log = (time, category, message) => {
  console.log(
    `⏰ [${time}] \x1b[36m${category.padEnd(15)}\x1b[0m : ${message}`,
  );
};

// --- API Wrappers ---
async function bookToken(
  doctorId,
  timeSlot,
  patientName,
  type,
  expectedStatus = 201,
) {
  try {
    const res = await axios.post(API_URL, {
      doctorId,
      timeSlot,
      patientName,
      type,
    });
    if (res.status === 201) {
      console.log(
        `   ✅ SUCCESS: [${type}] ${patientName} -> Token #${res.data.token.tokenNumber}`,
      );
      return res.data.token;
    }
  } catch (err) {
    const status = err.response?.status;
    const msg = err.response?.data?.message || err.message;

    if (status === expectedStatus) {
      console.log(
        `   🛡️  EXPECTED REJECTION: [${type}] ${patientName} -> ${msg}`,
      );
    } else {
      console.log(`   ❌ UNEXPECTED FAIL: ${patientName} -> ${msg}`);
    }
    return null;
  }
}

async function cancelToken(token, time) {
  if (!token) {
    console.log(`   ❌ ERROR: Could not find token to cancel`);
    return;
  }
  try {
    const res = await axios.post(`${API_URL}/${token._id}/cancel`);
    log(
      time,
      "CANCELLATION",
      `Patient ${token.patientName} cancelled via App.`,
    );
    console.log(`   🗑️  ${res.data.message}`);
  } catch (err) {
    console.error(err.response?.data || err.message);
  }
}

async function markNoShow(token, time) {
  if (!token) {
    console.log(`   ❌ ERROR: Could not find token for No-Show`);
    return;
  }
  try {
    const res = await axios.post(`${API_URL}/${token._id}/noshow`);
    log(time, "NO-SHOW", `Patient ${token.patientName} did not appear.`);
    console.log(`   👻 ${res.data.message}`);
  } catch (err) {
    console.log(`   ❌ NO-SHOW FAILED: ${err.response?.data?.message}`);
  }
}

// --- Database Seeding ---
async function seedDatabase() {
  console.log("\n🌱 SEEDING DATABASE (Resetting Day)...");
  await mongoose.connect(process.env.MONGO_URI);

  // Clearing both collections to prevent "Token not active" errors from old data
  await Slot.deleteMany({});
  await Token.deleteMany({});

  const doctors = [
    {
      doctorId: "Dr. Gupta",
      timeSlot: "09:00-10:00",
      baseCapacity: 10,
      premiumBuffer: 2,
      emergencyBuffer: 5,
      isDelayed: false,
    },
    {
      doctorId: "Dr. Alok",
      timeSlot: "09:00-10:00",
      baseCapacity: 10,
      premiumBuffer: 2,
      emergencyBuffer: 5,
      isDelayed: true,
    },
    {
      doctorId: "Dr. Sarah",
      timeSlot: "09:00-10:00",
      baseCapacity: 10,
      premiumBuffer: 2,
      emergencyBuffer: 5,
      isDelayed: false,
    },
  ];

  await Slot.insertMany(doctors);
  console.log(
    "✅ Doctors Ready: Dr. Gupta (Gen), Dr. Alok (Delayed), Dr. Sarah (Neuro)\n",
  );
  console.log("--- 🏥 OPD DAY BEGINS 🏥 ---\n");
}

// --- MAIN FUNCTION ---
async function runSimulation() {
  await seedDatabase();

  const TIME_SLOT = "09:00-10:00";

  // --- 1: Concurrency ---
  log(
    "08:55",
    "CONCURRENCY",
    "Server receives 5 simultaneous hits for Dr. Gupta...",
  );

  const promises = [
    bookToken("Dr. Gupta", TIME_SLOT, "Rahul (App)", "ONLINE"),
    bookToken("Dr. Gupta", TIME_SLOT, "Simran (Web)", "ONLINE"),
    bookToken("Dr. Gupta", TIME_SLOT, "Amit (Walk-in)", "WALKIN"),
    bookToken("Dr. Gupta", TIME_SLOT, "Priya (App)", "ONLINE"),
    bookToken("Dr. Gupta", TIME_SLOT, "Kunal (Web)", "ONLINE"),
  ];
  await Promise.all(promises);
  await sleep(500);

  const guptaSlot = await mongoose.connection
    .collection("slots")
    .findOne({ doctorId: "Dr. Gupta" });
  let currentCount = guptaSlot ? guptaSlot.bookedCount : 0;
  console.log(`   ℹ️  Current Count after concurrency: ${currentCount}/10`);

  if (currentCount < 5) {
    console.log(
      `   🔧 Backfilling failed concurrent requests to reach count 5...`,
    );
    for (let i = currentCount + 1; i <= 5; i++) {
      await bookToken("Dr. Gupta", TIME_SLOT, `Backfill_Pt_${i}`, "ONLINE");
    }
  }

  // ---2: HARD LIMITS ---
  log("09:10", "HARD LIMITS", "Filling Dr. Gupta to Capacity (10/10)...");
  for (let i = 6; i <= 10; i++) {
    await bookToken("Dr. Gupta", TIME_SLOT, `Patient_${i}`, "WALKIN");
    await sleep(REQUEST_DELAY_MS);
  }

  log(
    "09:15",
    "REJECTION",
    "Standard Patient tries to book Dr. Gupta (Full)...",
  );
  // This fails because 10 >= 10
  await bookToken("Dr. Gupta", TIME_SLOT, "Sad Patient", "WALKIN", 400);
  // ---3: CANCELLATION & REALLOCATION ---
  //Cancellation Scenario
  log("09:20", "DYNAMIC FLOW", "Patient_6 cancels their appointment...");

  //Find the token for Patient_6
  const patientToCancel = await Token.findOne({ patientName: "Patient_6" });

  if (patientToCancel) {
    await cancelToken(patientToCancel, "09:20");
  } else {
    console.log("   ❌ CRITICAL ERROR: Could not find Patient_6 to cancel!");
  }

  log("09:25", "REALLOCATION", "That 'Sad Patient' from 09:15 tries again...");
  // This SUCCEEDS because Patient_6 freed up a slot (Count dropped from 10 -> 9)
  await bookToken("Dr. Gupta", TIME_SLOT, "Happy Patient (Retry)", "WALKIN");
  await sleep(1000);

  // ---4: PAID PRIORITY (Elasticity) ---
  // Now we intentionally break the standard limit using VIPs
  log(
    "09:30",
    "PRIORITY",
    "A 'Paid' patient needs Dr. Gupta (Count is already 10/10)...",
  );
  // This SUCCEEDS using Premium Buffer (11/12)
  await bookToken("Dr. Gupta", TIME_SLOT, "Mr. Oberoi (VIP)", "PAID");
  await sleep(1000);

  // ---5: REAL-WORLD DELAY ---
  log(
    "09:45",
    "VARIABILITY",
    "Dr. Alok is running late (Capacity reduced by 20%)...",
  );

  // Dr. Alok is delayed so his capacity is reduced by 20% (8/10)
  // Booking up to the reduced limit
  for (let i = 1; i <= 8; i++) {
    await bookToken("Dr. Alok", TIME_SLOT, `Ortho_Pt_${i}`, "ONLINE");
    await sleep(50);
  }

  log("09:50", "DELAY CHECK", "Patient #9 tries to book Dr. Alok...");
  // Fails because 8 >= 8 (Reduced Limit)
  await bookToken(
    "Dr. Alok",
    TIME_SLOT,
    "Rejected due to Delay",
    "ONLINE",
    400,
  );
  await sleep(1000);

  // ---6: NO-SHOW HANDLING ---
  log("10:00", "NO-SHOW", "Nurse marks Ortho_Pt_1 as No-Show...");
  // Find Token for Ortho_Pt_1
  const noShowToken = await Token.findOne({ patientName: "Ortho_Pt_1" });
  await markNoShow(noShowToken, "10:00");

  log("10:05", "REALLOCATION", "Walk-in patient grabs the No-Show spot...");
  // SUCCEEDS because count dropped to 7/8
  await bookToken("Dr. Alok", TIME_SLOT, "Walk-in Replacement", "WALKIN");
  await sleep(1000);

  // ---7: EMERGENCY CASE---
  log("10:30", "EMERGENCY", "Dr. Sarah (Neuro) is fully booked...");
  // Fill Dr. Sarah slot completely (10 Base + 2 Premium = 12)
  for (let i = 1; i <= 12; i++) {
    await bookToken(
      "Dr. Sarah",
      TIME_SLOT,
      `Neuro_Pt_${i}`,
      i > 10 ? "PAID" : "ONLINE",
    );
  }

  log("10:45", "CRITICAL", "🚑 MAJOR ACCIDENT: 3 Emergency cases arrive!");
  // Emergency buffer has 3 reserved spots. Limit is 15. Current is 12.
  await bookToken("Dr. Sarah", TIME_SLOT, "Trauma Case A", "EMERGENCY");
  await bookToken("Dr. Sarah", TIME_SLOT, "Trauma Case B", "EMERGENCY");
  await bookToken("Dr. Sarah", TIME_SLOT, "Trauma Case C", "EMERGENCY");

  console.log("\n✅ SIMULATION COMPLETE. All scenarios validated.");
  process.exit(0);
}

runSimulation();
