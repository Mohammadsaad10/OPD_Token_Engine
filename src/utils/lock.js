import redis from "../lib/redis.js";
//Tries to acquire a lock for a specific resource.
//key - unique identifier
//ttl - time to live in seconds
//returns true if lock acquired, false if busy

export const acquireLock = async (key, ttl = 5) => {
  // 'NX': Only set if Not Exists
  // 'EX': Expire after TTL seconds (prevents deadlocks)
  const result = await redis.set(key, "LOCKED", "NX", "EX", ttl);
  return result === "OK";
};

export const releaseLock = async (key) => {
  await redis.del(key);
};
