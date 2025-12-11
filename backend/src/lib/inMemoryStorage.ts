// Shared in-memory storage for when database is unavailable
// This ensures all routes access the same data

export const inMemoryUsers = new Map();
export const inMemoryUserCatalogs = new Map();
export const inMemoryProducts = new Map();
export const inMemoryPosts = new Map();
export const inMemoryCheckoutSessions = new Map();

