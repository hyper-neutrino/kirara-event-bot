import { MongoClient } from "mongodb";

const client = new MongoClient(Bun.env.DB_URI!);
await client.connect();
const db = client.db(Bun.env.DB_NAME);

export default {
    admins: db.collection<{ id: string }>("admins"),
    messages: db.collection<{ id: string; points: number; remaining: number; modal: boolean }>("messages"),
    users: db.collection<{ id: string; points: number; modals: number }>("users"),
    finds: db.collection<{ user: string; message: string }>("finds"),
} as const;
