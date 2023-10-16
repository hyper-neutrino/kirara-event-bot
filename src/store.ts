import { Database } from "bun:sqlite";

const db = new Database("db.sqlite");

db.query(`CREATE TABLE IF NOT EXISTS ids (id VARCHAR(20) PRIMARY KEY)`).run();

export function checkAndRemove(id: string) {
    const res = db.query(`DELETE FROM ids WHERE id = $id`).all({ $id: id });
    return !!res;
}

export function add(id: string) {
    db.query(`INSERT INTO ids VALUES ($id)`).run({ $id: id });
}

export function remove(id: string) {
    db.query(`DELETE FROM ids WHERE id = $id`).run({ $id: id });
}
