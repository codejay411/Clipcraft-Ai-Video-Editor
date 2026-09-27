import { MongoClient, Db, ObjectId } from "mongodb";

const MONGO_URL = process.env.MONGODB_URL || "mongodb://127.0.0.1:27017";
const DB_NAME = process.env.MONGODB_DB_NAME || "clipcraft";

let client: MongoClient | null = null;
let connecting: Promise<MongoClient> | null = null;

declare global {
   
  var __mongoClient: MongoClient | undefined;
}

export async function getMongoClient(): Promise<MongoClient> {
  if (global.__mongoClient) {
    client = global.__mongoClient;
    return client;
  }
  if (client) return client;
  if (!connecting) {
    connecting = new MongoClient(MONGO_URL, {
      serverSelectionTimeoutMS: 5000,
      maxPoolSize: 10,
    }).connect();
  }
  client = await connecting;
  global.__mongoClient = client;
  return client;
}

export async function getDb(): Promise<Db> {
  const cl = await getMongoClient();
  return cl.db(DB_NAME);
}

export async function getCollection<T = unknown>(name: string) {
  const db = await getDb();
  return db.collection<T & Document>(name);
}

export function toId(id: string) {
  try {
    return new ObjectId(id);
  } catch {
    return null;
  }
}

export function newId() {
  return new ObjectId().toString();
}
