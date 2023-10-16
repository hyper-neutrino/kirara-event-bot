import { existsSync, readFileSync, writeFileSync } from "node:fs";

export function get() {
    if (!existsSync("data.json")) {
        writeFileSync("data.json", "[]", "utf-8");
        return [];
    }

    return JSON.parse(readFileSync("data.json", "utf-8")) as string[];
}

export function add(id: string) {
    writeFileSync("data.json", JSON.stringify([...get(), id]), "utf-8");
}

export function remove(id: string) {
    writeFileSync("data.json", JSON.stringify(get().filter((x) => x !== id)), "utf-8");
}
