# 🏥 Medoc OPD Token Allocation Engine
A high-concurrency backend service designed to manage hospital Outpatient Department (OPD) bookings. This system solves the challenge of **Elastic Capacity Management** by implementing priority queuing, distributed locking for concurrency, and dynamic reallocation mechanisms.

---

## 🚀 Key Features

* **⚡ Elastic Capacity Management:** Enforces strict hard limits for standard patients while dynamically expanding capacity for Paid and Emergency cases.
* **🔒 Concurrency Safety:** Utilizes **Redis Distributed Locks (Mutex)** to ensure sequential booking processing, preventing race conditions (double-booking) during high-traffic bursts.
* **📉 Operational Variability:** Automatically handles **Doctor Delays** by proactively reducing slot capacity by 20% to prevent overcrowding.
* **🔄 Dynamic Reallocation:** Instantly frees up and reallocates slots upon **Cancellations** or **No-Shows**.
* **🛡️ Robust Validation:** Uses **Zod** schema validation to ensure data integrity before it reaches the database.

---

## 🛠️ Tech Stack

* **Runtime:** Node.js (Express.js)
* **Database:** MongoDB (Mongoose) - *Chosen for flexible schema design.*
* **Caching/Locking:** Redis (ioredis) - *Chosen for sub-millisecond atomic locking.*
* **Validation:** Zod
* **Simulation:** Axios (for end-to-end scenario testing)

---

## 🧠 System Architecture & Logic



### 1. Prioritization Logic: The "Tiered Capacity" Model
[cite_start]To satisfy the requirement for elastic capacity [cite: 161] [cite_start]while enforcing hard limits[cite: 173], I implemented a **Tiered Buffer System**. Capacity expands based on the priority of the request.

| Priority Tier | Sources | Capacity Limit | Logic |
| :--- | :--- | :--- | :--- |
| **Standard** | `ONLINE`, `WALKIN` | **Base Capacity (10)** | **Hard Limit.** If booked count hits 10, these are rejected immediately. |
| **Premium** | `PAID`, `FOLLOWUP` | **Base + Premium Buffer (12)** | **Elastic.** If Standard is full (10/10), these users access the reserved buffer. |
| **Critical** | `EMERGENCY` | **Base + Premium + Emergency (15)** | **Override.** Trauma cases bypass standard limits, utilizing the maximum emergency reserve. |

### 2. Handling Real-World Edge Cases

#### **A. Concurrency (The Race Condition)**
* **Scenario:** Multiple users (Web + Reception Desk) try to book the last seat at the exact same millisecond.
* **Solution:** I implemented a **Redis Mutex Lock** (`SET key value NX EX 2`).
* **Mechanism:** The system acquires a lock on `doctor_time_slot` before reading the database. This guarantees atomic transactions and data consistency.

#### **B. Doctor Delays**
* **Scenario:** A doctor is running late.
* **Solution:** The `Slot` model includes an `isDelayed` flag. If true, the **Base Capacity is dynamically reduced by 20%** (e.g., 10 → 8). This ensures operational stability.

#### **C. No-Shows & Cancellations**
* **Solution:** When a booking is marked as Cancelled or No-Show, the system performs an atomic decrement on the `bookedCount`.
* [cite_start]**Result:** The slot is immediately available for the next "Walk-in" patient, fulfilling the **Dynamic Reallocation** requirement[cite: 174].

---

## ⚙️ Setup & Installation

### 1. Prerequisites
* Node.js (v14+)
* MongoDB (Local or Atlas)
* Redis (Local or Upstash)

### 2. Installation
```bash
# Clone the repository
git clone [https://github.com/YOUR_USERNAME/medoc-opd-engine.git](https://github.com/YOUR_USERNAME/medoc-opd-engine.git)
cd medoc-opd-engine

# Install dependencies
npm install
